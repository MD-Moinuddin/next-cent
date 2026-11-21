import { expect, test } from "@playwright/test";

test("unauthenticated visitors land on sign-in without console or page errors", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    // ERR_ABORTED is the browser cancelling a superseded request, not a failure.
    if (r.failure()?.errorText !== "net::ERR_ABORTED")
      problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
  });
  await page.goto("/");
  await expect(page.getByTestId("sign-in-submit")).toBeVisible();
  await expect(page.getByTestId("sign-in-email")).toBeVisible();
  expect(problems).toEqual([]);
});
