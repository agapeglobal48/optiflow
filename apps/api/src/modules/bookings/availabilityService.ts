import { prisma } from "../../lib/prisma";
import { AuthContext } from "../../types/express";
import { assertSameTenant } from "../../lib/tenantGuard";
import { parseWorkingHours } from "./workingHours";
import { computeAvailableSlots, DEFAULT_SLOT_MINUTES, MAX_AVAILABILITY_DAYS, Slot } from "./slotComputation";

export { DEFAULT_SLOT_MINUTES, MAX_AVAILABILITY_DAYS };
export type { Slot };

interface GetAvailabilityOptions {
  fromDate?: Date;
  days?: number;
  slotMinutes?: number;
}

/**
 * DB-backed wrapper: loads the branch (tenant-checked) and its booked
 * appointments in the requested window, then delegates to the pure
 * computeAvailableSlots in slotComputation.ts.
 */
export async function getAvailability(auth: AuthContext, branchId: string, options: GetAvailabilityOptions = {}) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.deletedAt) {
    const err = new Error("Branch not found");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  assertSameTenant(auth, branch.practiceId);

  const days = Math.min(options.days ?? 7, MAX_AVAILABILITY_DAYS);
  if (days < 1) {
    const err = new Error("days must be at least 1");
    (err as Error & { status: number }).status = 400;
    throw err;
  }

  const now = new Date();
  const fromDate = options.fromDate ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowEnd = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate() + days));

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      branchId,
      status: "BOOKED",
      startTime: { gte: fromDate, lt: windowEnd },
    },
    select: { startTime: true, endTime: true },
  });

  const workingHours = parseWorkingHours(branch.workingHours);

  return computeAvailableSlots({
    workingHours,
    fromDate,
    days,
    slotMinutes: options.slotMinutes,
    existingAppointments,
    now,
  });
}
