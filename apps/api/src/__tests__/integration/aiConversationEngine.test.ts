// INTEGRATION TEST - requires a real database and Redis (AI_PROVIDER and
// WHATSAPP_PROVIDER should both be "mock", which are the defaults).
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import { handleInboundMessageForAi } from "../../modules/ai/aiConversationService";
import { campaignSendQueue } from "../../lib/queue";

describe("AI conversation engine", () => {
  let practiceA: { id: string; name: string };
  let practiceB: { id: string; name: string };
  let customerA: { id: string; firstName: string };

  async function freshConversation(practiceId: string, customerId: string) {
    return prisma.conversation.create({ data: { practiceId, customerId } });
  }

  async function saveInboundMessage(conversationId: string, body: string) {
    return prisma.message.create({
      data: { conversationId, direction: "INBOUND", sender: "CUSTOMER", channel: "whatsapp", body, status: "delivered" },
    });
  }

  beforeEach(async () => {
    practiceA = await prisma.practice.create({ data: { name: "AI Test Practice A" } });
    practiceB = await prisma.practice.create({ data: { name: "AI Test Practice B" } });
    await prisma.aiSettings.create({ data: { practiceId: practiceA.id } });
    await prisma.aiSettings.create({ data: { practiceId: practiceB.id } });

    customerA = await prisma.customer.create({
      data: { practiceId: practiceA.id, firstName: "Jane", mobile: "447700900777" },
    });
  });

  afterAll(async () => {
    await campaignSendQueue.obliterate({ force: true }).catch(() => {});
    await campaignSendQueue.close();
    await prisma.$disconnect();
  });

  it("auto-sends a reply when confidence is high and every guardrail passes", async () => {
    const conversation = await freshConversation(practiceA.id, customerA.id);
    await saveInboundMessage(conversation.id, "Yes I'd like to book please");

    await handleInboundMessageForAi({
      practiceId: practiceA.id,
      practiceName: practiceA.name,
      conversationId: conversation.id,
      customerId: customerA.id,
      customerFirstName: customerA.firstName,
      customerContact: "447700900777",
      channel: "whatsapp",
      inboundMessageText: "Yes I'd like to book please",
    });

    const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(updated.status).toBe("WAITING_ON_CUSTOMER");

    const aiMessage = await prisma.message.findFirst({ where: { conversationId: conversation.id, sender: "AI" } });
    expect(aiMessage).not.toBeNull();
    expect(aiMessage?.aiModel).toBe("mock-ai-v1");
    expect(aiMessage?.aiPromptVersion).toBe("v1");
    expect(Number(aiMessage?.aiConfidence)).toBeGreaterThan(0.75);
  });

  it("escalates to human queue when confidence is below threshold", async () => {
    const conversation = await freshConversation(practiceA.id, customerA.id);
    await saveInboundMessage(conversation.id, "What's the weather like today?");

    await handleInboundMessageForAi({
      practiceId: practiceA.id,
      practiceName: practiceA.name,
      conversationId: conversation.id,
      customerId: customerA.id,
      customerFirstName: customerA.firstName,
      customerContact: "447700900777",
      channel: "whatsapp",
      inboundMessageText: "What's the weather like today?",
    });

    const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(updated.status).toBe("HUMAN_QUEUE");

    const aiMessage = await prisma.message.findFirst({ where: { conversationId: conversation.id, sender: "AI" } });
    expect(aiMessage).toBeNull();
  });

  it("escalates immediately on a blocklist hit, without ever calling the AI provider", async () => {
    const conversation = await freshConversation(practiceA.id, customerA.id);
    await saveInboundMessage(conversation.id, "I'm having severe pain in my eye");

    await handleInboundMessageForAi({
      practiceId: practiceA.id,
      practiceName: practiceA.name,
      conversationId: conversation.id,
      customerId: customerA.id,
      customerFirstName: customerA.firstName,
      customerContact: "447700900777",
      channel: "whatsapp",
      inboundMessageText: "I'm having severe pain in my eye",
    });

    const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(updated.status).toBe("HUMAN_QUEUE");

    const aiMessage = await prisma.message.findFirst({ where: { conversationId: conversation.id, sender: "AI" } });
    expect(aiMessage).toBeNull();
  });

  it("respects the practice-wide kill switch, even for an otherwise confident reply", async () => {
    await prisma.aiSettings.update({ where: { practiceId: practiceA.id }, data: { autoSendEnabled: false } });

    const conversation = await freshConversation(practiceA.id, customerA.id);
    await saveInboundMessage(conversation.id, "Yes please, book me in");

    await handleInboundMessageForAi({
      practiceId: practiceA.id,
      practiceName: practiceA.name,
      conversationId: conversation.id,
      customerId: customerA.id,
      customerFirstName: customerA.firstName,
      customerContact: "447700900777",
      channel: "whatsapp",
      inboundMessageText: "Yes please, book me in",
    });

    const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(updated.status).toBe("HUMAN_QUEUE");

    const aiMessage = await prisma.message.findFirst({ where: { conversationId: conversation.id, sender: "AI" } });
    expect(aiMessage).toBeNull();
  });

  it("respects the per-conversation kill switch independently of the practice-wide one", async () => {
    const conversation = await prisma.conversation.create({
      data: { practiceId: practiceA.id, customerId: customerA.id, aiAutoSendPaused: true },
    });
    await saveInboundMessage(conversation.id, "Yes please, book me in");

    await handleInboundMessageForAi({
      practiceId: practiceA.id,
      practiceName: practiceA.name,
      conversationId: conversation.id,
      customerId: customerA.id,
      customerFirstName: customerA.firstName,
      customerContact: "447700900777",
      channel: "whatsapp",
      inboundMessageText: "Yes please, book me in",
    });

    const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(updated.status).toBe("HUMAN_QUEUE");
  });

  it("does not let practice A's AI settings affect practice B's processing", async () => {
    await prisma.aiSettings.update({ where: { practiceId: practiceA.id }, data: { autoSendEnabled: false } });

    const customerB = await prisma.customer.create({
      data: { practiceId: practiceB.id, firstName: "Bob", mobile: "447700900888" },
    });
    const conversationB = await freshConversation(practiceB.id, customerB.id);
    await saveInboundMessage(conversationB.id, "Yes please, book me in");

    await handleInboundMessageForAi({
      practiceId: practiceB.id,
      practiceName: practiceB.name,
      conversationId: conversationB.id,
      customerId: customerB.id,
      customerFirstName: customerB.firstName,
      customerContact: "447700900888",
      channel: "whatsapp",
      inboundMessageText: "Yes please, book me in",
    });

    // Practice B's AI is still enabled, so it SHOULD auto-send, proving
    // practice A's kill switch had zero effect on practice B.
    const updated = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationB.id } });
    expect(updated.status).toBe("WAITING_ON_CUSTOMER");
  });
});
