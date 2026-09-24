import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature } from "../modules/messaging/webhookSignature";

const APP_SECRET = "test-app-secret";

function sign(body: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${hmac}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = sign(body, APP_SECRET);
    expect(verifyWebhookSignature(body, signature, APP_SECRET)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    const body = JSON.stringify({ hello: "world" });
    const signature = sign(body, "wrong-secret");
    expect(verifyWebhookSignature(body, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a tampered body even with a valid-looking signature", () => {
    const originalBody = JSON.stringify({ amount: 10 });
    const signature = sign(originalBody, APP_SECRET);
    const tamperedBody = JSON.stringify({ amount: 10000 });
    expect(verifyWebhookSignature(tamperedBody, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyWebhookSignature(body, undefined, APP_SECRET)).toBe(false);
  });

  it("rejects a signature header missing the sha256= prefix", () => {
    const body = JSON.stringify({ hello: "world" });
    const hmac = crypto.createHmac("sha256", APP_SECRET).update(body, "utf8").digest("hex");
    expect(verifyWebhookSignature(body, hmac, APP_SECRET)).toBe(false);
  });

  it("rejects a garbage signature value", () => {
    const body = JSON.stringify({ hello: "world" });
    expect(verifyWebhookSignature(body, "sha256=not-valid-hex-zzz", APP_SECRET)).toBe(false);
  });
});
