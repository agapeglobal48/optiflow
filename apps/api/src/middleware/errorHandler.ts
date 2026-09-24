import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { logger } from "../lib/logger";
import { AuthError } from "../modules/auth/authService";

// Structured error responses, suitable for UI and monitoring (spec 8.1).
// Never leak stack traces or internal details to the client in production.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Express requires 4-arg signature to recognize this as an error handler,
  // even though this handler never calls next().
  _next: NextFunction,
): void {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5MB)" : "File upload error";
    res.status(400).json({ error: { code: err.code, message } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.flatten(),
      },
    });
    return;
  }

  const maybeStatus = (err as { status?: number })?.status;
  if (maybeStatus) {
    res.status(maybeStatus).json({
      error: { code: "REQUEST_ERROR", message: (err as Error).message },
    });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
}
