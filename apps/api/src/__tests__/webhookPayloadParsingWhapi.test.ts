import { describe, it, expect } from "vitest";
import { parseWhapiWebhookPayload } from "../modules/messaging/webhookPayloadParsingWhapi";

function outgoingStatusPayload(status: string) {
  return {
    messages: [
      {
        id: "msg-abc-123",
        from_me: true,
        type: "text",
        chat_id: "447700900111@s.whatsapp.net",
        timestamp: 1735689600,
        status,
        text: { body: "Hi Jane, time for your eye test!" },
        from: "yourbusinessnumber",
      },
    ],
    event: { type: "messages", event: "post" },
    channel_id: "MANTIS-TEST01",
  };
}

function inboundMessagePayload() {
  return {
    messages: [
      {
        id: "msg-inbound-456",
        from_me: false,
        type: "text",
        chat_id: "447700900111@s.whatsapp.net",
        timestamp: 1735689700,
        text: { body: "Yes please, book me in" },
        from: "447700900111",
        from_name: "Jane Smith",
      },
    ],
    event: { type: "messages", event: "post" },
    channel_id: "MANTIS-TEST01",
  };
}

describe("parseWhapiWebhookPayload", () => {
  it("parses an outgoing message status update", () => {
    const events = parseWhapiWebhookPayload(outgoingStatusPayload("delivered"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "status",
      phoneNumberId: "MANTIS-TEST01",
      providerMessageId: "msg-abc-123",
      status: "delivered",
      providerEventId: "msg-abc-123:delivered",
    });
  });

  it("gives distinct providerEventIds for sent/delivered/read on the same message", () => {
    const sent = parseWhapiWebhookPayload(outgoingStatusPayload("sent"))[0];
    const delivered = parseWhapiWebhookPayload(outgoingStatusPayload("delivered"))[0];
    const read = parseWhapiWebhookPayload(outgoingStatusPayload("read"))[0];
    const ids = new Set([sent.providerEventId, delivered.providerEventId, read.providerEventId]);
    expect(ids.size).toBe(3);
  });

  it("ignores pending/played/deleted statuses (not modeled)", () => {
    expect(parseWhapiWebhookPayload(outgoingStatusPayload("pending"))).toHaveLength(0);
    expect(parseWhapiWebhookPayload(outgoingStatusPayload("played"))).toHaveLength(0);
    expect(parseWhapiWebhookPayload(outgoingStatusPayload("deleted"))).toHaveLength(0);
  });

  it("parses an inbound text message with sender name", () => {
    const events = parseWhapiWebhookPayload(inboundMessagePayload());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "inbound_message",
      phoneNumberId: "MANTIS-TEST01",
      from: "447700900111",
      providerMessageId: "msg-inbound-456",
      body: "Yes please, book me in",
      senderName: "Jane Smith",
      providerEventId: "msg-inbound-456",
    });
  });

  it("ignores non-text message types", () => {
    const payload = inboundMessagePayload();
    payload.messages[0] = {
      id: "msg-img-1",
      from_me: false,
      type: "image",
      chat_id: "447700900111@s.whatsapp.net",
      timestamp: 1735689700,
      from: "447700900111",
    } as never;
    expect(parseWhapiWebhookPayload(payload)).toHaveLength(0);
  });

  it("returns an empty array when channel_id is missing", () => {
    expect(parseWhapiWebhookPayload({ messages: [{ id: "x" }] })).toHaveLength(0);
  });

  it("returns an empty array for a completely empty payload", () => {
    expect(parseWhapiWebhookPayload({})).toHaveLength(0);
  });

  it("distinguishes outgoing status vs inbound message within the same payload", () => {
    const combined = {
      messages: [...outgoingStatusPayload("sent").messages, ...inboundMessagePayload().messages],
      channel_id: "MANTIS-TEST01",
    };
    const events = parseWhapiWebhookPayload(combined);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.kind).sort()).toEqual(["inbound_message", "status"]);
  });
});
