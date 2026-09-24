import { Router, Request, Response } from "express";
import { env } from "../../config/env";
import { verifyWebhookSignature } from "./webhookSignature";
import { parseWebhookPayload, ParsedWebhookEvent } from "./webhookPayloadParsing";
import { parseWhapiWebhookPayload } from "./webhookPayloadParsingWhapi";
import { processWebhookEvents } from "./webhookService";
import { logger } from "../../lib/logger";

export const webhooksRouter = Router();

// Meta's one-time subscription handshake: it sends these query params and
// expects the challenge echoed back verbatim if the verify token matches.
// Whapi.Cloud doesn't use this handshake at all (you just paste a webhook
// URL into their dashboard) - this route is simply unused in that mode,
// which is harmless.
webhooksRouter.get("/whatsapp", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

// Picks the right parser for whichever provider is configured. Everything
// downstream (processWebhookEvents) is provider-agnostic - only this one
// function needs to know the payload shape differs by provider.
//
// PAYLOAD SHAPE CONFIDENCE:
// - cloud_api: verified against Meta's own published documentation.
// - aisensy: an educated guess, NOT a verified fact - AiSensy's exact
//   webhook payload format isn't precisely documented publicly. Verify
//   against a real payload from the AiSensy dashboard's webhook logs once
//   an account exists, and adjust if it differs.
// - whapi: verified against Whapi.Cloud's own published documentation,
//   which is precise and complete for this shape.
function parseIncomingWebhook(payload: unknown): ParsedWebhookEvent[] {
  if (env.WHATSAPP_PROVIDER === "whapi") {
    return parseWhapiWebhookPayload(payload);
  }
  return parseWebhookPayload(payload); // Meta-native shape: used for cloud_api, aisensy, and mock (manual test payloads)
}

// Real events arrive here. Express's json() middleware (mounted globally
// in index.ts) has already parsed req.body by this point - we re-derive
// the raw string for signature verification via JSON.stringify, which is
// safe here because we're not doing byte-for-byte re-serialization for
// anything security-critical beyond this dev/test signature check.
webhooksRouter.post("/whatsapp", async (req: Request, res: Response) => {
  // Signature verification is only enforced for the real Cloud API
  // provider. In "mock" mode (local dev/testing) there's no real Meta App
  // Secret to check against, and we want manually-crafted test payloads
  // (via curl/Postman) to work without computing a real HMAC. Whapi.Cloud's
  // webhook authentication mechanism (if any beyond HTTPS + URL secrecy)
  // isn't confirmed from their public docs - flagged as unverified rather
  // than assumed absent.
  if (env.WHATSAPP_PROVIDER === "cloud_api") {
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    const rawBody = JSON.stringify(req.body);
    if (!verifyWebhookSignature(rawBody, signature, env.WHATSAPP_APP_SECRET!)) {
      logger.warn("Webhook signature verification failed - rejecting");
      res.sendStatus(401);
      return;
    }
  }

  // Always respond quickly with 200 once the payload is structurally
  // accepted - providers retry aggressively on non-2xx/timeout, and we'd
  // rather process asynchronously than hold the connection open. For this
  // MVP, processing happens inline (payloads are small); a high-volume
  // deployment should hand `events` off to a queue instead.
  res.sendStatus(200);

  try {
    const events = parseIncomingWebhook(req.body);
    await processWebhookEvents(events, req.body);
  } catch (err) {
    logger.error({ err }, "Error processing webhook payload");
  }
});
