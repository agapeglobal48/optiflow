import crypto from "node:crypto";

// Same pattern as refresh tokens: opaque random string given to the
// invitee, only its hash stored server-side. A leaked DB dump can't be
// used to accept invites; a leaked invite email link is the only way in,
// and it expires.
export function generateInviteToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashInviteToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function inviteExpiry(days = 7): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
