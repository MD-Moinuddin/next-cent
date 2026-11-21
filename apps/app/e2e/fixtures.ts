import { expect, test as base } from "@playwright/test";
import { mockApi, signedIn, type MockApi, type MockOptions } from "./mockApi";

/**
 * `test` with a signed-in session (stub auth) and the mocked API. After every test it FAILS if the app
 * called an endpoint the mock does not know (listing method and URL), instead of a silent 404.
 */
export const test = base.extend<{
  mockOptions: MockOptions;
  session: boolean;
  mock: MockApi;
}>({
  mockOptions: [{}, { option: true }],
  session: [true, { option: true }],
  mock: async ({ page, mockOptions, session }, use) => {
    if (session) await signedIn(page);
    const mock = await mockApi(page, mockOptions);
    await use(mock);
    expect(mock.unmatched(), "requests no mock handler matched").toEqual([]);
  },
});
export { expect };
