import { slug } from "./slug";

it("builds stable ascii slugs", () => {
  expect(slug("Dining out")).toBe("dining-out");
  expect(slug("Café & Bar!")).toBe("cafe-bar");
  expect(slug("Lidl")).toBe("lidl");
  expect(slug("")).toBe("");
});
