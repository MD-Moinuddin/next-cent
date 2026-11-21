import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { categories, seedRecurring, seedTransaction } from "./mockApi";
import type { Page } from "@playwright/test";

async function expectNoSeriousViolations(page: Page) {
  // The tab bar's hover overlay belongs to the navigation library: audit the resting state, not a hover.
  await page.mouse.move(0, 0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes
        .map((n) => `${n.target.join(" ")} :: ${n.failureSummary}`)
        .slice(0, 4),
    }));
  expect(serious).toEqual([]);
}

test("sign-in page has no serious or critical accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("sign-in-submit").waitFor();
  await expectNoSeriousViolations(page);
});

const seeded = {
  transactions: [
    seedTransaction(),
    seedTransaction({
      id: "10000000-0000-4000-8000-000000000002",
      merchant: "Lidl",
      category_id: categories[0].id,
      amount_minor: 3215,
    }),
  ],
  recurring: [seedRecurring()],
};

test.describe("main screens (stub auth, mocked API)", () => {
  test.use({ mockOptions: seeded });
  test.beforeEach(async ({ page, mock }) => {
    void mock;
    await page.goto("/");
    await expect(page.getByTestId("home-balance")).toBeVisible();
  });

  test("Home", async ({ page }) => {
    await expect(page.getByTestId(/^recent-/).first()).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("Transactions", async ({ page }) => {
    await page.getByTestId("tab-transactions").click();
    await expect(page.getByTestId("tx-row-dining")).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("Edit transaction", async ({ page }) => {
    await page.getByTestId("tab-transactions").click();
    await page.getByTestId("tx-row-lidl").click();
    await expect(page.getByTestId("transaction-delete")).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("Quick-add", async ({ page }) => {
    await page.getByTestId("tab-add").click();
    await expect(page.getByTestId("quick-add-save")).toBeVisible();
    await expect(page.getByTestId("category-chip-groceries")).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("Summary", async ({ page }) => {
    await page.getByTestId("tab-summary").click();
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("Settings", async ({ page }) => {
    await page.getByTestId("tab-settings").click();
    await expect(page.getByTestId("settings-sign-out")).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("Categories", async ({ page }) => {
    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-categories").click();
    await expect(page.getByTestId("category-new")).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("Recurring", async ({ page }) => {
    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-recurring").click();
    await expect(page.getByTestId(/^recurring-row-/)).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});

test.describe("onboarding", () => {
  test.use({ mockOptions: { onboarded: false } });
  test("Onboarding", async ({ page, mock }) => {
    void mock;
    await page.goto("/");
    await expect(page.getByTestId("onboarding-skip")).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark", mockOptions: seeded });
  test.beforeEach(async ({ page, mock }) => {
    void mock;
    await page.goto("/");
    await expect(page.getByTestId("home-balance")).toBeVisible();
    // The app really rendered its dark palette (bg #0B0F17), so this is not a vacuous light-mode run.
    await expect
      .poll(() =>
        page.locator('[style*="background-color: rgb(11, 15, 23)"]').count(),
      )
      .toBeGreaterThan(0);
  });
  test("Home", async ({ page }) => {
    await expect(page.getByTestId(/^recent-/).first()).toBeVisible();
    await expectNoSeriousViolations(page);
  });
  test("Quick-add", async ({ page }) => {
    await page.getByTestId("tab-add").click();
    await expect(page.getByTestId("quick-add-save")).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});
