import { ParsedWebhookEvent, StatusEvent, InboundMessageEvent } from "./webhookPayloadParsing";

// Parses Whapi.Cloud's webhook payload shape into the same internal
// ParsedWebhookEvent type Meta's parser produces - everything downstream
// (webhookService.ts) is provider-agnostic and only ever deals with this
// shared shape. This is the same abstraction principle as the send-side
// WhatsAppProvider interface, applied to the receiving side too.
// Docs: https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format
//
// Whapi's shape is fundamentally different from Meta's: a single
// "messages.post" webhook covers BOTH outgoing status updates (from_me:
// true, with a status field) and inbound messages (from_me: false) - there
// is no separate statuses[] array like Meta has.

interface WhapiMessage {
  id: string;
  from_me: boolean;
  type: string;
  chat_id: string;
  timestamp: number;
  status?: "failed" | "pending" | "sent" | "delivered" | "read" | "played" | "deleted";
  text?: { body: string };
  from: string;
  from_name?: string;
}

interface RawWhapiPayload {
  messages?: WhapiMessage[];
  channel_id?: string;
}

const VALID_STATUSES = new Set(["sent", "delivered", "read", "failed"]);

export function parseWhapiWebhookPayload(payload: unknown): ParsedWebhookEvent[] {
  const events: ParsedWebhookEvent[] = [];
  const body = payload as RawWhapiPayload;

  if (!body.channel_id) return events;
  const phoneNumberId = body.channel_id; // reusing the same field name as Meta's concept for tenant routing

  for (const message of body.messages ?? []) {
    if (message.type !== "text" || !message.text) continue; // MVP: text messages only, matching the Meta parser's limitation

    if (message.from_me) {
      // An outgoing message status update
      if (!message.status || !VALID_STATUSES.has(message.status)) continue; // ignore pending/played/deleted
      const event: StatusEvent = {
        kind: "status",
        phoneNumberId,
        providerMessageId: message.id,
        status: message.status as StatusEvent["status"],
        timestamp: String(message.timestamp),
        providerEventId: `${message.id}:${message.status}`,
      };
      events.push(event);
    } else {
      // An inbound message from a customer
      const event: InboundMessageEvent = {
        kind: "inbound_message",
        phoneNumberId,
        from: message.from,
        providerMessageId: message.id,
        body: message.text.body,
        timestamp: String(message.timestamp),
        senderName: message.from_name,
        providerEventId: message.id,
      };
      events.push(event);
    }
  }

  return events;
}
