import { palette } from "./tokens";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
};

describe.each(["light", "dark"] as const)(
  "%s palette meets WCAG AA (4.5:1) for text",
  (mode) => {
    const c = palette[mode];
    it.each([
      ["ink on bg", c.ink, c.bg],
      ["ink on card", c.ink, c.card],
      ["muted on card", c.muted, c.card],
      ["muted on bg", c.muted, c.bg],
      ["good on card", c.good, c.card],
      ["bad on card", c.bad, c.card],
      ["brandInk on brand", c.brandInk, c.brand],
      ["brand on card", c.brand, c.card],
    ])("%s", (_name, fg, bg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  },
);
