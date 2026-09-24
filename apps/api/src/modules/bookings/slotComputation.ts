// Pure slot-computation logic - deliberately has ZERO imports from lib/prisma
// or anything else that touches the database, so it can be unit tested
// (src/__tests__/availabilityService.test.ts) without a real Postgres
// connection or a generated Prisma client. availabilityService.ts wraps
// this with the DB reads (branch + existing appointments).
import { WorkingHours, dayKeyForDate, timeStringToMinutes } from "./workingHours";

export const DEFAULT_SLOT_MINUTES = 30;
export const MAX_AVAILABILITY_DAYS = 30;

export interface Slot {
  startTime: Date;
  endTime: Date;
}

export interface ExistingBooking {
  startTime: Date;
  endTime: Date;
}

export interface ComputeSlotsInput {
  workingHours: WorkingHours;
  fromDate: Date; // start of the window (UTC midnight of the first day considered)
  days: number; // how many calendar days to compute, starting at fromDate
  slotMinutes?: number;
  existingAppointments: ExistingBooking[];
  now?: Date; // slots starting before `now` are excluded
}

/**
 * Computes bookable slots for a branch over a date window, given its
 * working hours and its already-booked appointments.
 */
export function computeAvailableSlots(input: ComputeSlotsInput): Slot[] {
  const slotMinutes = input.slotMinutes ?? DEFAULT_SLOT_MINUTES;
  const now = input.now ?? new Date();
  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset < input.days; dayOffset++) {
    const dayStart = new Date(
      Date.UTC(
        input.fromDate.getUTCFullYear(),
        input.fromDate.getUTCMonth(),
        input.fromDate.getUTCDate() + dayOffset,
      ),
    );
    const dayKey = dayKeyForDate(dayStart);
    const ranges = input.workingHours[dayKey];
    if (!ranges || ranges.length === 0) continue;

    for (const range of ranges) {
      const openMinutes = timeStringToMinutes(range.open);
      const closeMinutes = timeStringToMinutes(range.close);

      for (let slotStartMin = openMinutes; slotStartMin + slotMinutes <= closeMinutes; slotStartMin += slotMinutes) {
        const startTime = new Date(dayStart.getTime() + slotStartMin * 60_000);
        const endTime = new Date(startTime.getTime() + slotMinutes * 60_000);

        if (startTime < now) continue;

        const overlapsExisting = input.existingAppointments.some(
          (appt) => startTime < appt.endTime && appt.startTime < endTime,
        );
        if (overlapsExisting) continue;

        slots.push({ startTime, endTime });
      }
    }
  }

  return slots;
}
