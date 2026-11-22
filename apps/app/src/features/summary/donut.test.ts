import { donutArcs } from "./DonutChart";

it("splits the circle in proportion to the values", () => {
  const arcs = donutArcs([75, 25]);
  expect(arcs).toHaveLength(2);
  // the first segment is three times as long as the second (the 2px gap is removed from each)
  expect((arcs[0]!.length + 2) / (arcs[1]!.length + 2)).toBeCloseTo(3, 5);
  expect(arcs[0]!.offset).toBe(0);
  expect(arcs[1]!.offset).toBeCloseTo(arcs[0]!.length + 2, 5);
});
it("returns no arcs for a zero total and keeps a single segment whole", () => {
  expect(donutArcs([])).toEqual([]);
  expect(donutArcs([0, 0])).toEqual([]);
  const [only] = donutArcs([10]);
  expect(only!.offset).toBe(0);
  expect(only!.length).toBeCloseTo(2 * Math.PI * 55, 5);
});
