import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";
import {
  parseCsvBuffer,
  autoDetectMapping,
  applyMapping,
  validateMappedRow,
  ColumnMapping,
} from "./csvParsing";

interface RowError {
  row: number;
  message: string;
}

interface ImportSummary {
  batchId: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: RowError[];
  warnings: RowError[];
}

interface ImportOptions {
  filename: string;
  buffer: Buffer;
  branchId?: string;
  mapping?: ColumnMapping; // overrides/extends auto-detected mapping per field
}

export class ImportError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
  }
}

const MAX_ROWS = 20_000; // MVP guardrail - larger files should move to a background job (Phase 4+ territory)

export async function importCustomersFromCsv(
  auth: AuthContext,
  options: ImportOptions,
): Promise<ImportSummary> {
  const { headers, records } = parseCsvBuffer(options.buffer);

  if (records.length === 0) {
    throw new ImportError("CSV file has no data rows", "EMPTY_FILE");
  }
  if (records.length > MAX_ROWS) {
    throw new ImportError(
      `File has ${records.length} rows, which exceeds the ${MAX_ROWS} row limit for a single import`,
      "TOO_MANY_ROWS",
    );
  }

  // Branch, if given, must belong to this tenant - checked once up front
  // rather than per-row.
  if (options.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: options.branchId } });
    if (!branch || branch.deletedAt) {
      throw new ImportError("Branch not found", "BRANCH_NOT_FOUND", 404);
    }
    assertSameTenant(auth, branch.practiceId);
  }

  const detectedMapping = autoDetectMapping(headers);
  const mapping = { ...detectedMapping, ...options.mapping };

  if (!mapping.firstName) {
    throw new ImportError(
      "Could not identify a 'first name' column in this CSV. Provide an explicit column mapping.",
      "NO_NAME_COLUMN",
    );
  }

  const errors: RowError[] = [];
  const warnings: RowError[] = [];
  let importedCount = 0;
  let updatedCount = 0;

  // Pre-fetch the suppression list once (practices' lists are small - a
  // few hundred to low thousands of entries) rather than querying per row.
  const suppressions = await prisma.suppressionEntry.findMany({
    where: withTenant(auth, {}),
    select: { mobile: true, email: true },
  });
  const suppressedMobiles = new Set(
    suppressions.map((s: { mobile: string | null }) => s.mobile).filter(Boolean),
  );
  const suppressedEmails = new Set(
    suppressions.map((s: { email: string | null }) => s.email).filter(Boolean),
  );

  for (let i = 0; i < records.length; i++) {
    const rowNumber = i + 1; // 1-indexed data row, header excluded
    const mappedRow = applyMapping(records[i], mapping);
    const validation = validateMappedRow(mappedRow);

    for (const w of validation.warnings) {
      warnings.push({ row: rowNumber, message: w });
    }

    if (!validation.valid) {
      for (const e of validation.errors) {
        errors.push({ row: rowNumber, message: e });
      }
      continue;
    }

    const isSuppressed =
      (mappedRow.mobile && suppressedMobiles.has(mappedRow.mobile)) ||
      (mappedRow.email && suppressedEmails.has(mappedRow.email));

    const customerData = {
      practiceId: auth.practiceId,
      branchId: options.branchId,
      firstName: mappedRow.firstName!.trim(),
      lastName: mappedRow.lastName?.trim(),
      email: mappedRow.email?.trim(),
      mobile: mappedRow.mobile?.trim(),
      externalId: mappedRow.externalId?.trim(),
      recallDueDate: validation.recallDueDate ?? undefined,
      appointmentType: mappedRow.appointmentType?.trim(),
      consentStatus: isSuppressed ? ("OPTED_OUT" as const) : ("UNKNOWN" as const),
      importSource: options.filename,
    };

    try {
      if (customerData.externalId) {
        // Idempotent: re-importing the same export updates existing
        // customers instead of duplicating them (relies on the
        // @@unique([practiceId, externalId]) constraint in the schema).
        const existing = await prisma.customer.findUnique({
          where: { practiceId_externalId: { practiceId: auth.practiceId, externalId: customerData.externalId } },
        });

        await prisma.customer.upsert({
          where: {
            practiceId_externalId: { practiceId: auth.practiceId, externalId: customerData.externalId },
          },
          create: customerData,
          update: customerData,
        });

        if (existing) updatedCount++;
        else importedCount++;
      } else {
        // No external ID to dedup on. Fall back to matching an existing,
        // non-deleted customer in this practice by mobile (the primary
        // WhatsApp contact channel) and then by email, so re-importing an
        // updated export for the same person updates their record instead
        // of creating a duplicate. Deliberately exact-match only - no
        // fuzzy name matching, which would risk merging two different
        // people.
        const existing = customerData.mobile
          ? await prisma.customer.findFirst({
              where: { practiceId: auth.practiceId, deletedAt: null, mobile: customerData.mobile },
            })
          : customerData.email
            ? await prisma.customer.findFirst({
                where: { practiceId: auth.practiceId, deletedAt: null, email: customerData.email },
              })
            : null;

        if (existing) {
          await prisma.customer.update({ where: { id: existing.id }, data: customerData });
          updatedCount++;
        } else {
          await prisma.customer.create({ data: customerData });
          importedCount++;
        }
      }
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : "Unknown error saving this row",
      });
    }
  }

  const batch = await prisma.importBatch.create({
    data: {
      practiceId: auth.practiceId,
      filename: options.filename,
      status: "completed",
      totalRows: records.length,
      importedCount,
      updatedCount,
      skippedCount: errors.length,
      errors: errors as unknown as object,
      warnings: warnings as unknown as object,
      createdByUserId: auth.userId,
      completedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      practiceId: auth.practiceId,
      userId: auth.userId,
      action: "customers.import",
      entityType: "ImportBatch",
      entityId: batch.id,
      metadata: { totalRows: records.length, importedCount, updatedCount, skippedCount: errors.length },
    },
  });

  return {
    batchId: batch.id,
    totalRows: records.length,
    importedCount,
    updatedCount,
    skippedCount: errors.length,
    errors,
    warnings,
  };
}

export async function listImportBatches(auth: AuthContext) {
  return prisma.importBatch.findMany({
    where: withTenant(auth, {}),
    orderBy: { createdAt: "desc" },
  });
}

export async function getImportBatch(auth: AuthContext, batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    const err = new Error("Import batch not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, batch.practiceId);
  return batch;
}
