// Cross-tenant platform operations for super-admin staff - the ONLY module
// in the codebase (alongside practiceService.ts) allowed to query across
// practices without a practiceId scope. Every route that calls into this
// file must be gated by a superadmin:* permission (see rbac/permissions.ts)
// and never by a practice-scoped role, no matter how senior.
import { prisma } from "../../lib/prisma";
import { campaignSendQueue } from "../../lib/queue";

function notFound(message: string): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = 404;
  return err;
}

/**
 * Platform-wide operational snapshot: practice counts by status, recent
 * webhook/message failures, campaign-send queue depth, and how many
 * practices currently have their AI auto-send kill switch OFF. This is
 * "is anything on fire right now", not business reporting (that's Phase
 * 9's practice-scoped /api/reports/*).
 */
export async function getSystemHealth() {
  interface StatusCount {
    status: string;
    _count: number;
  }

  const [practicesByStatus, failedOrDeadLetterWebhooks, failedMessages, queueCounts, killSwitchedPractices, totalActivePractices] =
    await Promise.all([
      prisma.practice.groupBy({ by: ["status"], where: { isPlatform: false }, _count: true }) as unknown as Promise<StatusCount[]>,
      prisma.webhookEvent.count({ where: { status: { in: ["failed", "dead_letter"] } } }),
      prisma.message.count({ where: { status: "failed" } }),
      campaignSendQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
      prisma.aiSettings.count({ where: { autoSendEnabled: false } }),
      prisma.practice.count({ where: { isPlatform: false, status: "ACTIVE" } }),
    ]);

  return {
    generatedAt: new Date(),
    practices: {
      total: practicesByStatus.reduce((sum: number, p: StatusCount) => sum + p._count, 0),
      active: totalActivePractices,
      byStatus: Object.fromEntries(practicesByStatus.map((p: StatusCount) => [p.status, p._count])),
    },
    webhooks: {
      failedOrDeadLetter: failedOrDeadLetterWebhooks,
    },
    messages: {
      failed: failedMessages,
    },
    campaignSendQueue: queueCounts,
    ai: {
      practicesWithAutoSendOff: killSwitchedPractices,
    },
  };
}

/**
 * A read-only, cross-tenant summary of one practice for support purposes -
 * enough to help a customer without needing to log in as them. Every call
 * is written to AuditLog (practice-scoped, so it shows up in that
 * practice's own audit trail too) since silent cross-tenant access to a
 * customer's data is exactly the kind of thing spec 14's audit
 * requirements exist to catch.
 */
export async function getSupportSummary(superAdminUserId: string, practiceId: string) {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { id: true, name: true, status: true, timezone: true, defaultAppointmentValue: true, whatsappPhoneNumberId: true, createdAt: true },
  });
  if (!practice) throw notFound("Practice not found");

  const [staffCount, customersCount, activeCampaignsCount, openConversationsCount, aiSettings, branches] = await Promise.all([
    prisma.user.count({ where: { practiceId } }),
    prisma.customer.count({ where: { practiceId, deletedAt: null } }),
    prisma.campaign.count({ where: { practiceId, status: { in: ["SCHEDULED", "RUNNING", "PAUSED"] } } }),
    prisma.conversation.count({ where: { practiceId, status: { in: ["HUMAN_QUEUE", "WAITING_ON_CUSTOMER", "AI_HANDLING"] } } }),
    prisma.aiSettings.findUnique({ where: { practiceId }, select: { autoSendEnabled: true, confidenceThreshold: true } }),
    prisma.branch.count({ where: { practiceId, deletedAt: null } }),
  ]);

  await prisma.auditLog.create({
    data: {
      practiceId,
      userId: superAdminUserId,
      action: "superadmin.support_access",
      entityType: "Practice",
      entityId: practiceId,
    },
  });

  return {
    practice,
    staffCount,
    branchCount: branches,
    customersCount,
    activeCampaignsCount,
    openConversationsCount,
    aiSettings,
  };
}

export async function listFeatureFlags(practiceId: string) {
  const practice = await prisma.practice.findUnique({ where: { id: practiceId }, select: { id: true } });
  if (!practice) throw notFound("Practice not found");

  return prisma.practiceFeatureFlag.findMany({ where: { practiceId }, orderBy: { key: "asc" } });
}

export async function setFeatureFlag(practiceId: string, key: string, enabled: boolean) {
  const practice = await prisma.practice.findUnique({ where: { id: practiceId }, select: { id: true } });
  if (!practice) throw notFound("Practice not found");

  return prisma.practiceFeatureFlag.upsert({
    where: { practiceId_key: { practiceId, key } },
    update: { enabled },
    create: { practiceId, key, enabled },
  });
}
