import type { DecodedAccessToken } from "@/types/auth";

/**
 * Decodes (does NOT verify) a JWT's payload for UI purposes only - showing
 * the right nav items, disabling a button the user has no permission for,
 * etc. This is never a security boundary: every real permission check
 * happens server-side (see requirePermission() in the API), so a user
 * tampering with this client-side decode gains nothing but a confusing UI.
 */
export function decodeAccessToken(token: string): DecodedAccessToken | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const decoded = JSON.parse(json) as { sub: string; practiceId: string; roleId: string; permissions: string[]; exp: number };
    return {
      userId: decoded.sub,
      practiceId: decoded.practiceId,
      roleId: decoded.roleId,
      permissions: decoded.permissions,
    };
  } catch {
    return null;
  }
}
