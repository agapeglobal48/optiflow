import { PrismaClient } from "@prisma/client";

// Single shared Prisma client instance. In dev with hot-reload (tsx watch),
// we cache it on globalThis to avoid exhausting DB connections on reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
