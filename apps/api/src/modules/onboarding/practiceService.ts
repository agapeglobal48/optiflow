import { prisma } from "../../lib/prisma";
import { cloneSystemRoleForPractice } from "../rbac/roleCloning";
import { DEFAULT_FEATURE_FLAGS } from "../../config/featureFlags";
import { createInvite } from "./inviteService";

interface CreatePracticeInput {
  name: string;
  timezone?: string;
  defaultAppointmentValue?: number;
  ownerEmail: string;
}

interface CreatePracticeResult {
  practiceId: string;
  ownerInvite: { rawToken: string; expiresAt: Date };
}

// Everything a practice needs to exist safely from message one: a
// Practice-Admin role clone (so the owner has full but bounded permissions,
// not superuser), default AI settings with the kill switch respected,
// default feature flags, and an invite for the owner rather than a
// pre-set password (per spec 5.1 pattern - nobody sets another person's
// password).
export async function createPracticeWithDefaults(
  input: CreatePracticeInput,
): Promise<CreatePracticeResult> {
  const practice = await prisma.practice.create({
    data: {
      name: input.name,
      timezone: input.timezone ?? "Europe/London",
      status: "PENDING_SETUP",
      defaultAppointmentValue: input.defaultAppointmentValue,
    },
  });

  const ownerRole = await cloneSystemRoleForPractice("PRACTICE_ADMIN", practice.id);

  await prisma.aiSettings.create({
    data: { practiceId: practice.id }, // uses schema defaults: autoSendEnabled true, threshold 0.75
  });

  await prisma.practiceFeatureFlag.createMany({
    data: DEFAULT_FEATURE_FLAGS.map((f) => ({ practiceId: practice.id, key: f.key, enabled: f.enabled })),
  });

  const invite = await createInvite(practice.id, { email: input.ownerEmail, roleId: ownerRole.id });

  await prisma.auditLog.create({
    data: {
      practiceId: practice.id,
      action: "practice.created",
      entityType: "Practice",
      entityId: practice.id,
    },
  });

  return {
    practiceId: practice.id,
    ownerInvite: { rawToken: invite.rawToken, expiresAt: invite.expiresAt },
  };
}

export async function listPractices() {
  return prisma.practice.findMany({
    where: { isPlatform: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, timezone: true, createdAt: true },
  });
}

export async function getPractice(practiceId: string) {
  return prisma.practice.findUnique({
    where: { id: practiceId },
    include: { branches: true },
  });
}

export async function updatePracticeStatus(practiceId: string, status: "ACTIVE" | "SUSPENDED" | "CANCELLED") {
  return prisma.practice.update({ where: { id: practiceId }, data: { status } });
}
