// INTEGRATION TEST - requires a real database (WHATSAPP_PROVIDER should
// be "mock", the default).
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../../lib/prisma";
import {
  takeOverConversation,
  releaseToAi,
  sendStaffReply,
  getConversation,
  listConversations,
  closeConversation,
} from "../../modules/conversations/conversationService";
import { AuthContext } from "../../types/express";
import { campaignSendQueue } from "../../lib/queue";

describe("human inbox", () => {
  let practiceA: { id: string };
  let practiceB: { id: string };
  let authA: AuthContext;
  let authB: AuthContext;
  let customerA: { id: string };

  beforeEach(async () => {
    practiceA = await prisma.practice.create({ data: { name: "Inbox Test Practice A" } });
    practiceB = await prisma.practice.create({ data: { name: "Inbox Test Practice B" } });
    authA = { userId: "staff-user-a", practiceId: practiceA.id, roleId: "n/a", permissions: [] };
    authB = { userId: "staff-user-b", practiceId: practiceB.id, roleId: "n/a", permissions: [] };

    customerA = await prisma.customer.create({
      data: { practiceId: practiceA.id, firstName: "Priya", mobile: "447700900321" },
    });
  });

  afterAll(async () => {
    await campaignSendQueue.close();
    await prisma.$disconnect();
  });

  it("take-over assigns the caller and pauses AI", async () => {
    const conversation = await prisma.conversation.create({
      data: { practiceId: practiceA.id, customerId: customerA.id, unreadCount: 3 },
    });

    const updated = await takeOverConversation(authA, conversation.id);
    expect(updated.status).toBe("HUMAN_HANDLING");
    expect(updated.assignedAgentId).toBe("staff-user-a");
    expect(updated.aiAutoSendPaused).toBe(true);
    expect(updated.unreadCount).toBe(0);
  });

  it("release-to-ai unassigns and resumes AI", async () => {
    const conversation = await prisma.conversation.create({
      data: {
        practiceId: practiceA.id,
        customerId: customerA.id,
        status: "HUMAN_HANDLING",
        assignedAgentId: "staff-user-a",
        aiAutoSendPaused: true,
      },
    });

    const updated = await releaseToAi(authA, conversation.id);
    expect(updated.status).toBe("AI_HANDLING");
    expect(updated.assignedAgentId).toBeNull();
    expect(updated.aiAutoSendPaused).toBe(false);
  });

  it("sending a reply creates a message, sends it, and implicitly takes over the conversation", async () => {
    const conversation = await prisma.conversation.create({
      data: { practiceId: practiceA.id, customerId: customerA.id },
    });

    const message = await sendStaffReply(authA, conversation.id, { body: "Sure, I can help with that!" });
    expect(message.direction).toBe("OUTBOUND");
    expect(message.sender).toBe("STAFF");
    expect(message.body).toBe("Sure, I can help with that!");
    expect(message.providerMessageId).toMatch(/^mock-/);

    const updatedConversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(updatedConversation.status).toBe("HUMAN_HANDLING");
    expect(updatedConversation.assignedAgentId).toBe("staff-user-a");
  });

  it("an internal note never calls the provider and is flagged isInternalNote", async () => {
    const conversation = await prisma.conversation.create({
      data: { practiceId: practiceA.id, customerId: customerA.id },
    });

    const note = await sendStaffReply(authA, conversation.id, {
      body: "Called patient, no answer, will retry tomorrow",
      isInternalNote: true,
    });
    expect(note.isInternalNote).toBe(true);
    expect(note.providerMessageId).toBeNull();
  });

  it("viewing a conversation resets unreadCount to zero", async () => {
    const conversation = await prisma.conversation.create({
      data: { practiceId: practiceA.id, customerId: customerA.id, unreadCount: 5 },
    });

    const fetched = await getConversation(authA, conversation.id);
    expect(fetched.unreadCount).toBe(0);

    const persisted = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(persisted.unreadCount).toBe(0);
  });

  it("closing a conversation sets status to CLOSED", async () => {
    const conversation = await prisma.conversation.create({
      data: { practiceId: practiceA.id, customerId: customerA.id },
    });

    const updated = await closeConversation(authA, conversation.id);
    expect(updated.status).toBe("CLOSED");
  });

  it("listConversations filters by status", async () => {
    await prisma.conversation.create({ data: { practiceId: practiceA.id, customerId: customerA.id, status: "AI_HANDLING" } });
    await prisma.conversation.create({ data: { practiceId: practiceA.id, customerId: customerA.id, status: "HUMAN_QUEUE" } });

    const queueOnly = await listConversations(authA, { status: "HUMAN_QUEUE" });
    expect(queueOnly.every((c: { status: string }) => c.status === "HUMAN_QUEUE")).toBe(true);
    expect(queueOnly.length).toBeGreaterThanOrEqual(1);
  });

  it("does not let practice B take over or reply to practice A's conversation", async () => {
    const conversation = await prisma.conversation.create({
      data: { practiceId: practiceA.id, customerId: customerA.id },
    });

    await expect(takeOverConversation(authB, conversation.id)).rejects.toThrow("Resource not found");
    await expect(sendStaffReply(authB, conversation.id, { body: "Hi" })).rejects.toThrow("Resource not found");
  });

  it("does not let practice B see practice A's conversations in a list", async () => {
    await prisma.conversation.create({ data: { practiceId: practiceA.id, customerId: customerA.id } });

    const practiceBConversations = await listConversations(authB);
    expect(practiceBConversations).toHaveLength(0);
  });
});
