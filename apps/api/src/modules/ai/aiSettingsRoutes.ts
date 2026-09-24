import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import { getAiSettings, updateAiSettings, setAiKillSwitch } from "./aiSettingsService";

export const aiSettingsRouter = Router();

aiSettingsRouter.use(authenticate);

aiSettingsRouter.get("/", requirePermission(PERMISSIONS.AI_CONFIGURE), async (req, res, next) => {
  try {
    res.json(await getAiSettings(req.auth!));
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  confidenceThreshold: z.number().min(0).max(1).optional(),
  blocklistTerms: z.array(z.string()).optional(),
  promptVersion: z.string().optional(),
});

aiSettingsRouter.patch("/", requirePermission(PERMISSIONS.AI_CONFIGURE), async (req, res, next) => {
  try {
    const input = updateSchema.parse(req.body);
    res.json(await updateAiSettings(req.auth!, input));
  } catch (err) {
    next(err);
  }
});

const killSwitchSchema = z.object({ enabled: z.boolean() });

aiSettingsRouter.post(
  "/kill-switch",
  requirePermission(PERMISSIONS.AI_KILL_SWITCH),
  async (req, res, next) => {
    try {
      const { enabled } = killSwitchSchema.parse(req.body);
      res.json(await setAiKillSwitch(req.auth!, enabled));
    } catch (err) {
      next(err);
    }
  },
);
