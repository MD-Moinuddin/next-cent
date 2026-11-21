import { expect, test } from "./fixtures";
import { categories, seedRecurring } from "./mockApi";

test.describe("onboarded user", () => {
  test.use({ mockOptions: { onboarded: false } });

  test("onboarding skip, quick-add with the keyboard, edit, delete and undo", async ({
    page,
    mock,
  }) => {
    await page.goto("/");

    // Onboarding can be skipped and lands on Home.
    await page.getByTestId("onboarding-skip").click();
    await expect(page.getByTestId("home-balance")).toBeVisible();

    // Quick-add with the physical keyboard.
    await page.getByTestId("tab-add").click();
    await expect(page.getByTestId("quick-add-save")).toBeVisible();
    await page.keyboard.type("14.50");
    await expect(page.getByTestId("quick-add-amount")).toContainText("14.50");
    await page.getByTestId("category-chip-groceries").click();
    await page.getByTestId("quick-add-save").click();
    await expect(page.getByTestId("toast")).toContainText("Expense saved");
    await expect
      .poll(() => mock.transactions().map((t) => t.amount_minor))
      .toEqual([1450]);

    // The new row is in Transactions.
    await page.getByTestId("tab-transactions").click();
    const row = page.getByTestId("tx-row-groceries");
    await expect(row).toBeVisible();
    await expect(row).toContainText("14.50");

    // Edit the amount: clear it with Backspace, then type 20.
    await row.click();
    await expect(page.getByTestId("quick-add-amount")).toContainText("14.50");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
    await page.keyboard.type("20");
    await expect(page.getByTestId("quick-add-amount")).toContainText("20");
    await page.getByTestId("quick-add-save").click();
    await expect(page.getByTestId("tx-row-groceries")).toContainText("20.00");
    await expect
      .poll(() => mock.transactions().map((t) => t.amount_minor))
      .toEqual([2000]);

    // Delete, then Undo from the toast.
    await page.getByTestId("tx-row-groceries").click();
    await page.getByTestId("transaction-delete").click();
    await expect(page.getByTestId("toast")).toContainText(
      "Transaction deleted",
    );
    await expect(page.getByTestId("tx-row-groceries")).toHaveCount(0);
    await expect
      .poll(() => mock.transactions().filter((t) => !t.deleted_at).length)
      .toBe(0);
    await page.getByTestId("toast-action").click();
    await expect(page.getByTestId("tx-row-groceries")).toBeVisible();
    await expect
      .poll(() => mock.transactions().filter((t) => !t.deleted_at).length)
      .toBe(1);
  });
});

test.describe("Settings sub-screens", () => {
  test.use({ mockOptions: { recurring: [seedRecurring()] } });

  // Regression test: these routes were unreachable while they were declared with `href: null`
  // (expo-router 58 treats that as a hidden tab and redirects away).
  test("Settings > Categories and Settings > Recurring open and list rows", async ({
    page,
    mock,
  }) => {
    void mock;
    await page.goto("/");
    await expect(page.getByTestId("home-balance")).toBeVisible();

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-categories").click();
    await expect(
      page.getByRole("heading", { name: "Categories" }),
    ).toBeVisible();
    await expect(
      page.getByTestId(`category-row-${categories[0].id}`),
    ).toBeVisible();

    await page.getByTestId("tab-settings").click();
    await page.getByTestId("settings-recurring").click();
    await expect(
      page.getByRole("heading", { name: "Recurring" }),
    ).toBeVisible();
    await expect(page.getByTestId(/^recurring-row-/)).toContainText("Rent");
  });
});

test.describe("signing in", () => {
  test.use({ session: false });
  test("signing in through the form reaches Home", async ({ page, mock }) => {
    void mock;
    await page.goto("/");
    await page.getByTestId("sign-in-email").fill("e2e@example.com");
    await page.getByTestId("sign-in-password").fill("not-a-real-password");
    await page.getByTestId("sign-in-submit").click();
    await expect(page.getByTestId("home-balance")).toBeVisible();
  });
});

// OWNER-PENDING. NOT WIRED YET: this file's webServer serves the stub bundle (dist-e2e) and the app talks to
// http://localhost:8000. To run it for real the owner must (1) build the web app WITHOUT the stub and with real
// keys (`EXPO_PUBLIC_API_URL=<api> EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<pk_test_...> pnpm run build:web`),
// (2) serve `dist` instead of `dist-e2e` (change the webServer command in playwright.config.ts), (3) run the API
// and a Clerk development test user, then set E2E_EMAIL and E2E_PASSWORD.
test.describe("authenticated flow against the real backend", () => {
  test.skip(
    !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
    "OWNER-PENDING: needs E2E_EMAIL/E2E_PASSWORD plus a non-stub build served instead of dist-e2e (see comment above)",
  );
  test("sign in, quick-add with the keyboard and see the transaction", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("sign-in-email").fill(process.env.E2E_EMAIL!);
    await page.getByTestId("sign-in-password").fill(process.env.E2E_PASSWORD!);
    await page.getByTestId("sign-in-submit").click();
    const skip = page.getByTestId("onboarding-skip");
    await expect(skip.or(page.getByTestId("home-balance"))).toBeVisible();
    if (await skip.isVisible()) await skip.click();
    await page.getByTestId("tab-add").click();
    await page.keyboard.type("14.50");
    await page.getByTestId("category-chip-groceries").click();
    await page.getByTestId("quick-add-save").click();
    await expect(page.getByText("Expense saved")).toBeVisible();
  });
});
