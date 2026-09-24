// INTEGRATION TEST - requires a real database and Redis (WHATSAPP_PROVIDER
// should be "mock" for this, which is the .env.example default).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import { createCampaign, launchCampaign } from "../../modules/campaigns/campaignService";
import { processCampaignSendJob } from "../../modules/messaging/campaignSendProcessor";
import { parseWebhookPayload } from "../../modules/messaging/webhookPayloadParsing";
import { processWebhookEvents } from "../../modules/messaging/webhookService";
import { AuthContext } from "../../types/express";
import { campaignSendQueue } from "../../lib/queue";

describe("messaging pipeline: send -> webhook status -> inbound reply", () => {
  let practiceA: { id: string };
  let practiceB: { id: string };
  let authA: AuthContext;
  let customerA: { id: string; mobile: string | null };
  let templateId: string;
  let recipientId: string;

  const PHONE_NUMBER_ID = "test-phone-a";

  beforeAll(async () => {
    practiceA = await prisma.practice.create({
      data: { name: "Messaging Test Practice A", whatsappPhoneNumberId: PHONE_NUMBER_ID },
    });
    practiceB = await prisma.practice.create({ data: { name: "Messaging Test Practice B" } });
    authA = { userId: "test-user-a", practiceId: practiceA.id, roleId: "n/a", permissions: [] };

    const template = await prisma.messageTemplate.create({
      data: {
        practiceId: practiceA.id,
        name: "Test Template",
        channel: "whatsapp",
        providerTemplateName: "test_template",
        bodyPreview: "Hi {{firstName}}, this is a test message.",
      },
    });
    templateId = template.id;

    customerA = await prisma.customer.create({
      data: { practiceId: practiceA.id, firstName: "Eve", mobile: "447700900222", externalId: "msg-a1" },
    });
  });

  afterAll(async () => {
    await prisma.webhookEvent.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.conversation.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.campaignRecipient.deleteMany({});
    await prisma.campaign.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.messageTemplate.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.customer.deleteMany({ where: { practiceId: { in: [practiceA.id, practiceB.id] } } });
    await prisma.practice.deleteMany({ where: { id: { in: [practiceA.id, practiceB.id] } } });
    await campaignSendQueue.obliterate({ force: true }).catch(() => {});
    await campaignSendQueue.close();
    await prisma.$disconnect();
  });

  it("launches a campaign and the worker logic sends and records a message", async () => {
    const campaign = await createCampaign(authA, {
      name: "Test Send Campaign",
      templateTypeKey: "eye_test_recall",
      messageTemplateId: templateId,
      audienceFilter: {},
    });

    await launchCampaign(authA, campaign.id);

    const recipient = await prisma.campaignRecipient.findFirstOrThrow({
      where: { campaignId: campaign.id },
    });
    recipientId = recipient.id;

    expect(recipient.snapshotContact).toBe("447700900222");

    // Directly invoke the same function the BullMQ worker calls - this
    // proves the processing logic itself is correct without needing a
    // live worker process running during the test.
    await processCampaignSendJob({ recipientId: recipient.id, campaignId: campaign.id });

    const updated = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
    expect(updated.status).toBe("sent");
    expect(updated.sentAt).not.toBeNull();

    const message = await prisma.message.findFirstOrThrow({ where: { campaignRecipientId: recipient.id } });
    expect(message.body).toBe("Hi Eve, this is a test message.");
    expect(message.direction).toBe("OUTBOUND");
    expect(message.providerMessageId).toMatch(/^mock-/);
  });

  it("processes a webhook delivery status update and links it to the sent message", async () => {
    const message = await prisma.message.findFirstOrThrow({ where: { campaignRecipientId: recipientId } });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                statuses: [{ id: message.providerMessageId, status: "delivered", timestamp: "1735689600" }],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const events = parseWebhookPayload(payload);
    await processWebhookEvents(events, payload);

    const updatedMessage = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(updatedMessage.status).toBe("delivered");

    const updatedRecipient = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipientId } });
    expect(updatedRecipient.deliveredAt).not.toBeNull();
  });

  it("processing the same webhook status event twice does not error or double-apply", async () => {
    const message = await prisma.message.findFirstOrThrow({ where: { campaignRecipientId: recipientId } });

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                statuses: [{ id: message.providerMessageId, status: "delivered", timestamp: "1735689600" }],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const events = parseWebhookPayload(payload);
    // Should not throw, and should be silently skipped as a duplicate.
    await expect(processWebhookEvents(events, payload)).resolves.not.toThrow();

    const dedupedCount = await prisma.webhookEvent.count({
      where: { providerEventId: `${message.providerMessageId}:delivered` },
    });
    expect(dedupedCount).toBe(1); // only recorded once despite processing twice
  });

  it("processes an inbound reply, creates a conversation, and attributes it to the campaign", async () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                contacts: [{ profile: { name: "Eve" }, wa_id: customerA.mobile }],
                messages: [
                  {
                    id: "wamid.TEST-REPLY-1",
                    from: customerA.mobile,
                    timestamp: "1735689700",
                    type: "text",
                    text: { body: "Yes, book me in please" },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const events = parseWebhookPayload(payload);
    await processWebhookEvents(events, payload);

    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { practiceId: practiceA.id, customerId: customerA.id },
    });
    expect(conversation.status).toBe("HUMAN_QUEUE");
    expect(conversation.unreadCount).toBe(1);

    const inboundMessage = await prisma.message.findFirstOrThrow({
      where: { conversationId: conversation.id, direction: "INBOUND" },
    });
    expect(inboundMessage.body).toBe("Yes, book me in please");

    const recipient = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipientId } });
    expect(recipient.repliedAt).not.toBeNull();
  });

  it("does not let a webhook for practice A's phone number affect practice B's data", async () => {
    // practiceB has no whatsappPhoneNumberId set, so any webhook for
    // PHONE_NUMBER_ID (which belongs to practiceA) should never touch it.
    const practiceBConversations = await prisma.conversation.count({ where: { practiceId: practiceB.id } });
    expect(practiceBConversations).toBe(0);
  });
});
