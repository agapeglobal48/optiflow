import { prisma } from "../../lib/prisma";
import { getWhatsAppProvider } from "./providerFactory";
import { variablesFromSnapshotName, renderTemplate } from "./templateRendering";
import { CampaignSendJobData } from "../../lib/queue";
import { logger } from "../../lib/logger";

async function ensureConversationForCustomer(practiceId: string, customerId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { practiceId, customerId, status: { not: "CLOSED" } },
  });
  if (existing) return existing;
  return prisma.conversation.create({ data: { practiceId, customerId } });
}

// Thrown to signal BullMQ should retry the job later (see worker.ts retry
// config) rather than mark it permanently failed - used for the "campaign
// is paused" case, which is a temporary condition, not an error.
class RetryableSendError extends Error {}

export async function processCampaignSendJob(data: CampaignSendJobData): Promise<void> {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: data.recipientId },
    include: { campaign: { include: { messageTemplate: true } } },
  });

  if (!recipient) {
    logger.warn({ recipientId: data.recipientId }, "Campaign recipient no longer exists - skipping job");
    return;
  }

  if (recipient.status !== "queued") {
    // Already processed - guards against double-sending on a job retry
    // after a prior attempt actually succeeded.
    logger.info(
      { recipientId: recipient.id, status: recipient.status },
      "Recipient already processed - skipping",
    );
    return;
  }

  if (recipient.campaign.status === "STOPPED") {
    logger.info({ recipientId: recipient.id }, "Campaign stopped - skipping send");
    return;
  }

  if (recipient.campaign.status === "PAUSED") {
    // Known limitation: this relies on BullMQ's retry/backoff to
    // eventually re-check the campaign's status. If the campaign stays
    // paused longer than the configured max attempts, the job ends up in
    // BullMQ's failed state even though the recipient itself is still
    // legitimately "queued" and eligible to send once resumed - a future
    // "resume" action should re-enqueue any such recipients explicitly
    // rather than relying on this alone.
    throw new RetryableSendError("Campaign is paused");
  }

  if (!recipient.customerId) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "failed", failureReason: "Customer record no longer available" },
    });
    return;
  }

  const variables = variablesFromSnapshotName(recipient.snapshotName);
  const body = renderTemplate(recipient.campaign.messageTemplate.bodyPreview, variables);
  const provider = getWhatsAppProvider();

  try {
    const result = await provider.sendMessage({
      to: recipient.snapshotContact,
      channel: recipient.snapshotChannel as "whatsapp" | "email",
      templateName: recipient.campaign.messageTemplate.providerTemplateName,
      body,
    });

    const conversation = await ensureConversationForCustomer(
      recipient.campaign.practiceId,
      recipient.customerId,
    );

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          campaignRecipientId: recipient.id,
          direction: "OUTBOUND",
          sender: "SYSTEM",
          channel: recipient.snapshotChannel,
          body,
          providerMessageId: result.providerMessageId,
          status: "sent",
        },
      }),
      prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { status: "sent", sentAt: new Date() },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  } catch (err) {
    if (err instanceof RetryableSendError) throw err;

    const message = err instanceof Error ? err.message : "Unknown send error";
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "failed", failureReason: message },
    });
    // Re-throw so BullMQ records the job as failed too (visible in queue
    // metrics), even though the DB state above is already consistent.
    throw err;
  }
}
