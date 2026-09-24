import { WhatsAppProvider, SendMessageInput, SendMessageResult } from "./provider";

interface CloudApiConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
}

// Calls Meta's WhatsApp Cloud API directly. Built to the documented
// request/response shape, but NOT exercised against a live account in
// this project - there's no real WhatsApp Business API access available
// during development. Treat this as "correct per the docs, unverified in
// practice" until it's tested against a real sandbox number.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
export class CloudApiWhatsAppProvider implements WhatsAppProvider {
  constructor(private config: CloudApiConfig) {}

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "whatsapp") {
      throw new Error(`CloudApiWhatsAppProvider only supports the whatsapp channel, got "${input.channel}"`);
    }

    const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

    // NOTE: this sends a free-form text message. A production campaign
    // send to a customer OUTSIDE the 24-hour service window must use an
    // approved message *template* (components/parameters), not free text,
    // or Meta will reject it. Swapping this body for the templated request
    // shape is the next step once real credentials are available to test
    // against - flagged here rather than silently sending the wrong shape.
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "text",
        text: { body: input.body },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`WhatsApp Cloud API send failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as { messages?: { id: string }[] };
    const providerMessageId = data.messages?.[0]?.id;

    if (!providerMessageId) {
      throw new Error("WhatsApp Cloud API response did not include a message id");
    }

    return { providerMessageId };
  }
}
