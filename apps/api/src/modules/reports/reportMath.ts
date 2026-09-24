// Pure math helpers for reporting - zero DB/Prisma imports, so these are
// unit tested directly (src/__tests__/reportMath.test.ts) without a
// database, same separation principle used in modules/bookings/slotComputation.ts.

/**
 * A rate/percentage that's undefined when there's no denominator to divide
 * by (e.g. a campaign with zero sends), rather than NaN or a misleading 0%.
 */
export function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * Estimated revenue = count of non-cancelled bookings * the practice's
 * configured average appointment value. Returns null (not 0) when the
 * practice hasn't set a value, so a dashboard can show "not configured"
 * instead of a misleading £0.
 */
export function estimateRevenue(bookingCount: number, appointmentValue: number | null | undefined): number | null {
  if (appointmentValue === null || appointmentValue === undefined) return null;
  return Math.round(bookingCount * appointmentValue * 100) / 100;
}

export function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}
