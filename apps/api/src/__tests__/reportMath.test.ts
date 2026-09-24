import { describe, it, expect } from "vitest";
import { safeRate, estimateRevenue, roundTo2 } from "../modules/reports/reportMath";

describe("safeRate", () => {
  it("computes a simple ratio", () => {
    expect(safeRate(1, 4)).toBe(0.25);
  });

  it("returns null rather than NaN/Infinity for a zero denominator", () => {
    expect(safeRate(5, 0)).toBeNull();
  });

  it("returns null for a negative denominator (defensive)", () => {
    expect(safeRate(5, -1)).toBeNull();
  });

  it("returns 0 when numerator is 0 but denominator is positive", () => {
    expect(safeRate(0, 10)).toBe(0);
  });
});

describe("estimateRevenue", () => {
  it("multiplies booking count by appointment value", () => {
    expect(estimateRevenue(4, 85)).toBe(340);
  });

  it("returns null (not 0) when appointment value isn't configured", () => {
    expect(estimateRevenue(4, null)).toBeNull();
    expect(estimateRevenue(4, undefined)).toBeNull();
  });

  it("returns 0 for zero bookings with a configured value", () => {
    expect(estimateRevenue(0, 85)).toBe(0);
  });

  it("rounds to 2 decimal places", () => {
    expect(estimateRevenue(3, 33.333)).toBe(100);
  });
});

describe("roundTo2", () => {
  it("rounds to 2dp", () => {
    expect(roundTo2(1.005)).toBeCloseTo(1, 2);
    expect(roundTo2(10.126)).toBe(10.13);
  });
});
