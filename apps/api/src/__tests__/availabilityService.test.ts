import { describe, it, expect } from "vitest";
import { computeAvailableSlots, DEFAULT_SLOT_MINUTES } from "../modules/bookings/slotComputation";
import { parseWorkingHours, dayKeyForDate, timeStringToMinutes } from "../modules/bookings/workingHours";

// A Monday in UTC, for deterministic day-of-week math.
const MONDAY = new Date("2026-09-21T00:00:00.000Z");

describe("parseWorkingHours", () => {
  it("returns an empty object for null/undefined/non-object input", () => {
    expect(parseWorkingHours(null)).toEqual({});
    expect(parseWorkingHours(undefined)).toEqual({});
    expect(parseWorkingHours("not json")).toEqual({});
    expect(parseWorkingHours(42)).toEqual({});
  });

  it("parses a valid working-hours object", () => {
    const parsed = parseWorkingHours({
      mon: [{ open: "09:00", close: "17:00" }],
      sun: [],
    });
    expect(parsed.mon).toEqual([{ open: "09:00", close: "17:00" }]);
    expect(parsed.sun).toBeUndefined(); // empty arrays are dropped
  });

  it("drops malformed ranges but keeps valid ones in the same day", () => {
    const parsed = parseWorkingHours({
      mon: [
        { open: "09:00", close: "17:00" },
        { open: "not-a-time", close: "18:00" },
        { open: "18:00", close: "10:00" }, // close before open - invalid
        "garbage",
        null,
      ],
    });
    expect(parsed.mon).toEqual([{ open: "09:00", close: "17:00" }]);
  });

  it("ignores unknown day keys and non-array values", () => {
    const parsed = parseWorkingHours({ mon: "closed all day", notaday: [{ open: "09:00", close: "10:00" }] });
    expect(parsed).toEqual({});
  });
});

describe("dayKeyForDate / timeStringToMinutes", () => {
  it("maps a known UTC date to the correct day key", () => {
    expect(dayKeyForDate(MONDAY)).toBe("mon");
    expect(dayKeyForDate(new Date("2026-09-27T00:00:00.000Z"))).toBe("sun");
  });

  it("converts HH:mm to minutes since midnight", () => {
    expect(timeStringToMinutes("00:00")).toBe(0);
    expect(timeStringToMinutes("09:30")).toBe(570);
    expect(timeStringToMinutes("23:45")).toBe(1425);
  });
});

describe("computeAvailableSlots", () => {
  const workingHours = {
    mon: [{ open: "09:00", close: "10:30" }], // 3 x 30-min slots: 09:00, 09:30, 10:00
    tue: [] as never[],
  };

  it("generates slots at the configured interval within working hours", () => {
    const slots = computeAvailableSlots({
      workingHours,
      fromDate: MONDAY,
      days: 1,
      slotMinutes: DEFAULT_SLOT_MINUTES,
      existingAppointments: [],
      now: new Date("2026-09-20T00:00:00.000Z"), // before the window, nothing excluded
    });

    expect(slots.map((s) => s.startTime.toISOString())).toEqual([
      "2026-09-21T09:00:00.000Z",
      "2026-09-21T09:30:00.000Z",
      "2026-09-21T10:00:00.000Z",
    ]);
    expect(slots[0].endTime.toISOString()).toBe("2026-09-21T09:30:00.000Z");
  });

  it("returns no slots for a day with no configured hours", () => {
    const slots = computeAvailableSlots({
      workingHours,
      fromDate: new Date("2026-09-22T00:00:00.000Z"), // Tuesday, empty ranges
      days: 1,
      existingAppointments: [],
      now: new Date("2026-09-20T00:00:00.000Z"),
    });
    expect(slots).toEqual([]);
  });

  it("excludes slots that overlap an existing booked appointment", () => {
    const slots = computeAvailableSlots({
      workingHours,
      fromDate: MONDAY,
      days: 1,
      existingAppointments: [
        { startTime: new Date("2026-09-21T09:30:00.000Z"), endTime: new Date("2026-09-21T10:00:00.000Z") },
      ],
      now: new Date("2026-09-20T00:00:00.000Z"),
    });
    expect(slots.map((s) => s.startTime.toISOString())).toEqual([
      "2026-09-21T09:00:00.000Z",
      "2026-09-21T10:00:00.000Z",
    ]);
  });

  it("excludes slots that start before `now`", () => {
    const slots = computeAvailableSlots({
      workingHours,
      fromDate: MONDAY,
      days: 1,
      existingAppointments: [],
      now: new Date("2026-09-21T09:45:00.000Z"), // mid-window
    });
    expect(slots.map((s) => s.startTime.toISOString())).toEqual(["2026-09-21T10:00:00.000Z"]);
  });

  it("spans multiple days and multiple ranges per day", () => {
    const hours = {
      mon: [
        { open: "09:00", close: "09:30" },
        { open: "13:00", close: "13:30" },
      ],
      tue: [{ open: "09:00", close: "09:30" }],
    };
    const slots = computeAvailableSlots({
      workingHours: hours,
      fromDate: MONDAY,
      days: 2,
      existingAppointments: [],
      now: new Date("2026-09-20T00:00:00.000Z"),
    });
    expect(slots.map((s) => s.startTime.toISOString())).toEqual([
      "2026-09-21T09:00:00.000Z",
      "2026-09-21T13:00:00.000Z",
      "2026-09-22T09:00:00.000Z",
    ]);
  });

  it("does not produce a slot that would run past closing time", () => {
    // 45-minute window, 30-minute slots -> only one slot fits, no partial trailing slot
    const slots = computeAvailableSlots({
      workingHours: { mon: [{ open: "09:00", close: "09:45" }] },
      fromDate: MONDAY,
      days: 1,
      existingAppointments: [],
      now: new Date("2026-09-20T00:00:00.000Z"),
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].startTime.toISOString()).toBe("2026-09-21T09:00:00.000Z");
  });
});
