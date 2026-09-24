import crypto from "node:crypto";
import { WhatsAppProvider, SendMessageInput, SendMessageResult } from "./provider";
import { logger } from "../../lib/logger";

// Simulates a successful send with a fake provider message ID, logging what
// would have been sent. This is the default provider for local development
// (WHATSAPP_PROVIDER=mock) so the whole campaign -> queue -> worker ->
// "send" -> webhook loop can be exercised end-to-end without a real
// WhatsApp Business API account.
export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const providerMessageId = `mock-${crypto.randomUUID()}`;

    logger.info(
      { to: input.to, channel: input.channel, templateName: input.templateName, providerMessageId },
      `[MOCK SEND] ${input.body}`,
    );

    return { providerMessageId };
  }
}
