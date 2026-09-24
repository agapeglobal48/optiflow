import express from "express";
import helmet from "helmet";
import cors from "cors";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { authRouter } from "./modules/auth/authRoutes";
import { superAdminRouter } from "./modules/onboarding/superAdminRoutes";
import { staffInvitesRouter } from "./modules/onboarding/staffInvitesRoutes";
import { publicInvitesRouter } from "./modules/onboarding/publicInvitesRoutes";
import { branchesRouter } from "./modules/branches/branchesRoutes";
import { customersRouter } from "./modules/customers/customersRoutes";
import { messageTemplatesRouter } from "./modules/campaigns/messageTemplatesRoutes";
import { campaignsRouter } from "./modules/campaigns/campaignsRoutes";
import { webhooksRouter } from "./modules/messaging/webhooksRoutes";
import { conversationsRouter } from "./modules/conversations/conversationsRoutes";
import { knowledgeBaseRouter } from "./modules/knowledgeBase/knowledgeBaseRoutes";
import { aiSettingsRouter } from "./modules/ai/aiSettingsRoutes";
import { bookingsRouter } from "./modules/bookings/bookingsRoutes";
import { reportsRouter } from "./modules/reports/reportsRoutes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// --- Security & platform middleware -----------------------------------
app.use(helmet());
// CORS_ORIGIN accepts one origin or a comma-separated list, so a single
// deployment can allow both the production frontend and Vercel preview
// URLs (or localhost during local dev against a deployed API) at once.
const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length <= 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ logger }));

// --- Health check (for load balancer / monitoring) ----------------------
app.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "optiflow-api", time: new Date().toISOString() });
});

// --- Routes ---------------------------------------------------------------
app.use("/api/auth", authRouter);
app.use("/api/super-admin", superAdminRouter);
app.use("/api/staff", staffInvitesRouter);
app.use("/api/invites", publicInvitesRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/customers", customersRouter);
app.use("/api/message-templates", messageTemplatesRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/knowledge-base", knowledgeBaseRouter);
app.use("/api/ai-settings", aiSettingsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/reports", reportsRouter);
app.use("/webhooks", webhooksRouter);

// Future modules mount here as they're built:
// (Phase 10 builds the super-admin portal on top of this)

// --- Error handling (must be last) ---------------------------------------
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`OptiFlow API listening on port ${env.PORT} [${env.NODE_ENV}]`);
});
