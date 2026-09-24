import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS } from "../rbac/permissions";
import { createInvite, listInvites, revokeInvite } from "./inviteService";
import { listRoles, listStaffUsers, updateStaffUser } from "./staffService";

export const staffInvitesRouter = Router();

staffInvitesRouter.use(authenticate);

staffInvitesRouter.get(
  "/roles",
  requirePermission(PERMISSIONS.STAFF_INVITE),
  async (req, res, next) => {
    try {
      res.json(await listRoles(req.auth!));
    } catch (err) {
      next(err);
    }
  },
);

staffInvitesRouter.get(
  "/users",
  requirePermission(PERMISSIONS.STAFF_INVITE),
  async (req, res, next) => {
    try {
      res.json(await listStaffUsers(req.auth!));
    } catch (err) {
      next(err);
    }
  },
);

const updateUserSchema = z
  .object({
    roleId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.roleId !== undefined || v.isActive !== undefined, {
    message: "At least one of roleId or isActive is required",
  });

staffInvitesRouter.patch(
  "/users/:id",
  requirePermission(PERMISSIONS.STAFF_MANAGE_ROLES),
  async (req, res, next) => {
    try {
      const input = updateUserSchema.parse(req.body);
      res.json(await updateStaffUser(req.auth!, req.params.id, input));
    } catch (err) {
      next(err);
    }
  },
);

const createInviteSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid(),
});

staffInvitesRouter.post(
  "/invites",
  requirePermission(PERMISSIONS.STAFF_INVITE),
  async (req, res, next) => {
    try {
      const input = createInviteSchema.parse(req.body);
      // practiceId always comes from the authenticated user's own tenant,
      // never from the request body - see tenantGuard.ts conventions.
      const result = await createInvite(req.auth!.practiceId, input, req.auth!.userId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

staffInvitesRouter.get(
  "/invites",
  requirePermission(PERMISSIONS.STAFF_INVITE),
  async (req, res, next) => {
    try {
      res.json(await listInvites(req.auth!));
    } catch (err) {
      next(err);
    }
  },
);

staffInvitesRouter.delete(
  "/invites/:id",
  requirePermission(PERMISSIONS.STAFF_INVITE),
  async (req, res, next) => {
    try {
      await revokeInvite(req.auth!, req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
