import { prisma } from "../../lib/prisma";
import { generateInviteToken, hashInviteToken, inviteExpiry } from "./inviteTokens";
import { hashPassword, validatePasswordStrength } from "../auth/passwordService";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";

export class InviteError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
  }
}

interface CreateInviteInput {
  email: string;
  roleId: string;
}

// Used both for super-admin-issued owner invites (practiceId comes from
// the newly created practice, no auth context yet) and for staff-issued
// invites (practiceId comes from the inviting staff member's own tenant).
export async function createInvite(
  practiceId: string,
  input: CreateInviteInput,
  invitedByUserId?: string,
): Promise<{ inviteId: string; rawToken: string; expiresAt: Date }> {
  // Role must belong to this practice (or be null/system - but roles
  // assignable to users are always practice-scoped clones in this system).
  const role = await prisma.role.findFirst({ where: { id: input.roleId, practiceId } });
  if (!role) {
    throw new InviteError("Role not found for this practice", "ROLE_NOT_FOUND", 404);
  }

  const existingUser = await prisma.user.findFirst({
    where: { practiceId, email: input.email, deletedAt: null },
  });
  if (existingUser) {
    throw new InviteError("A user with this email already exists in this practice", "USER_EXISTS", 409);
  }

  const { raw, hash } = generateInviteToken();
  const expiresAt = inviteExpiry();

  const invite = await prisma.invite.create({
    data: {
      practiceId,
      email: input.email,
      roleId: input.roleId,
      tokenHash: hash,
      expiresAt,
      invitedByUserId,
    },
  });

  // NOTE: actual email delivery is not wired up yet (no provider chosen).
  // For now the raw token/link is returned to the caller so it can be
  // manually shared. This is the natural seam where an email provider
  // (spec's provider-abstraction principle) gets plugged in later.
  return { inviteId: invite.id, rawToken: raw, expiresAt };
}

export async function listInvites(auth: AuthContext) {
  return prisma.invite.findMany({
    where: withTenant(auth, { revokedAt: null }),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      roleId: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
    },
  });
}

export async function revokeInvite(auth: AuthContext, inviteId: string): Promise<void> {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) throw new InviteError("Invite not found", "INVITE_NOT_FOUND", 404);
  assertSameTenant(auth, invite.practiceId);

  await prisma.invite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
}

// Public preview - lets the frontend show "You're joining {practice} as
// {role}" on the accept-invite page before the person sets a password.
// Deliberately returns minimal info (no internal IDs beyond what's needed).
export async function previewInvite(rawToken: string) {
  const hash = hashInviteToken(rawToken);
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hash },
    include: { practice: { select: { name: true } }, role: { select: { name: true } } },
  });

  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new InviteError("This invite is invalid or has expired", "INVITE_INVALID", 410);
  }

  return {
    email: invite.email,
    practiceName: invite.practice.name,
    roleName: invite.role.name,
  };
}

interface AcceptInviteInput {
  rawToken: string;
  firstName: string;
  lastName: string;
  password: string;
}

export async function acceptInvite(input: AcceptInviteInput): Promise<{ userId: string }> {
  const hash = hashInviteToken(input.rawToken);

  const invite = await prisma.invite.findUnique({ where: { tokenHash: hash } });

  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw new InviteError("This invite is invalid or has expired", "INVITE_INVALID", 410);
  }

  const strength = validatePasswordStrength(input.password);
  if (!strength.valid) {
    throw new InviteError(strength.reason ?? "Password too weak", "WEAK_PASSWORD");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx: typeof prisma) => {
    const createdUser = await tx.user.create({
      data: {
        practiceId: invite.practiceId,
        email: invite.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        roleId: invite.roleId,
        isActive: true,
      },
    });

    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

    await tx.auditLog.create({
      data: {
        practiceId: invite.practiceId,
        userId: createdUser.id,
        action: "invite.accepted",
        entityType: "User",
        entityId: createdUser.id,
      },
    });

    return createdUser;
  });

  return { userId: user.id };
}
