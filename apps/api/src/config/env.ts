import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // Secrets - never given defaults, must fail if missing in any real environment
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),

  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // Provider credentials - referenced by name only; actual secret handling
  // happens via the deployment platform's secret manager, not this file.
  WHATSAPP_PROVIDER: z.enum(["mock", "cloud_api", "aisensy", "whapi", "bsp_adapter"]).default("mock"),
  WHATSAPP_CLOUD_API_TOKEN: z.string().optional(),
  WHATSAPP_CLOUD_API_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_CLOUD_API_VERSION: z.string().default("v20.0"),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default("dev-verify-token"),
  WHATSAPP_APP_SECRET: z.string().optional(), // required only when provider=cloud_api, for webhook signature verification
  AISENSY_PROJECT_ID: z.string().optional(),
  AISENSY_API_PASSWORD: z.string().optional(),
  WHAPI_TOKEN: z.string().optional(), // required only when provider=whapi

  // AI conversation engine (Phase 6)
  AI_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(), // required only when AI_PROVIDER=anthropic
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// cloud_api requires real credentials - fail fast rather than let sends
// silently fail later. mock (the local dev default) needs nothing extra.
if (env.WHATSAPP_PROVIDER === "cloud_api") {
  if (!env.WHATSAPP_CLOUD_API_TOKEN || !env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID) {
    // eslint-disable-next-line no-console
    console.error(
      "❌ WHATSAPP_PROVIDER=cloud_api requires WHATSAPP_CLOUD_API_TOKEN and WHATSAPP_CLOUD_API_PHONE_NUMBER_ID",
    );
    process.exit(1);
  }
  if (!env.WHATSAPP_APP_SECRET) {
    // eslint-disable-next-line no-console
    console.error("❌ WHATSAPP_PROVIDER=cloud_api requires WHATSAPP_APP_SECRET for webhook signature verification");
    process.exit(1);
  }
}

if (env.WHATSAPP_PROVIDER === "aisensy") {
  if (!env.AISENSY_PROJECT_ID || !env.AISENSY_API_PASSWORD) {
    // eslint-disable-next-line no-console
    console.error("❌ WHATSAPP_PROVIDER=aisensy requires AISENSY_PROJECT_ID and AISENSY_API_PASSWORD");
    process.exit(1);
  }
}

if (env.WHATSAPP_PROVIDER === "whapi") {
  if (!env.WHAPI_TOKEN) {
    // eslint-disable-next-line no-console
    console.error("❌ WHATSAPP_PROVIDER=whapi requires WHAPI_TOKEN");
    process.exit(1);
  }
}

if (env.AI_PROVIDER === "anthropic") {
  if (!env.ANTHROPIC_API_KEY) {
    // eslint-disable-next-line no-console
    console.error("❌ AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
    process.exit(1);
  }
}
