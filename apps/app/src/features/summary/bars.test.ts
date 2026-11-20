import { barWidths } from "./SummaryBars";

it("scales bars relative to the largest total", () => {
  expect(barWidths([12000, 4700, 0])).toEqual([100, 39, 0]);
});
it("handles empty and all-zero input", () => {
  expect(barWidths([])).toEqual([]);
  expect(barWidths([0, 0])).toEqual([0, 0]);
});
