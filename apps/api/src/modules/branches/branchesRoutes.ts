import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import { listBranches, getBranch, createBranch, updateBranch, deleteBranch } from "./branchService";

export const branchesRouter = Router();

branchesRouter.use(authenticate);

const branchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  workingHours: z.unknown().optional(),
});

branchesRouter.get("/", requirePermission(PERMISSIONS.BRANCHES_VIEW), async (req, res, next) => {
  try {
    res.json(await listBranches(req.auth!));
  } catch (err) {
    next(err);
  }
});

branchesRouter.get("/:id", requirePermission(PERMISSIONS.BRANCHES_VIEW), async (req, res, next) => {
  try {
    res.json(await getBranch(req.auth!, req.params.id));
  } catch (err) {
    next(err);
  }
});

branchesRouter.post("/", requirePermission(PERMISSIONS.BRANCHES_MANAGE), async (req, res, next) => {
  try {
    const input = branchSchema.parse(req.body);
    res.status(201).json(await createBranch(req.auth!, input));
  } catch (err) {
    next(err);
  }
});

branchesRouter.patch("/:id", requirePermission(PERMISSIONS.BRANCHES_MANAGE), async (req, res, next) => {
  try {
    const input = branchSchema.partial().parse(req.body);
    res.json(await updateBranch(req.auth!, req.params.id, input));
  } catch (err) {
    next(err);
  }
});

branchesRouter.delete("/:id", requirePermission(PERMISSIONS.BRANCHES_MANAGE), async (req, res, next) => {
  try {
    await deleteBranch(req.auth!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
