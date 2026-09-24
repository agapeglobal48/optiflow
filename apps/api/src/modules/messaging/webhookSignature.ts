import crypto from "node:crypto";

// Meta signs every webhook POST body with HMAC-SHA256 using your app
// secret, sent as the X-Hub-Signature-256 header ("sha256=<hex>"). This
// verifies the raw request body actually came from Meta and wasn't
// tampered with or forged by a third party who found the webhook URL.
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating-payloads
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const providedSignature = signatureHeader.slice("sha256=".length);
  const expectedSignature = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  // Constant-time comparison - a naive === comparison leaks timing
  // information that could theoretically help an attacker forge a valid
  // signature byte-by-byte.
  const providedBuffer = Buffer.from(providedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (providedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}
