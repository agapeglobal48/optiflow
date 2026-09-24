import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import {
  listKnowledgeEntries,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
} from "./knowledgeBaseService";

export const knowledgeBaseRouter = Router();

knowledgeBaseRouter.use(authenticate);

const entrySchema = z.object({
  topic: z.string().min(1),
  question: z.string().optional(),
  answer: z.string().min(1),
});

knowledgeBaseRouter.get("/", requirePermission(PERMISSIONS.AI_CONFIGURE), async (req, res, next) => {
  try {
    res.json(await listKnowledgeEntries(req.auth!));
  } catch (err) {
    next(err);
  }
});

knowledgeBaseRouter.post("/", requirePermission(PERMISSIONS.AI_CONFIGURE), async (req, res, next) => {
  try {
    const input = entrySchema.parse(req.body);
    res.status(201).json(await createKnowledgeEntry(req.auth!, input));
  } catch (err) {
    next(err);
  }
});

knowledgeBaseRouter.patch("/:id", requirePermission(PERMISSIONS.AI_CONFIGURE), async (req, res, next) => {
  try {
    const input = entrySchema.partial().parse(req.body);
    res.json(await updateKnowledgeEntry(req.auth!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});

knowledgeBaseRouter.delete("/:id", requirePermission(PERMISSIONS.AI_CONFIGURE), async (req, res, next) => {
  try {
    await deleteKnowledgeEntry(req.auth!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
