import { describe, it, expect } from "vitest";
import { parseWebhookPayload } from "../modules/messaging/webhookPayloadParsing";

function statusPayload(status: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "mock-phone-demo-001" },
              statuses: [{ id: "wamid.HBgLABC123", status, timestamp: "1735689600" }],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

function inboundMessagePayload() {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "mock-phone-demo-001" },
              contacts: [{ profile: { name: "Jane Smith" }, wa_id: "447700900111" }],
              messages: [
                {
                  id: "wamid.INBOUND456",
                  from: "447700900111",
                  timestamp: "1735689600",
                  type: "text",
                  text: { body: "Yes please, book me in" },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

describe("parseWebhookPayload", () => {
  it("parses a delivery status event", () => {
    const events = parseWebhookPayload(statusPayload("delivered"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "status",
      phoneNumberId: "mock-phone-demo-001",
      providerMessageId: "wamid.HBgLABC123",
      status: "delivered",
      providerEventId: "wamid.HBgLABC123:delivered",
    });
  });

  it("gives sent/delivered/read on the same message distinct providerEventIds", () => {
    const sent = parseWebhookPayload(statusPayload("sent"))[0];
    const delivered = parseWebhookPayload(statusPayload("delivered"))[0];
    const read = parseWebhookPayload(statusPayload("read"))[0];
    const ids = new Set([sent.providerEventId, delivered.providerEventId, read.providerEventId]);
    expect(ids.size).toBe(3);
  });

  it("ignores an unrecognised status value", () => {
    const events = parseWebhookPayload(statusPayload("warning"));
    expect(events).toHaveLength(0);
  });

  it("parses an inbound text message with the sender's contact name", () => {
    const events = parseWebhookPayload(inboundMessagePayload());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "inbound_message",
      phoneNumberId: "mock-phone-demo-001",
      from: "447700900111",
      providerMessageId: "wamid.INBOUND456",
      body: "Yes please, book me in",
      senderName: "Jane Smith",
      providerEventId: "wamid.INBOUND456",
    });
  });

  it("ignores non-text message types (MVP limitation)", () => {
    const payload = inboundMessagePayload();
    payload.entry[0].changes[0].value.messages[0] = {
      id: "wamid.IMG1",
      from: "447700900111",
      timestamp: "1735689600",
      type: "image",
    } as never;
    const events = parseWebhookPayload(payload);
    expect(events).toHaveLength(0);
  });

  it("returns an empty array for a payload missing phone_number_id", () => {
    const events = parseWebhookPayload({ entry: [{ changes: [{ value: {} }] }] });
    expect(events).toHaveLength(0);
  });

  it("returns an empty array for a completely empty payload", () => {
    expect(parseWebhookPayload({})).toHaveLength(0);
  });

  it("handles multiple entries and changes in one payload", () => {
    const combined = {
      entry: [statusPayload("sent").entry[0], inboundMessagePayload().entry[0]],
    };
    const events = parseWebhookPayload(combined);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.kind).sort()).toEqual(["inbound_message", "status"]);
  });
});
