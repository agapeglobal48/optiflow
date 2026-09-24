// INTEGRATION TEST - requires a real database, same pattern as the other
// integration tests. Also requires Redis reachable (REDIS_URL) since
// launchCampaign queues BullMQ jobs as part of launching.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import {
  createCampaign,
  launchCampaign,
  listCampaignRecipients,
} from "../../modules/campaigns/campaignService";
import { AuthContext } from "../../types/express";
import { campaignSendQueue } from "../../lib/queue";

describe("campaign launch", () => {
  let practiceA: { id: string };
  let practiceB: { id: string };
  let authA: AuthContext;
  let authB: AuthContext;
  let templateId: string;

  beforeAll(async () => {
    practiceA = await prisma.practice.create({ data: { name: "Campaign Test Practice A" } });
    practiceB = await prisma.practice.create({ data: { name: "Campaign Test Practice B" } });

    authA = { userId: "test-user-a", practiceId: practiceA.id, roleId: "n/a", permissions: [] };
    authB = { userId: "test-user-b", practiceId: practiceB.id, roleId: "n/a", permissions: [] };

    const template = await prisma.messageTemplate.create({
      data: {
        practiceId: practiceA.id,
        name: "Test Recall Template",
        channel: "whatsapp",
        providerTemplateName: "test_recall",
        bodyPreview: "Hi {{firstName}}, you're due for an eye test!",
      },
    });
    templateId = template.id;

    // Three customers in practice A: two eligible, one suppressed
    await prisma.customer.createMany({
      data: [
        { practiceId: practiceA.id, firstName: "Alice", mobile: "07700900001", externalId: "camp-a1" },
        { practiceId: practiceA.id, firstName: "Bob", mobile: "07700900002", externalId: "camp-a2" },
        { practiceId: practiceA.id, firstName: "Carla", mobile: "07700900003", externalId: "camp-a3" },
      ],
    });
    await prisma.suppressionEntry.create({
      data: { practiceId: practiceA.id, mobile: "07700900003", reason: "opt_out" },
    });

    // One customer in practice B - should never be reachable from A's campaigns
    await prisma.customer.create({
      data: { practiceId: practiceB.id, firstName: "David", mobile: "07700900099", externalId: "camp-b1" },
    });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({});
    await prisma.campaignRecipient.deleteMany({});
    await prisma.campaign.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.messageTemplate.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.customer.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.suppressionEntry.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.practice.deleteMany({ where: { id: { in: [practiceA.id, practiceB.id] } } });
    await campaignSendQueue.obliterate({ force: true }).catch(() => {});
    await campaignSendQueue.close();
    await prisma.$disconnect();
  });

  it("launches a campaign targeting only the caller's own customers, excluding suppressed ones", async () => {
    const campaign = await createCampaign(authA, {
      name: "Test Eye Test Recall",
      templateTypeKey: "eye_test_recall",
      messageTemplateId: templateId,
      audienceFilter: {},
    });

    const result = await launchCampaign(authA, campaign.id);

    // 2 eligible (Alice, Bob), 1 suppressed (Carla), 0 from practice B
    expect(result.queuedCount).toBe(2);
    expect(result.suppressedCount).toBe(1);

    const recipients = await listCampaignRecipients(authA, campaign.id);
    expect(recipients).toHaveLength(2);
    const names = recipients.map((r: { snapshotName: string }) => r.snapshotName).sort();
    expect(names).toEqual(["Alice", "Bob"]);
  });

  it("does not let practice B see or launch practice A's campaign", async () => {
    const campaign = await createCampaign(authA, {
      name: "Second Campaign",
      templateTypeKey: "eye_test_recall",
      messageTemplateId: templateId,
      audienceFilter: {},
    });

    await expect(launchCampaign(authB, campaign.id)).rejects.toThrow("Resource not found");
  });
});
