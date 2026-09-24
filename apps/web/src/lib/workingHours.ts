import type { DayKey, TimeRange, WorkingHours } from "@/types/settings";

export const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const DAY_LABELS: Record<DayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidRange(value: unknown): value is TimeRange {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return typeof r.open === "string" && typeof r.close === "string" && TIME_RE.test(r.open) && TIME_RE.test(r.close);
}

// Lenient by design, mirroring the backend's parseWorkingHours: never
// throws, silently drops invalid entries so a malformed value just shows as
// "no hours configured" for that day rather than breaking the editor.
export function parseWorkingHoursForEditor(raw: unknown): Record<DayKey, TimeRange[]> {
  const result = Object.fromEntries(DAY_KEYS.map((d) => [d, [] as TimeRange[]])) as Record<DayKey, TimeRange[]>;
  if (!raw || typeof raw !== "object") return result;
  const obj = raw as Record<string, unknown>;
  for (const day of DAY_KEYS) {
    const ranges = obj[day];
    if (Array.isArray(ranges)) {
      result[day] = ranges.filter(isValidRange);
    }
  }
  return result;
}

export function serializeWorkingHours(state: Record<DayKey, TimeRange[]>): WorkingHours {
  const out: WorkingHours = {};
  for (const day of DAY_KEYS) {
    if (state[day].length > 0) {
      out[day] = state[day];
    }
  }
  return out;
}
