import { defineConfig } from "@playwright/test";

// Serves the stub-auth web bundle built by `pnpm run build:web:e2e` (see metro-e2e.js).
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "pnpm exec serve -s dist-e2e -l 4173",
    port: 4173,
    // Never reuse a running server: a stale one could serve an old or non-stub bundle.
    reuseExistingServer: false,
    cwd: "..",
  },
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
});
