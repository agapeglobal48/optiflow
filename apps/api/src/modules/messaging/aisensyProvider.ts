import { WhatsAppProvider, SendMessageInput, SendMessageResult } from "./provider";

interface AiSensyConfig {
  projectId: string;
  apiPassword: string;
}

// AiSensy is a WhatsApp BSP (Business Solution Provider) - it sits on top
// of Meta's official WhatsApp Business Platform and re-exposes it through
// its own "Project API", documented at:
// https://aisensy.stoplight.io/docs/project-api/effdec8a4894f-send-message
//
// CONFIDENCE NOTE: the send request/response shape below is taken directly
// from AiSensy's published API reference and should be correct as
// documented. It has NOT been exercised against a live AiSensy account in
// this project - same caveat as CloudApiWhatsAppProvider.
export class AiSensyProvider implements WhatsAppProvider {
  constructor(private config: AiSensyConfig) {}

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (input.channel !== "whatsapp") {
      throw new Error(`AiSensyProvider only supports the whatsapp channel, got "${input.channel}"`);
    }

    const url = `https://apis.aisensy.com/project-apis/v1/project/${this.config.projectId}/messages`;

    // IMPORTANT LIMITATION (same as CloudApiWhatsAppProvider): this sends a
    // free-form text message. WhatsApp only allows free text within an
    // active 24-hour customer service window (i.e. replying to a customer
    // who messaged first). A business-initiated campaign send OUTSIDE that
    // window - which is what most recall campaigns are - MUST use an
    // approved message template instead (type: "template", with a
    // components/parameters array matching the template's registered
    // variables), or WhatsApp will reject it. Our MessageTemplate model
    // currently only stores a human-readable bodyPreview, not the
    // positional parameter structure WhatsApp's template API needs -
    // that's a real modeling gap to close before this can send genuine
    // outside-window campaign messages. Flagged here rather than silently
    // sending the wrong request shape.
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-AiSensy-Project-API-Pwd": this.config.apiPassword,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: input.to,
        type: "text",
        recipient_type: "individual",
        text: { body: input.body },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`AiSensy send failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as { messages?: { id: string }[] };
    const providerMessageId = data.messages?.[0]?.id;

    if (!providerMessageId) {
      throw new Error("AiSensy response did not include a message id");
    }

    return { providerMessageId };
  }
}
