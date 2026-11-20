import {
  currentMonth,
  rangeFor,
  shiftMonth,
  shiftReference,
  shiftWeek,
  validateCustomRange,
} from "./ranges";

it("returns the calendar month", () => {
  expect(currentMonth(new Date(2026, 10, 17))).toEqual({
    from: "2026-11-01",
    to: "2026-11-30",
  });
});
it("shifts across year boundaries", () => {
  expect(shiftMonth(new Date(2026, 0, 15), -1).getMonth()).toBe(11);
  expect(shiftMonth(new Date(2026, 0, 15), -1).getFullYear()).toBe(2025);
});

describe("range helpers", () => {
  const ref = new Date(2026, 10, 18); // Wed 2026-11-18

  it("shifts a week by seven days across month and year ends", () => {
    expect(shiftWeek(ref, 1)).toEqual(new Date(2026, 10, 25));
    expect(shiftWeek(ref, -1)).toEqual(new Date(2026, 10, 11));
    expect(shiftWeek(new Date(2026, 0, 3), -1)).toEqual(new Date(2025, 11, 27));
  });
  it("shifts by mode", () => {
    expect(shiftReference("week", ref, 1)).toEqual(new Date(2026, 10, 25));
    expect(shiftReference("month", ref, -1)).toEqual(new Date(2026, 9, 1));
  });
  it("builds the range for week and month modes", () => {
    expect(rangeFor("week", ref)).toEqual({
      from: "2026-11-16",
      to: "2026-11-22",
    });
    expect(rangeFor("month", ref)).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });
});

describe("validateCustomRange", () => {
  it("accepts a valid range", () => {
    expect(validateCustomRange("2026-11-01", "2026-11-30")).toEqual({
      ok: true,
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(validateCustomRange("2026-11-01", "2026-11-01").ok).toBe(true);
  });
  it("rejects malformed and impossible dates", () => {
    expect(validateCustomRange("2026-1-01", "2026-11-30")).toEqual({
      ok: false,
      error: "invalid_date",
    });
    expect(validateCustomRange("2026-11-01", "2026-02-30")).toEqual({
      ok: false,
      error: "invalid_date",
    });
    expect(validateCustomRange("", "")).toEqual({
      ok: false,
      error: "invalid_date",
    });
  });
  it("rejects a reversed range", () => {
    expect(validateCustomRange("2026-11-30", "2026-11-01")).toEqual({
      ok: false,
      error: "invalid_range",
    });
  });
  it("allows at most 3660 days between the dates", () => {
    expect(validateCustomRange("2016-01-01", "2026-01-01").ok).toBe(true); // 3653 days
    expect(validateCustomRange("2000-01-01", "2010-01-02").ok).toBe(true); // 3654 days
    expect(validateCustomRange("2000-01-01", "2010-01-08")).toEqual({
      ok: true,
      from: "2000-01-01",
      to: "2010-01-08",
    }); // 3660
    expect(validateCustomRange("2000-01-01", "2010-01-09")).toEqual({
      ok: false,
      error: "range_too_long",
    });
  });
});
