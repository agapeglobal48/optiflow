// Working-hours shape stored on Branch.workingHours (a free-form Json column -
// see prisma/schema.prisma). This module is the single place that knows how
// to read that Json safely.
//
// MVP DESIGN DECISION: times are plain "HH:mm" 24h strings and are treated as
// UTC. Practice.timezone already exists in the schema for display purposes
// (e.g. formatting a confirmation message), but full IANA-timezone-aware
// slot computation (DST, per-branch timezones, etc.) is out of scope for
// this phase - documented as a known limitation in the README. A practice
// operating outside UTC should enter working hours already converted to UTC
// for now.
//
// Example stored value:
// {
//   "mon": [{ "open": "09:00", "close": "17:30" }],
//   "tue": [{ "open": "09:00", "close": "12:30" }, { "open": "13:30", "close": "17:30" }],
//   "wed": [{ "open": "09:00", "close": "17:30" }],
//   "thu": [{ "open": "09:00", "close": "17:30" }],
//   "fri": [{ "open": "09:00", "close": "17:30" }],
//   "sat": [],
//   "sun": []
// }

export interface TimeRange {
  open: string; // "HH:mm"
  close: string; // "HH:mm"
}

export type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export type WorkingHours = Partial<Record<DayKey, TimeRange[]>>;

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTimeRange(value: unknown): value is TimeRange {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.open === "string" && typeof v.close === "string" && TIME_RE.test(v.open) && TIME_RE.test(v.close) && v.open < v.close;
}

/**
 * Parses Branch.workingHours (arbitrary Json from the DB) into a validated
 * WorkingHours object. Never throws - a malformed or missing value is
 * treated as "no hours configured" (empty object), so a bad value results
 * in zero available slots rather than a 500 error.
 */
export function parseWorkingHours(raw: unknown): WorkingHours {
  if (!raw || typeof raw !== "object") return {};

  const result: WorkingHours = {};
  const obj = raw as Record<string, unknown>;

  for (const day of DAY_KEYS) {
    const ranges = obj[day];
    if (!Array.isArray(ranges)) continue;
    const valid = ranges.filter(isValidTimeRange);
    if (valid.length > 0) {
      result[day] = valid;
    }
  }

  return result;
}

export function dayKeyForDate(date: Date): DayKey {
  return DAY_KEYS[date.getUTCDay()];
}

export function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
