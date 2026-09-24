import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../modules/auth/tokenService";

// Attaches req.auth from a valid bearer token. This is the ONLY place
// req.auth.practiceId should ever be set - every downstream handler and
// service trusts this value for tenant scoping. Never accept a practiceId
// from the request body/query/params for authorization purposes.
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "MISSING_TOKEN", message: "Authorization header required" } });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      practiceId: payload.practiceId,
      roleId: payload.roleId,
      permissions: payload.permissions,
    };
    next();
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired token" } });
  }
}
