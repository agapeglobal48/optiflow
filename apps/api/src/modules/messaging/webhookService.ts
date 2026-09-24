import { prisma } from "../../lib/prisma";
import { ParsedWebhookEvent, StatusEvent, InboundMessageEvent } from "./webhookPayloadParsing";
import { logger } from "../../lib/logger";
import { handleInboundMessageForAi } from "../ai/aiConversationService";

async function resolvePracticeByPhoneNumberId(phoneNumberId: string) {
  return prisma.practice.findUnique({ where: { whatsappPhoneNumberId: phoneNumberId } });
}

// Returns false if this event was already processed (dedup via the
// WebhookEvent.providerEventId unique constraint) - the caller should skip
// further processing in that case. This is important because providers
// commonly retry webhook delivery on any non-2xx response or timeout.
async function recordEventOrSkipIfDuplicate(
  provider: string,
  eventType: string,
  providerEventId: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({
      data: { provider, eventType, providerEventId, payload: payload as never, status: "received" },
    });
    return true;
  } catch {
    // Unique constraint violation on providerEventId = already seen this exact event.
    logger.info({ providerEventId }, "Duplicate webhook event - skipping");
    return false;
  }
}

async function processStatusEvent(event: StatusEvent, rawPayload: unknown) {
  const isNew = await recordEventOrSkipIfDuplicate("whatsapp_cloud_api", "status", event.providerEventId, rawPayload);
  if (!isNew) return;

  const practice = await resolvePracticeByPhoneNumberId(event.phoneNumberId);
  if (!practice) {
    logger.warn({ phoneNumberId: event.phoneNumberId }, "No practice registered for this phone_number_id");
    return;
  }

  const message = await prisma.message.findUnique({
    where: { providerMessageId: event.providerMessageId },
    include: { conversation: true },
  });

  if (!message) {
    logger.warn({ providerMessageId: event.providerMessageId }, "Status update for unknown message - ignoring");
    return;
  }

  // Defense in depth: even though phoneNumberId already resolved a
  // practice, double-check the message we found actually belongs to that
  // same practice before mutating it. Prevents a spoofed/malformed payload
  // from touching another tenant's data.
  if (message.conversation.practiceId !== practice.id) {
    logger.error(
      { providerMessageId: event.providerMessageId, expectedPractice: practice.id, actualPractice: message.conversation.practiceId },
      "Webhook practice mismatch - refusing to update message across tenants",
    );
    return;
  }

  await prisma.message.update({ where: { id: message.id }, data: { status: event.status } });

  if (message.campaignRecipientId) {
    if (event.status === "delivered") {
      await prisma.campaignRecipient.update({
        where: { id: message.campaignRecipientId },
        data: { deliveredAt: new Date() },
      });
    } else if (event.status === "failed") {
      await prisma.campaignRecipient.update({
        where: { id: message.campaignRecipientId },
        data: { failureReason: "Provider reported delivery failure" },
      });
    }
  }
}

async function processInboundMessageEvent(event: InboundMessageEvent, rawPayload: unknown) {
  const isNew = await recordEventOrSkipIfDuplicate(
    "whatsapp_cloud_api",
    "inbound_message",
    event.providerEventId,
    rawPayload,
  );
  if (!isNew) return;

  const practice = await resolvePracticeByPhoneNumberId(event.phoneNumberId);
  if (!practice) {
    logger.warn({ phoneNumberId: event.phoneNumberId }, "No practice registered for this phone_number_id");
    return;
  }

  // MVP limitation: an inbound message from a number that doesn't match
  // any known customer's mobile has nowhere to go, since Conversation
  // requires a customerId. A real implementation needs an "unknown
  // contacts" holding area - flagged rather than silently dropped.
  //
  // PHONE FORMAT LIMITATION: WhatsApp's `from` field is always full
  // international format with no "+" (e.g. "923001234567"). This exact-
  // match lookup will silently fail to find a customer whose `mobile` was
  // stored in local/national format (e.g. "03001234567") - there's no
  // phone-number normalization here yet. Until that's added (a library
  // like libphonenumber, plus knowing each practice's default country),
  // customers must be imported/entered with mobile numbers already in
  // full international format for inbound webhook matching to work.
  const customer = await prisma.customer.findFirst({
    where: { practiceId: practice.id, mobile: event.from, deletedAt: null },
  });

  if (!customer) {
    logger.warn(
      { practiceId: practice.id, from: event.from },
      "Inbound message from unrecognised number - no matching customer, message dropped",
    );
    return;
  }

  let conversation = await prisma.conversation.findFirst({
    where: { practiceId: practice.id, customerId: customer.id, status: { not: "CLOSED" } },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { practiceId: practice.id, customerId: customer.id },
    });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      sender: "CUSTOMER",
      channel: "whatsapp",
      body: event.body,
      providerMessageId: event.providerMessageId,
      status: "delivered",
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      unreadCount: { increment: 1 },
      // Status is decided below by handleInboundMessageForAi (Phase 6) -
      // it may stay with the AI, or escalate to HUMAN_QUEUE, depending on
      // guardrails and confidence. Not hardcoded here anymore.
    },
  });

  // First-reply attribution: if this customer has a campaign message sent
  // but not yet marked as replied, record it. Deliberately "most recent
  // sent, not yet replied" rather than trying to disambiguate which
  // campaign the reply is "about" - WhatsApp doesn't give us that.
  const recentRecipient = await prisma.campaignRecipient.findFirst({
    where: { customerId: customer.id, status: "sent", repliedAt: null },
    orderBy: { sentAt: "desc" },
  });
  if (recentRecipient) {
    await prisma.campaignRecipient.update({
      where: { id: recentRecipient.id },
      data: { repliedAt: new Date() },
    });
  }

  // Hand off to the AI conversation engine (Phase 6) to decide what
  // happens next: auto-reply, or escalate to the human queue. This is
  // deliberately the LAST step - the inbound message and conversation
  // bump above are always recorded regardless of what the AI decides.
  await handleInboundMessageForAi({
    practiceId: practice.id,
    practiceName: practice.name,
    conversationId: conversation.id,
    customerId: customer.id,
    customerFirstName: customer.firstName,
    customerContact: customer.mobile ?? customer.email ?? "",
    channel: "whatsapp",
    inboundMessageText: event.body,
  });
}

export async function processWebhookEvents(events: ParsedWebhookEvent[], rawPayload: unknown): Promise<void> {
  for (const event of events) {
    try {
      if (event.kind === "status") {
        await processStatusEvent(event, rawPayload);
      } else {
        await processInboundMessageEvent(event, rawPayload);
      }
    } catch (err) {
      // One bad event should never take down processing of the rest of
      // the batch (a single webhook call can carry many events).
      logger.error({ err, event }, "Failed to process webhook event");
    }
  }
}
