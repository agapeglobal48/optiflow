import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { withTenant, assertSameTenant } from "../../lib/tenantGuard";
import { getWhatsAppProvider } from "../messaging/providerFactory";
import { logger } from "../../lib/logger";

async function findConversationForTenant(auth: AuthContext, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) {
    const err = new Error("Conversation not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, conversation.practiceId);
  return conversation;
}

interface ListConversationsOptions {
  status?: string;
}

export async function listConversations(auth: AuthContext, options: ListConversationsOptions = {}) {
  return prisma.conversation.findMany({
    where: withTenant(auth, options.status ? { status: options.status as never } : {}),
    orderBy: { lastMessageAt: "desc" },
    include: { customer: { select: { firstName: true, lastName: true, mobile: true } } },
  });
}

export async function getConversation(auth: AuthContext, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: { select: { firstName: true, lastName: true, mobile: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conversation) {
    const err = new Error("Conversation not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, conversation.practiceId);

  if (conversation.unreadCount > 0) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { unreadCount: 0 } });
    conversation.unreadCount = 0;
  }

  return conversation;
}

export async function pauseAiForConversation(auth: AuthContext, conversationId: string) {
  await findConversationForTenant(auth, conversationId);
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { aiAutoSendPaused: true, status: "HUMAN_QUEUE" },
  });
}

export async function resumeAiForConversation(auth: AuthContext, conversationId: string) {
  await findConversationForTenant(auth, conversationId);
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { aiAutoSendPaused: false, status: "AI_HANDLING" },
  });
}

export async function takeOverConversation(auth: AuthContext, conversationId: string) {
  await findConversationForTenant(auth, conversationId);
  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: "HUMAN_HANDLING",
      assignedAgentId: auth.userId,
      aiAutoSendPaused: true,
      unreadCount: 0,
    },
  });
}

export async function releaseToAi(auth: AuthContext, conversationId: string) {
  await findConversationForTenant(auth, conversationId);
  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: "AI_HANDLING",
      assignedAgentId: null,
      aiAutoSendPaused: false,
    },
  });
}

export async function closeConversation(auth: AuthContext, conversationId: string) {
  await findConversationForTenant(auth, conversationId);
  return prisma.conversation.update({ where: { id: conversationId }, data: { status: "CLOSED" } });
}

interface SendReplyInput {
  body: string;
  isInternalNote?: boolean;
}

export async function sendStaffReply(auth: AuthContext, conversationId: string, input: SendReplyInput) {
  const conversation = await findConversationForTenant(auth, conversationId);

  if (input.isInternalNote) {
    const note = await prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        sender: "STAFF",
        channel: "internal",
        body: input.body,
        status: "sent",
        isInternalNote: true,
      },
    });
    return note;
  }

  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: conversation.customerId } });
  const channel = customer.mobile ? "whatsapp" : "email";
  const contact = customer.mobile ?? customer.email;

  if (!contact) {
    const err = new Error("Customer has no contact method on file - cannot send a reply");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const provider = getWhatsAppProvider();

  let providerMessageId: string;
  try {
    const result = await provider.sendMessage({
      to: contact,
      channel,
      templateName: "staff_reply",
      body: input.body,
    });
    providerMessageId = result.providerMessageId;
  } catch (err) {
    logger.error({ err, conversationId }, "Failed to send staff reply via provider");
    const sendErr = new Error("Failed to send message via provider");
    (sendErr as Error & { status: number }).status = 502;
    throw sendErr;
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        sender: "STAFF",
        channel,
        body: input.body,
        providerMessageId,
        status: "sent",
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: "HUMAN_HANDLING",
        assignedAgentId: auth.userId,
        aiAutoSendPaused: true,
        lastMessageAt: new Date(),
        unreadCount: 0,
      },
    }),
  ]);

  return message;
}
