// Parses the payload shape Meta's WhatsApp Cloud API sends to webhooks.
// Kept pure/DB-free so the parsing logic can be unit tested against
// realistic payload fixtures without needing a live webhook call.
// Reference shape: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export interface StatusEvent {
  kind: "status";
  phoneNumberId: string;
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  providerEventId: string; // unique per (message, status) pair for dedup
}

export interface InboundMessageEvent {
  kind: "inbound_message";
  phoneNumberId: string;
  from: string; // sender's phone number
  providerMessageId: string;
  body: string;
  timestamp: string;
  senderName?: string;
  providerEventId: string; // the message's own id - globally unique
}

export type ParsedWebhookEvent = StatusEvent | InboundMessageEvent;

interface RawWebhookPayload {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        statuses?: { id: string; status: string; timestamp: string }[];
        messages?: {
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }[];
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
      };
    }[];
  }[];
}

const VALID_STATUSES = new Set(["sent", "delivered", "read", "failed"]);

export function parseWebhookPayload(payload: unknown): ParsedWebhookEvent[] {
  const events: ParsedWebhookEvent[] = [];
  const body = payload as RawWebhookPayload;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.metadata?.phone_number_id) continue;
      const phoneNumberId = value.metadata.phone_number_id;

      for (const status of value.statuses ?? []) {
        if (!VALID_STATUSES.has(status.status)) continue; // ignore statuses we don't model (e.g. "warning")
        events.push({
          kind: "status",
          phoneNumberId,
          providerMessageId: status.id,
          status: status.status as StatusEvent["status"],
          timestamp: status.timestamp,
          providerEventId: `${status.id}:${status.status}`,
        });
      }

      const contactNameByWaId = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name] as const),
      );

      for (const message of value.messages ?? []) {
        if (message.type !== "text" || !message.text) continue; // MVP: text messages only
        events.push({
          kind: "inbound_message",
          phoneNumberId,
          from: message.from,
          providerMessageId: message.id,
          body: message.text.body,
          timestamp: message.timestamp,
          senderName: contactNameByWaId.get(message.from),
          providerEventId: message.id,
        });
      }
    }
  }

  return events;
}
