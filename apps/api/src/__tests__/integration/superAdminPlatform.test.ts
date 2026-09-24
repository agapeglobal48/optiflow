// INTEGRATION TEST - requires a real database AND the main seed script
// having been run at least once (permission catalogue + system role
// templates), same precondition createPracticeWithDefaults always has.
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import { createPracticeWithDefaults } from "../../modules/onboarding/practiceService";
import { getSystemHealth, getSupportSummary, listFeatureFlags, setFeatureFlag } from "../../modules/onboarding/platformService";
import { campaignSendQueue } from "../../lib/queue";

describe("super-admin platform operations", () => {
  const createdPracticeIds: string[] = [];

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { practiceId: { in: createdPracticeIds } } });
    await prisma.aiSettings.deleteMany({ where: { practiceId: { in: createdPracticeIds } } });
    await prisma.practiceFeatureFlag.deleteMany({ where: { practiceId: { in: createdPracticeIds } } });
    await prisma.invite.deleteMany({ where: { practiceId: { in: createdPracticeIds } } });
    await prisma.role.deleteMany({ where: { practiceId: { in: createdPracticeIds } } });
    await prisma.practice.deleteMany({ where: { id: { in: createdPracticeIds } } });
    await campaignSendQueue.close();
    await prisma.$disconnect();
  });

  async function makeTestPractice(name: string) {
    const result = await createPracticeWithDefaults({ name, ownerEmail: `owner-${Date.now()}-${Math.random()}@example.test` });
    createdPracticeIds.push(result.practiceId);
    return result.practiceId;
  }

  it("system health excludes the internal platform practice and counts by status", async () => {
    await makeTestPractice("Health Check Practice");

    const [health, expectedTotal] = await Promise.all([
      getSystemHealth(),
      prisma.practice.count({ where: { isPlatform: false } }),
    ]);

    // Proves the internal isPlatform:true practice row (created by the
    // seed script for the platform super-admin) never inflates this count.
    expect(health.practices.total).toBe(expectedTotal);
    expect(health.practices.byStatus.PENDING_SETUP).toBeGreaterThanOrEqual(1);
    expect(health.campaignSendQueue).toHaveProperty("waiting");
    expect(typeof health.webhooks.failedOrDeadLetter).toBe("number");
  });

  it("support summary aggregates practice numbers and logs an audit entry", async () => {
    const practiceId = await makeTestPractice("Support Summary Practice");
    await prisma.customer.create({ data: { practiceId, firstName: "Test Customer" } });

    const summary = await getSupportSummary("superadmin-user-1", practiceId);
    expect(summary.practice.id).toBe(practiceId);
    expect(summary.customersCount).toBe(1);
    expect(summary.staffCount).toBe(0); // owner hasn't accepted their invite yet
    expect(summary.aiSettings?.autoSendEnabled).toBe(true); // schema default

    const auditEntries = await prisma.auditLog.findMany({
      where: { practiceId, action: "superadmin.support_access" },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].userId).toBe("superadmin-user-1");
  });

  it("throws for a nonexistent practice on support summary", async () => {
    await expect(getSupportSummary("superadmin-user-1", "00000000-0000-0000-0000-000000000000")).rejects.toThrow("Practice not found");
  });

  it("new practices get the default feature flags, and they can be toggled", async () => {
    const practiceId = await makeTestPractice("Feature Flags Practice");

    const flags = await listFeatureFlags(practiceId);
    expect(flags.map((f: { key: string }) => f.key).sort()).toEqual(["ai_auto_reply", "external_calendar_sync", "sms_fallback"]);
    expect(flags.every((f: { enabled: boolean }) => f.enabled === false)).toBe(true);

    const updated = await setFeatureFlag(practiceId, "ai_auto_reply", true);
    expect(updated.enabled).toBe(true);

    const flagsAfter = await listFeatureFlags(practiceId);
    const aiFlag = flagsAfter.find((f: { key: string }) => f.key === "ai_auto_reply");
    expect(aiFlag?.enabled).toBe(true);
  });

  it("setFeatureFlag creates a new flag key that wasn't in the defaults", async () => {
    const practiceId = await makeTestPractice("Custom Flag Practice");

    const created = await setFeatureFlag(practiceId, "beta_feature_x", true);
    expect(created.enabled).toBe(true);
    expect(created.key).toBe("beta_feature_x");
  });

  it("throws for a nonexistent practice on feature flag operations", async () => {
    await expect(listFeatureFlags("00000000-0000-0000-0000-000000000000")).rejects.toThrow("Practice not found");
    await expect(setFeatureFlag("00000000-0000-0000-0000-000000000000", "ai_auto_reply", true)).rejects.toThrow("Practice not found");
  });
});
