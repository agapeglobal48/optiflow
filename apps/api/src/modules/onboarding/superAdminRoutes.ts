import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import {
  createPracticeWithDefaults,
  listPractices,
  getPractice,
  updatePracticeStatus,
} from "../onboarding/practiceService";
import { getSystemHealth, getSupportSummary, listFeatureFlags, setFeatureFlag } from "./platformService";

export const superAdminRouter = Router();

// Every route here requires a cross-tenant superadmin permission - these
// are the ONLY routes in the codebase allowed to operate across practices.
// Unlike Phase 2, this is no longer a single blanket permission check:
// there are three distinct superadmin:* permissions (practices:manage,
// support:access, system:health), each gating a different kind of access,
// so each route below declares its own - a support agent role can be
// granted support:access without also getting practice-management or
// system-health rights.
superAdminRouter.use(authenticate);

const createPracticeSchema = z.object({
  name: z.string().min(2),
  timezone: z.string().optional(),
  defaultAppointmentValue: z.number().positive().optional(),
  ownerEmail: z.string().email(),
});

superAdminRouter.post("/practices", requirePermission(PERMISSIONS.SUPERADMIN_PRACTICES_MANAGE), async (req, res, next) => {
  try {
    const input = createPracticeSchema.parse(req.body);
    const result = await createPracticeWithDefaults(input);
    // rawToken is returned here only because no email provider is wired up
    // yet - once one is, this endpoint should stop returning it and instead
    // just confirm "invite sent".
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

superAdminRouter.get("/practices", requirePermission(PERMISSIONS.SUPERADMIN_PRACTICES_MANAGE), async (_req, res, next) => {
  try {
    res.json(await listPractices());
  } catch (err) {
    next(err);
  }
});

superAdminRouter.get("/practices/:id", requirePermission(PERMISSIONS.SUPERADMIN_PRACTICES_MANAGE), async (req, res, next) => {
  try {
    const practice = await getPractice(req.params.id);
    if (!practice) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Practice not found" } });
      return;
    }
    res.json(practice);
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]) });

superAdminRouter.patch("/practices/:id/status", requirePermission(PERMISSIONS.SUPERADMIN_PRACTICES_MANAGE), async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const practice = await updatePracticeStatus(req.params.id, status);
    res.json(practice);
  } catch (err) {
    next(err);
  }
});

// ── Feature flags ─────────────────────────────────────────────────────
// Practice management, not support access - toggling a flag changes what
// a practice can do, so it needs the same permission as suspending them.

superAdminRouter.get(
  "/practices/:id/feature-flags",
  requirePermission(PERMISSIONS.SUPERADMIN_PRACTICES_MANAGE),
  async (req, res, next) => {
    try {
      res.json(await listFeatureFlags(req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

const featureFlagSchema = z.object({ enabled: z.boolean() });

superAdminRouter.patch(
  "/practices/:id/feature-flags/:key",
  requirePermission(PERMISSIONS.SUPERADMIN_PRACTICES_MANAGE),
  async (req, res, next) => {
    try {
      const { enabled } = featureFlagSchema.parse(req.body);
      res.json(await setFeatureFlag(req.params.id, req.params.key, enabled));
    } catch (err) {
      next(err);
    }
  },
);

// ── Support access ────────────────────────────────────────────────────
// Deliberately a separate, narrower permission from practices:manage - a
// support agent should be able to look at a practice's numbers to help a
// customer without also being able to suspend the practice or flip its
// feature flags.

superAdminRouter.get(
  "/practices/:id/support-summary",
  requirePermission(PERMISSIONS.SUPERADMIN_SUPPORT_ACCESS),
  async (req, res, next) => {
    try {
      res.json(await getSupportSummary(req.auth!.userId, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// ── System health ─────────────────────────────────────────────────────

superAdminRouter.get("/system-health", requirePermission(PERMISSIONS.SUPERADMIN_SYSTEM_HEALTH), async (_req, res, next) => {
  try {
    res.json(await getSystemHealth());
  } catch (err) {
    next(err);
  }
});
