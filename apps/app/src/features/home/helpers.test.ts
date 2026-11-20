import { dayLabel, spentPercent } from "./helpers";

const now = new Date(2026, 10, 17);

it("computes spent percent and clamps", () => {
  expect(spentPercent(0, 500)).toBeNull();
  expect(spentPercent(240000, 82360)).toBe(34);
  expect(spentPercent(1000, 5000)).toBe(100);
});

it("labels today, yesterday and older dates", () => {
  expect(dayLabel("2026-11-17", now)).toBe("Today");
  expect(dayLabel("2026-11-16", now)).toBe("Yesterday");
  expect(dayLabel("2026-11-02", now, "en-US")).toBe("Nov 2");
});
