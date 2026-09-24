import { Request, Response, NextFunction } from "express";
import { PermissionKey } from "../modules/rbac/permissions";

// Usage: router.post("/campaigns/:id/launch", authenticate, requirePermission(PERMISSIONS.CAMPAIGNS_LAUNCH), handler)
//
// Checking against permission keys (not role names) means new role
// profiles can be introduced later purely via data - no route code changes.
export function requirePermission(...required: PermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Not authenticated" } });
      return;
    }

    const hasAll = required.every((perm) => req.auth!.permissions.includes(perm));

    if (!hasAll) {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action",
          required,
        },
      });
      return;
    }

    next();
  };
}
