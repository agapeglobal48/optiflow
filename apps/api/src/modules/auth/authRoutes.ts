import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { login, refreshSession, logout } from "./authService";
import { authenticate } from "../../middleware/authenticate";

export const authRouter = Router();

// Rate limit login attempts per-IP to blunt credential-stuffing, in
// addition to the per-account lockout in authService (spec 5.1).
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many login attempts. Try again later." } },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await login(email, password, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const result = await refreshSession(refreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    await logout(refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Simple example of an authenticated route returning the current session's
// auth context - useful for the frontend to bootstrap and for smoke tests.
authRouter.get("/me", authenticate, (req, res) => {
  res.json({ auth: req.auth });
});
