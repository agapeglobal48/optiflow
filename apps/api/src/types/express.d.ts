// Augments Express's Request type with the authenticated context attached
// by the `authenticate` middleware. This is the ONLY sanctioned source of
// practiceId for scoping queries - never req.body.practiceId, never
// req.query.practiceId. See src/middleware/authenticate.ts.
import "express";

export interface AuthContext {
  userId: string;
  practiceId: string;
  roleId: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
