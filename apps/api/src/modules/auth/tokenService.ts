import jwt, { SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../../config/env";

export interface AccessTokenPayload {
  sub: string; // userId
  practiceId: string;
  roleId: string;
  permissions: string[];
}

export function signAccessToken(payload: AccessTokenPayload): string {
  // env.JWT_ACCESS_TTL is a free-form string like "15m" validated at runtime
  // by zod; @types/jsonwebtoken wants its narrower StringValue type, so we
  // cast at this single boundary rather than loosen the env schema.
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

// Refresh tokens are opaque random strings, NOT JWTs. We store only a hash
// of the token server-side (in Session.refreshTokenHash) so a leaked DB
// dump doesn't yield usable tokens. The raw token is given to the client once.
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function refreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + env.JWT_REFRESH_TTL_DAYS);
  return d;
}
