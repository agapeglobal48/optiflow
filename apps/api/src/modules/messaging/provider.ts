// Provider abstraction (build spec's "vendor abstraction" principle):
// nothing outside this file should know whether messages are actually
// going to Meta's Cloud API, a BSP, or a local mock. Swapping providers
// later means writing a new class here, not touching the worker or
// campaign logic.

export interface SendMessageInput {
  to: string; // phone number (E.164-ish) or email, depending on channel
  channel: "whatsapp" | "email";
  templateName: string;
  body: string; // already-rendered message text
}

export interface SendMessageResult {
  providerMessageId: string;
}

export interface WhatsAppProvider {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
