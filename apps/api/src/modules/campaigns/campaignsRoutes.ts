import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import {
  listCampaignTemplateTypes,
  previewAudience,
  createCampaign,
  listCampaigns,
  getCampaign,
  listCampaignRecipients,
  launchCampaign,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
} from "./campaignService";

export const campaignsRouter = Router();

campaignsRouter.use(authenticate);

campaignsRouter.get(
  "/template-types",
  requirePermission(PERMISSIONS.CAMPAIGNS_VIEW),
  async (_req, res, next) => {
    try {
      res.json(await listCampaignTemplateTypes());
    } catch (err) {
      next(err);
    }
  },
);

const audienceFilterSchema = z
  .object({
    branchId: z.string().uuid().optional(),
    recallDueBefore: z.string().optional(),
    recallDueAfter: z.string().optional(),
    appointmentType: z.string().optional(),
  })
  .strict();

campaignsRouter.post(
  "/audience-preview",
  requirePermission(PERMISSIONS.CAMPAIGNS_CREATE),
  async (req, res, next) => {
    try {
      const filter = audienceFilterSchema.parse(req.body);
      res.json(await previewAudience(req.auth!, filter));
    } catch (err) {
      next(err);
    }
  },
);

const createCampaignSchema = z.object({
  name: z.string().min(1),
  templateTypeKey: z.string().min(1),
  messageTemplateId: z.string().uuid(),
  audienceFilter: audienceFilterSchema,
});

campaignsRouter.post("/", requirePermission(PERMISSIONS.CAMPAIGNS_CREATE), async (req, res, next) => {
  try {
    const input = createCampaignSchema.parse(req.body);
    res.status(201).json(await createCampaign(req.auth!, input));
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get("/", requirePermission(PERMISSIONS.CAMPAIGNS_VIEW), async (req, res, next) => {
  try {
    res.json(await listCampaigns(req.auth!));
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get("/:id", requirePermission(PERMISSIONS.CAMPAIGNS_VIEW), async (req, res, next) => {
  try {
    res.json(await getCampaign(req.auth!, req.params.id));
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get(
  "/:id/recipients",
  requirePermission(PERMISSIONS.CAMPAIGNS_VIEW),
  async (req, res, next) => {
    try {
      res.json(await listCampaignRecipients(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

campaignsRouter.post(
  "/:id/launch",
  requirePermission(PERMISSIONS.CAMPAIGNS_LAUNCH),
  async (req, res, next) => {
    try {
      res.json(await launchCampaign(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

campaignsRouter.post(
  "/:id/pause",
  requirePermission(PERMISSIONS.CAMPAIGNS_PAUSE_STOP),
  async (req, res, next) => {
    try {
      res.json(await pauseCampaign(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

campaignsRouter.post(
  "/:id/resume",
  requirePermission(PERMISSIONS.CAMPAIGNS_PAUSE_STOP),
  async (req, res, next) => {
    try {
      res.json(await resumeCampaign(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

campaignsRouter.post(
  "/:id/stop",
  requirePermission(PERMISSIONS.CAMPAIGNS_PAUSE_STOP),
  async (req, res, next) => {
    try {
      res.json(await stopCampaign(req.auth!, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);
