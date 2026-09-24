import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import {
  listMessageTemplates,
  getMessageTemplate,
  createMessageTemplate,
  updateMessageTemplate,
} from "./messageTemplateService";

export const messageTemplatesRouter = Router();

messageTemplatesRouter.use(authenticate);

const templateSchema = z.object({
  name: z.string().min(1),
  channel: z.literal("whatsapp"),
  providerTemplateName: z.string().min(1),
  bodyPreview: z.string().min(1),
});

messageTemplatesRouter.get("/", requirePermission(PERMISSIONS.CAMPAIGNS_VIEW), async (req, res, next) => {
  try {
    res.json(await listMessageTemplates(req.auth!));
  } catch (err) {
    next(err);
  }
});

messageTemplatesRouter.get("/:id", requirePermission(PERMISSIONS.CAMPAIGNS_VIEW), async (req, res, next) => {
  try {
    res.json(await getMessageTemplate(req.auth!, req.params.id));
  } catch (err) {
    next(err);
  }
});

messageTemplatesRouter.post("/", requirePermission(PERMISSIONS.CAMPAIGNS_CREATE), async (req, res, next) => {
  try {
    const input = templateSchema.parse(req.body);
    res.status(201).json(await createMessageTemplate(req.auth!, input));
  } catch (err) {
    next(err);
  }
});

const updateSchema = templateSchema.partial().extend({ isApproved: z.boolean().optional() });

messageTemplatesRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.CAMPAIGNS_CREATE),
  async (req, res, next) => {
    try {
      const input = updateSchema.parse(req.body);
      res.json(await updateMessageTemplate(req.auth!, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);
