import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";

interface BranchInput {
  name: string;
  address?: string;
  contactPhone?: string;
  contactEmail?: string;
  workingHours?: unknown;
}

export async function listBranches(auth: AuthContext) {
  return prisma.branch.findMany({
    where: withTenant(auth, { deletedAt: null }),
    orderBy: { name: "asc" },
  });
}

export async function getBranch(auth: AuthContext, branchId: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.deletedAt) {
    const err = new Error("Branch not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, branch.practiceId);
  return branch;
}

export async function createBranch(auth: AuthContext, input: BranchInput) {
  return prisma.branch.create({
    data: {
      practiceId: auth.practiceId,
      name: input.name,
      address: input.address,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      workingHours: input.workingHours as never,
    },
  });
}

export async function updateBranch(auth: AuthContext, branchId: string, input: Partial<BranchInput>) {
  // Ensures the branch belongs to this tenant BEFORE writing to it.
  await getBranch(auth, branchId);

  return prisma.branch.update({
    where: { id: branchId },
    data: {
      name: input.name,
      address: input.address,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      workingHours: input.workingHours as never,
    },
  });
}

export async function deleteBranch(auth: AuthContext, branchId: string): Promise<void> {
  await getBranch(auth, branchId);
  await prisma.branch.update({ where: { id: branchId }, data: { deletedAt: new Date() } });
}
