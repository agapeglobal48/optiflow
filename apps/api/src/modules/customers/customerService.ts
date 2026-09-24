import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";

interface ListCustomersOptions {
  page?: number;
  pageSize?: number;
  search?: string; // matches against firstName/lastName/email/mobile
}

export async function listCustomers(auth: AuthContext, options: ListCustomersOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));

  const where = withTenant(auth, {
    deletedAt: null,
    ...(options.search
      ? {
          OR: [
            { firstName: { contains: options.search, mode: "insensitive" as const } },
            { lastName: { contains: options.search, mode: "insensitive" as const } },
            { email: { contains: options.search, mode: "insensitive" as const } },
            { mobile: { contains: options.search } },
          ],
        }
      : {}),
  });

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return { total, page, pageSize, customers };
}

export async function getCustomer(auth: AuthContext, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.deletedAt) {
    const err = new Error("Customer not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, customer.practiceId);
  return customer;
}

export class CustomerError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
  }
}

interface CustomerInput {
  branchId?: string | null;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  mobile?: string | null;
  preferredChannel?: string | null;
  recallDueDate?: Date | null;
  appointmentType?: string | null;
  consentStatus?: "OPTED_IN" | "OPTED_OUT" | "UNKNOWN";
}

async function assertBranchInPractice(auth: AuthContext, branchId: string | null | undefined): Promise<void> {
  if (!branchId) return;
  const branch = await prisma.branch.findFirst({ where: { id: branchId, practiceId: auth.practiceId } });
  if (!branch) {
    throw new CustomerError("Branch not found for this practice", "BRANCH_NOT_FOUND", 404);
  }
}

// Manual create/edit/delete, distinct from the CSV import path in
// importService.ts (which has its own dedup-on-import logic) - these are
// for one-off corrections and additions staff make directly in the UI.
export async function createCustomer(auth: AuthContext, input: CustomerInput) {
  await assertBranchInPractice(auth, input.branchId);
  return prisma.customer.create({
    data: {
      practiceId: auth.practiceId,
      branchId: input.branchId ?? undefined,
      firstName: input.firstName,
      lastName: input.lastName ?? undefined,
      email: input.email ?? undefined,
      mobile: input.mobile ?? undefined,
      preferredChannel: input.preferredChannel ?? undefined,
      recallDueDate: input.recallDueDate ?? undefined,
      appointmentType: input.appointmentType ?? undefined,
      consentStatus: input.consentStatus ?? undefined,
    },
  });
}

export async function updateCustomer(auth: AuthContext, customerId: string, input: Partial<CustomerInput>) {
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing || existing.deletedAt) {
    throw new CustomerError("Customer not found", "CUSTOMER_NOT_FOUND", 404);
  }
  assertSameTenant(auth, existing.practiceId);
  if (input.branchId !== undefined) {
    await assertBranchInPractice(auth, input.branchId);
  }

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
      ...(input.preferredChannel !== undefined ? { preferredChannel: input.preferredChannel } : {}),
      ...(input.recallDueDate !== undefined ? { recallDueDate: input.recallDueDate } : {}),
      ...(input.appointmentType !== undefined ? { appointmentType: input.appointmentType } : {}),
      ...(input.consentStatus !== undefined ? { consentStatus: input.consentStatus } : {}),
    },
  });
}

export async function deleteCustomer(auth: AuthContext, customerId: string): Promise<void> {
  const existing = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!existing || existing.deletedAt) {
    throw new CustomerError("Customer not found", "CUSTOMER_NOT_FOUND", 404);
  }
  assertSameTenant(auth, existing.practiceId);
  await prisma.customer.update({ where: { id: customerId }, data: { deletedAt: new Date() } });
}
