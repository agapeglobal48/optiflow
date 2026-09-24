import { Router } from "express";
import { z } from "zod";
import { previewInvite, acceptInvite } from "./inviteService";

export const publicInvitesRouter = Router();

// Deliberately unauthenticated - the invite token itself is the credential.
// Used by the frontend's "accept invite" page before the person has any
// account to log in with.
publicInvitesRouter.get("/:token", async (req, res, next) => {
  try {
    res.json(await previewInvite(req.params.token));
  } catch (err) {
    next(err);
  }
});

const acceptSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(1),
});

publicInvitesRouter.post("/:token/accept", async (req, res, next) => {
  try {
    const input = acceptSchema.parse(req.body);
    const result = await acceptInvite({ rawToken: req.params.token, ...input });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
