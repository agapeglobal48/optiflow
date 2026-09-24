import { AuthContext } from "../types/express";

/**
 * Tenant isolation convention for this codebase:
 *
 * 1. req.auth.practiceId (set only by the `authenticate` middleware) is the
 *    single source of truth for "which tenant is this request for".
 * 2. Every Prisma query against a tenant-owned table MUST include
 *    `practiceId: auth.practiceId` in its `where` clause - use
 *    `withTenant()` below to make this explicit and hard to omit by accident.
 * 3. Never accept practiceId from req.body/req.query/req.params for
 *    authorization decisions. Route params like `:practiceId` should only
 *    appear on super-admin routes, and those routes must separately check
 *    a superadmin:* permission.
 *
 * This helper doesn't make omission impossible (Prisma has no compile-time
 * tenant enforcement), so it's paired with the integration-test requirement
 * in the build spec (14: "Integration tests required for database access
 * rules") - every tenant-owned model should have a test asserting that
 * practice A cannot read/write practice B's rows.
 */
export function withTenant<T extends Record<string, unknown>>(
  auth: AuthContext,
  where: T,
): T & { practiceId: string } {
  return { ...where, practiceId: auth.practiceId };
}

export function assertSameTenant(auth: AuthContext, resourcePracticeId: string): void {
  if (auth.practiceId !== resourcePracticeId) {
    // Deliberately vague error - do not reveal that the resource exists
    // under a different tenant (avoids IDOR enumeration).
    const err = new Error("Resource not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
}
