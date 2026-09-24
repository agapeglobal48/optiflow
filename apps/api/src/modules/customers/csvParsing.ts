import { parse } from "csv-parse/sync";

// The customer fields a CSV row can map onto. Deliberately mirrors only the
// non-clinical Customer columns from the schema.
export interface MappedCustomerRow {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  externalId?: string;
  recallDueDate?: string;
  appointmentType?: string;
}

export type ColumnMapping = Partial<Record<keyof MappedCustomerRow, string>>;

// Common header spellings seen across different practice-management exports.
// Matching is done on a normalized (lowercased, punctuation-stripped)
// version of the header, so "First Name", "first_name", and "FirstName"
// all resolve to the same thing.
const FIELD_ALIASES: Record<keyof MappedCustomerRow, string[]> = {
  firstName: ["firstname", "first", "givenname", "forename"],
  lastName: ["lastname", "last", "surname", "familyname"],
  email: ["email", "emailaddress", "e-mail"],
  mobile: ["mobile", "mobilenumber", "phone", "phonenumber", "cell", "cellphone"],
  externalId: ["externalid", "id", "patientid", "customerid", "recordid"],
  recallDueDate: ["recallduedate", "recalldate", "duedate", "nextexam", "examdue"],
  appointmentType: ["appointmenttype", "type", "service", "examtype"],
};

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Best-effort automatic mapping based on header names. Returned mapping can
// be overridden per-field by the caller (see importService) for exports
// with unusual column names the aliases don't cover.
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = headers.map((h) => ({ original: h, normalized: normalizeHeader(h) }));

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
    keyof MappedCustomerRow,
    string[],
  ][]) {
    const match = normalizedHeaders.find((h) => aliases.includes(h.normalized));
    if (match) {
      mapping[field] = match.original;
    }
  }

  return mapping;
}

export interface ParsedCsv {
  headers: string[];
  records: Record<string, string>[];
}

export function parseCsvBuffer(buffer: Buffer): ParsedCsv {
  const records: Record<string, string>[] = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  return { headers, records };
}

export function applyMapping(record: Record<string, string>, mapping: ColumnMapping): MappedCustomerRow {
  const result: MappedCustomerRow = {};
  for (const [field, sourceColumn] of Object.entries(mapping) as [keyof MappedCustomerRow, string][]) {
    const value = record[sourceColumn];
    if (value !== undefined && value !== "") {
      result[field] = value;
    }
  }
  return result;
}

// Loose date parsing - accepts common formats (ISO, DD/MM/YYYY, MM/DD/YYYY,
// "12 Jan 2026" etc). Returns null rather than throwing on unparsable
// input, since a bad date shouldn't fail the whole row.
export function parseLooseDate(value: string): Date | null {
  const isoAttempt = new Date(value);
  if (!isNaN(isoAttempt.getTime())) {
    return isoAttempt;
  }

  const dmyMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const attempt = new Date(year, Number(m) - 1, Number(d));
    if (!isNaN(attempt.getTime())) return attempt;
  }

  return null;
}

export interface RowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  recallDueDate: Date | null;
}

// Business rules for what makes an importable row (spec 5.3): a name and
// at least one way to actually reach the customer. Everything else is
// optional and best-effort.
export function validateMappedRow(row: MappedCustomerRow): RowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let recallDueDate: Date | null = null;

  if (!row.firstName || row.firstName.trim() === "") {
    errors.push("Missing first name");
  }

  if ((!row.mobile || row.mobile.trim() === "") && (!row.email || row.email.trim() === "")) {
    errors.push("Row has neither a mobile number nor an email - no way to contact this customer");
  }

  if (row.recallDueDate) {
    recallDueDate = parseLooseDate(row.recallDueDate);
    if (!recallDueDate) {
      warnings.push(`Could not parse recall due date "${row.recallDueDate}" - left blank`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, recallDueDate };
}
