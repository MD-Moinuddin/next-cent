import { describe, expect, it } from "vitest";
import {
  daysLeftInMonth,
  monthRange,
  todayIso,
  toIsoDate,
  weekRange,
} from "./dates";

describe("dates (local calendar dates)", () => {
  it("formats a local date without timezone shift", () => {
    expect(toIsoDate(new Date(2026, 10, 5, 23, 59))).toBe("2026-11-05");
  });
  it("returns today's local date", () => {
    expect(todayIso(new Date(2026, 0, 2, 0, 1))).toBe("2026-01-02");
  });
  it("computes month ranges including leap February", () => {
    expect(monthRange(new Date(2026, 10, 17))).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(monthRange(new Date(2028, 1, 10))).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });
  it("computes week ranges (Monday start by default)", () => {
    expect(weekRange(new Date(2026, 10, 18))).toEqual({
      from: "2026-11-16",
      to: "2026-11-22",
    });
    expect(weekRange(new Date(2026, 10, 18), 0)).toEqual({
      from: "2026-11-15",
      to: "2026-11-21",
    });
  });
  it("counts days left including today", () => {
    expect(daysLeftInMonth(new Date(2026, 10, 30))).toBe(1);
    expect(daysLeftInMonth(new Date(2026, 10, 1))).toBe(30);
  });
});
