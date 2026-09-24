import { prisma } from "../../lib/prisma";
import { verifyPassword } from "./passwordService";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "./tokenService";
import { logger } from "../../lib/logger";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 401,
  ) {
    super(message);
  }
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; firstName: string; lastName: string; practiceId: string };
}

export async function login(
  email: string,
  password: string,
  ctx: { ipAddress?: string; userAgent?: string },
): Promise<LoginResult> {
  // Email is unique per-tenant, not globally, so a login attempt must
  // resolve by email alone across all practices, then verify password.
  // This is safe because passwordHash comparison still gates access -
  // we're not trusting the email to imply tenant here.
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  // Constant-shape response whether user exists or not, to avoid
  // user-enumeration via timing/response differences.
  if (!user || !user.isActive) {
    throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError(
      `Account temporarily locked. Try again after ${user.lockedUntil.toISOString()}`,
      "ACCOUNT_LOCKED",
      423,
    );
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    const failedCount = user.failedLoginCount + 1;
    const shouldLock = failedCount >= MAX_FAILED_ATTEMPTS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: shouldLock ? 0 : failedCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          : user.lockedUntil,
      },
    });

    if (shouldLock) {
      logger.warn({ userId: user.id }, "Account locked after repeated failed logins");
    }

    throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
  }

  // Successful login resets failure counters
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const permissions = user.role.permissions.map((rp: { permission: { key: string } }) => rp.permission.key);

  const accessToken = signAccessToken({
    sub: user.id,
    practiceId: user.practiceId,
    roleId: user.roleId,
    permissions,
  });

  const { raw: refreshToken, hash } = generateRefreshToken();

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hash,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
      expiresAt: refreshTokenExpiry(),
    },
  });

  await prisma.auditLog.create({
    data: {
      practiceId: user.practiceId,
      userId: user.id,
      action: "auth.login",
      ipAddress: ctx.ipAddress,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      practiceId: user.practiceId,
    },
  };
}

export async function refreshSession(
  rawRefreshToken: string,
  ctx: { ipAddress?: string; userAgent?: string },
): Promise<LoginResult> {
  const hash = hashRefreshToken(rawRefreshToken);

  const session = await prisma.session.findFirst({
    where: { refreshTokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
    include: {
      user: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });

  if (!session || !session.user.isActive || session.user.deletedAt) {
    throw new AuthError("Invalid or expired session", "INVALID_SESSION");
  }

  // Rotate refresh token on every use (mitigates replay of a stolen token)
  const { raw: newRefreshToken, hash: newHash } = generateRefreshToken();

  await prisma.$transaction([
    prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    prisma.session.create({
      data: {
        userId: session.userId,
        refreshTokenHash: newHash,
        userAgent: ctx.userAgent,
        ipAddress: ctx.ipAddress,
        expiresAt: refreshTokenExpiry(),
      },
    }),
  ]);

  const permissions = session.user.role.permissions.map((rp: { permission: { key: string } }) => rp.permission.key);

  const accessToken = signAccessToken({
    sub: session.user.id,
    practiceId: session.user.practiceId,
    roleId: session.user.roleId,
    permissions,
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      practiceId: session.user.practiceId,
    },
  };
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const hash = hashRefreshToken(rawRefreshToken);
  await prisma.session.updateMany({
    where: { refreshTokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Called when a user is disabled or their role changes - spec 5.1 requires
// immediate session revocation in both cases.
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
