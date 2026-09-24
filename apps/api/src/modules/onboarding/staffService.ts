import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";
import { revokeAllSessionsForUser } from "../auth/authService";

export class StaffError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
  }
}

// Roles available to this practice, for the "assign a role" dropdown on both
// the invite form and the existing-staff editor. Practice-scoped clones only
// (see roleCloning.ts) - system/global templates (practiceId null) are never
// directly assignable.
export async function listRoles(auth: AuthContext) {
  return prisma.role.findMany({
    where: { practiceId: auth.practiceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });
}

export async function listStaffUsers(auth: AuthContext) {
  return prisma.user.findMany({
    where: withTenant(auth, { deletedAt: null }),
    orderBy: [{ isActive: "desc" }, { firstName: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      createdAt: true,
      role: { select: { id: true, name: true } },
    },
  });
}

interface UpdateStaffUserInput {
  roleId?: string;
  isActive?: boolean;
}

// Spec 5.1: session revocation is required whenever a staff member's role
// changes or they are disabled, so any active session stops working
// immediately rather than on next token expiry.
export async function updateStaffUser(auth: AuthContext, userId: string, input: UpdateStaffUserInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new StaffError("Staff member not found", "USER_NOT_FOUND", 404);
  }
  assertSameTenant(auth, user.practiceId);

  if (input.isActive === false && userId === auth.userId) {
    throw new StaffError("You cannot deactivate your own account", "SELF_DEACTIVATE", 400);
  }

  if (input.roleId) {
    const role = await prisma.role.findFirst({ where: { id: input.roleId, practiceId: auth.practiceId } });
    if (!role) {
      throw new StaffError("Role not found for this practice", "ROLE_NOT_FOUND", 404);
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.roleId ? { roleId: input.roleId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      createdAt: true,
      role: { select: { id: true, name: true } },
    },
  });

  const roleChanged = !!input.roleId && input.roleId !== user.roleId;
  if (roleChanged || input.isActive === false) {
    await revokeAllSessionsForUser(userId);
  }

  await prisma.auditLog.create({
    data: {
      practiceId: auth.practiceId,
      userId: auth.userId,
      action: "staff.updated",
      entityType: "User",
      entityId: userId,
    },
  });

  return updated;
}
