import { WhatsAppProvider, SendMessageInput, SendMessageResult } from "./provider";

interface WhapiConfig {
  token: string;
}

// Whapi.Cloud connects via QR-code pairing with a real WhatsApp account
// (like WhatsApp Web), NOT Meta's official Business API - no Meta business
// verification required. Trade-off: this is an unofficial integration
// method, carries some risk of the paired number being flagged at high
// volume, and doesn't get WhatsApp's official "Business" badge. Fine for
// development/testing; worth reassessing before real production volume.
// Docs: https://support.whapi.cloud/help-desk/sending/send-text-message
export class WhapiProvider implements WhatsAppProvider {
  constructor(private config: WhapiConfig) {}

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "whatsapp") {
      throw new Error(`WhapiProvider only supports the whatsapp channel, got "${input.channel}"`);
    }

    const url = `https://gate.whapi.cloud/messages/text?token=${encodeURIComponent(this.config.token)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: input.to.replace(/[^\d]/g, ""), // Whapi wants digits only, no + or formatting
        body: input.body,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Whapi send failed (${response.status}): ${errorBody}`);
    }

    // CONFIDENCE NOTE: Whapi's published docs show the WEBHOOK message
    // shape precisely (message.id, from_me, status, etc.) but the
    // synchronous POST response schema for a successful send isn't shown
    // in their public reference page. This checks the most likely field
    // locations based on their webhook shape and common API conventions -
    // verify against a real response once a live token exists, and adjust
    // if the actual field name differs.
    const data = (await response.json()) as {
      message?: { id?: string };
      id?: string;
      messages?: { id: string }[];
    };
    const providerMessageId = data.message?.id ?? data.id ?? data.messages?.[0]?.id;

    if (!providerMessageId) {
      throw new Error(
        `Whapi response did not include a recognisable message id - raw response: ${JSON.stringify(data)}`,
      );
    }

    return { providerMessageId };
  }
}
