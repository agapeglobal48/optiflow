import { prisma } from "../../lib/prisma";
import { getAiProvider } from "./aiProviderFactory";
import { buildSystemPrompt, PROMPT_VERSION } from "./promptBuilder";
import { parseAiResponse } from "./aiResponseParsing";
import { checkBlocklist } from "./safetyGuardrails";
import { getWhatsAppProvider } from "../messaging/providerFactory";
import { logger } from "../../lib/logger";

const CONVERSATION_HISTORY_LIMIT = 10;

interface HandleInboundMessageInput {
  practiceId: string;
  practiceName: string;
  conversationId: string;
  customerId: string;
  customerFirstName: string;
  customerContact: string; // mobile or email, for sending the reply
  channel: "whatsapp" | "email";
  inboundMessageText: string;
}

// Called after an inbound customer message has already been saved
// (webhookService.ts creates the Message row before calling this). This
// function ONLY decides what happens next: auto-reply, or hand to a human.
//
// Decision order matters - each check can short-circuit to escalation
// before any AI API call is made, both for safety and to avoid needless
// cost:
//   1. Kill switch (practice-wide, then per-conversation)
//   2. Deterministic blocklist check on the customer's own message
//   3. AI-generated response's own escalate flag
//   4. AI-reported confidence vs the practice's configured threshold
export async function handleInboundMessageForAi(input: HandleInboundMessageInput): Promise<void> {
  const aiSettings = await prisma.aiSettings.findUnique({ where: { practiceId: input.practiceId } });
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: input.conversationId } });

  // 1. Kill switch - checked first, before touching the AI provider at all.
  if (!aiSettings?.autoSendEnabled || conversation.aiAutoSendPaused) {
    await routeToHumanQueue(input.conversationId, "AI auto-send is disabled for this practice/conversation");
    return;
  }

  // 2. Deterministic blocklist - runs in plain code, independent of model behaviour.
  const blocklistResult = checkBlocklist(input.inboundMessageText, (aiSettings.blocklistTerms as string[]) ?? []);
  if (blocklistResult.hit) {
    logger.info(
      { conversationId: input.conversationId, matchedTerm: blocklistResult.matchedTerm, source: blocklistResult.source },
      "Inbound message hit safety blocklist - escalating without calling AI",
    );
    await routeToHumanQueue(
      input.conversationId,
      `Message matched a safety term ("${blocklistResult.matchedTerm}") - escalated without AI involvement`,
    );
    return;
  }

  // Build context for the model.
  const knowledgeBase = await prisma.knowledgeEntry.findMany({ where: { practiceId: input.practiceId } });

  const recentMessages = await prisma.message.findMany({
    where: { conversationId: input.conversationId, isInternalNote: false },
    orderBy: { createdAt: "desc" },
    take: CONVERSATION_HISTORY_LIMIT,
  });
  const conversationHistory = recentMessages
    .reverse()
    .map((m: { direction: string; body: string }) => ({
      role: (m.direction === "INBOUND" ? "customer" : "assistant") as "customer" | "assistant",
      text: m.body,
    }));

  const systemPrompt = buildSystemPrompt({
    practiceName: input.practiceName,
    customerFirstName: input.customerFirstName,
    knowledgeBase,
  });

  const provider = getAiProvider();
  let rawResult;
  try {
    rawResult = await provider.generateReply({ systemPrompt, conversationHistory });
  } catch (err) {
    logger.error({ err, conversationId: input.conversationId }, "AI provider call failed - escalating");
    await routeToHumanQueue(input.conversationId, "AI provider call failed");
    return;
  }

  const parsed = parseAiResponse(rawResult.rawResponseText);

  // 3 & 4. The model's own escalate flag, and the confidence threshold.
  const confidenceThreshold = Number(aiSettings.confidenceThreshold);
  if (parsed.escalate || parsed.confidence < confidenceThreshold) {
    logger.info(
      { conversationId: input.conversationId, confidence: parsed.confidence, threshold: confidenceThreshold, escalate: parsed.escalate },
      "AI reply did not meet auto-send bar - escalating",
    );
    await routeToHumanQueue(
      input.conversationId,
      parsed.escalateReason ?? `Confidence ${parsed.confidence} below threshold ${confidenceThreshold}`,
    );
    return;
  }

  // Passed every guardrail - actually send the AI's reply.
  await sendAiReplyAndRecord({
    conversationId: input.conversationId,
    to: input.customerContact,
    channel: input.channel,
    replyText: parsed.reply,
    model: rawResult.model,
    confidence: parsed.confidence,
  });
}

async function routeToHumanQueue(conversationId: string, reason: string): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "HUMAN_QUEUE" },
  });
  await prisma.auditLog.create({
    data: {
      action: "ai.escalated",
      entityType: "Conversation",
      entityId: conversationId,
      metadata: { reason },
    },
  });
}

async function sendAiReplyAndRecord(input: {
  conversationId: string;
  to: string;
  channel: "whatsapp" | "email";
  replyText: string;
  model: string;
  confidence: number;
}): Promise<void> {
  const provider = getWhatsAppProvider();

  try {
    const result = await provider.sendMessage({
      to: input.to,
      channel: input.channel,
      templateName: "ai_conversation_reply",
      body: input.replyText,
    });

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: input.conversationId,
          direction: "OUTBOUND",
          sender: "AI",
          channel: input.channel,
          body: input.replyText,
          providerMessageId: result.providerMessageId,
          status: "sent",
          aiModel: input.model,
          aiPromptVersion: PROMPT_VERSION,
          aiConfidence: input.confidence,
        },
      }),
      prisma.conversation.update({
        where: { id: input.conversationId },
        data: { status: "WAITING_ON_CUSTOMER", lastMessageAt: new Date() },
      }),
    ]);
  } catch (err) {
    logger.error({ err, conversationId: input.conversationId }, "Failed to send AI reply - escalating instead");
    await routeToHumanQueue(input.conversationId, "AI reply generated but sending it failed");
  }
}
