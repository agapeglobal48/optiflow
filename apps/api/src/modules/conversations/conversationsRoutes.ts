import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import {
  listConversations,
  getConversation,
  pauseAiForConversation,
  resumeAiForConversation,
  takeOverConversation,
  releaseToAi,
  closeConversation,
  sendStaffReply,
} from "./conversationService";

export const conversationsRouter = Router();

conversationsRouter.use(authenticate);

conversationsRouter.get("/", requirePermission(PERMISSIONS.INBOX_VIEW), async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(await listConversations(req.auth!, { status }));
  } catch (err) {
    next(err);
  }
});

conversationsRouter.get("/:id", requirePermission(PERMISSIONS.INBOX_VIEW), async (req, res, next) => {
  try {
    res.json(await getConversation(req.auth!, req.params.id));
  } catch (err) {
    next(err);
  }
});

conversationsRouter.post(
  "/:id/ai-pause",
  requirePermission(PERMISSIONS.AI_KILL_SWITCH),
  async (req, res, next) => {
    try {
      res.json(await pauseAiForConversation(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

conversationsRouter.post(
  "/:id/ai-resume",
  requirePermission(PERMISSIONS.AI_KILL_SWITCH),
  async (req, res, next) => {
    try {
      res.json(await resumeAiForConversation(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

conversationsRouter.post(
  "/:id/take-over",
  requirePermission(PERMISSIONS.INBOX_TAKE_OVER),
  async (req, res, next) => {
    try {
      res.json(await takeOverConversation(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

conversationsRouter.post(
  "/:id/release-to-ai",
  requirePermission(PERMISSIONS.INBOX_RELEASE_TO_AI),
  async (req, res, next) => {
    try {
      res.json(await releaseToAi(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

conversationsRouter.post(
  "/:id/close",
  requirePermission(PERMISSIONS.INBOX_TAKE_OVER),
  async (req, res, next) => {
    try {
      res.json(await closeConversation(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

const replySchema = z.object({
  body: z.string().min(1),
  isInternalNote: z.boolean().optional(),
});

conversationsRouter.post(
  "/:id/messages",
  requirePermission(PERMISSIONS.INBOX_SEND_MESSAGE),
  async (req, res, next) => {
    try {
      const input = replySchema.parse(req.body);
      res.status(201).json(await sendStaffReply(req.auth!, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);
