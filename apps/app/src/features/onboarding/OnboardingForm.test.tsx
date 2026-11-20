import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { getLocales } from "expo-localization";
import { queryKeys } from "@/lib/query/queryClient";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/query/errors";
import { createTestClient, wrapperFor, pressAndSettle } from "@/test/wrapper";
import { OnboardingForm } from "./OnboardingForm";

jest.mock("@/lib/api", () => ({
  api: { getMe: jest.fn(), patchMe: jest.fn() },
}));
const mocked = jest.mocked(api);
const me = {
  id: "u1",
  created_at: "2026-11-01T00:00:00Z",
  home_currency: "EUR",
  monthly_income_minor: null,
  onboarding_completed: true,
  opening_balance_minor: null,
};

async function setup(
  props: Partial<Parameters<typeof OnboardingForm>[0]> = {},
) {
  const onDone = jest.fn();
  mocked.getMe.mockResolvedValue({ ...me, onboarding_completed: false });
  mocked.patchMe.mockResolvedValue(me);
  // Prefetch `me` so its resolution cannot land as a late, un-acted update after a short test.
  const client = createTestClient();
  await client.prefetchQuery({ queryKey: queryKeys.me, queryFn: api.getMe });
  await render(
    <OnboardingForm
      submitLabel="Continue"
      onDone={onDone}
      initial={{ currency: "EUR" }}
      {...props}
    />,
    { wrapper: wrapperFor(client) },
  );
  return onDone;
}

jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
const locales = jest.mocked(getLocales);
const deviceCurrency = (code: string | null) =>
  locales.mockReturnValue([{ currencyCode: code }] as never);

beforeEach(() => {
  jest.clearAllMocks();
  deviceCurrency("EUR");
});

async function currencyStarted(
  server: string,
  completed: boolean,
  initial?: { currency: string },
) {
  mocked.getMe.mockResolvedValue({
    ...me,
    home_currency: server,
    onboarding_completed: completed,
  });
  mocked.patchMe.mockResolvedValue(me);
  const client = createTestClient();
  await client.prefetchQuery({
    queryKey: queryKeys.me,
    queryFn: api.getMe,
  });
  await render(
    <OnboardingForm
      submitLabel="Continue"
      onDone={jest.fn()}
      initial={initial}
    />,
    { wrapper: wrapperFor(client) },
  );
  return screen.getByTestId("currency-picker-open");
}

it("defaults to the device currency while onboarding is incomplete", async () => {
  expect(await currencyStarted("USD", false)).toHaveAccessibleName(
    "Home currency: EUR",
  );
});

it("falls back to the server currency when the device currency is unsupported", async () => {
  deviceCurrency("XXX");
  expect(await currencyStarted("GBP", false)).toHaveAccessibleName(
    "Home currency: GBP",
  );
});

it("keeps the server currency once onboarding is completed", async () => {
  expect(await currencyStarted("USD", true)).toHaveAccessibleName(
    "Home currency: USD",
  );
});

it("lets an explicit initial currency win", async () => {
  expect(
    await currencyStarted("USD", false, { currency: "JPY" }),
  ).toHaveAccessibleName("Home currency: JPY");
});

it("explains comma decimals", async () => {
  await setup();
  await fireEvent.changeText(screen.getByTestId("onboarding-opening"), "14,50");
  await pressAndSettle(screen.getByTestId("onboarding-continue"));
  expect(
    await screen.findByText("Use a dot as the decimal separator, e.g. 14.50"),
  ).toBeOnTheScreen();
});

it("shows localised messages for bad amounts and does not submit", async () => {
  await setup();
  await fireEvent.changeText(screen.getByTestId("onboarding-opening"), "1.234");
  await fireEvent.changeText(screen.getByTestId("onboarding-income"), "abc");
  await pressAndSettle(screen.getByTestId("onboarding-continue"));
  expect(
    await screen.findByText("Too many decimal places for this currency"),
  ).toBeOnTheScreen();
  expect(screen.getByText("Enter a valid amount")).toBeOnTheScreen();
  expect(mocked.patchMe).not.toHaveBeenCalled();
});

it("submits minor units with onboarding_completed", async () => {
  const onDone = await setup();
  await fireEvent.changeText(
    screen.getByTestId("onboarding-opening"),
    "1250.00",
  );
  await fireEvent.changeText(
    screen.getByTestId("onboarding-income"),
    "2400.00",
  );
  await pressAndSettle(screen.getByTestId("onboarding-continue"));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(mocked.patchMe).toHaveBeenCalledWith({
    home_currency: "EUR",
    opening_balance_minor: 125000,
    monthly_income_minor: 240000,
    onboarding_completed: true,
  });
});

it("skip patches only onboarding_completed", async () => {
  const onDone = await setup({ allowSkip: true });
  await pressAndSettle(screen.getByTestId("onboarding-skip"));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(mocked.patchMe).toHaveBeenCalledWith({ onboarding_completed: true });
});

it("hides skip unless allowed", async () => {
  await setup();
  expect(screen.queryByTestId("onboarding-skip")).toBeNull();
});

it("maps currency_locked to its message and announces it", async () => {
  const onDone = await setup();
  mocked.patchMe.mockRejectedValue(
    new ApiError(409, { code: "currency_locked" }),
  );
  await pressAndSettle(screen.getByTestId("onboarding-continue"));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    "Home currency can't change after you've added transactions",
  );
  expect(onDone).not.toHaveBeenCalled();
});

it("lets the user pick another currency", async () => {
  await setup();
  await fireEvent.press(screen.getByTestId("currency-picker-open"));
  await fireEvent.changeText(
    await screen.findByLabelText("Search currency"),
    "usd",
  );
  await fireEvent.press(await screen.findByTestId("currency-option-USD"));
  await fireEvent.changeText(screen.getByTestId("onboarding-opening"), "5");
  await pressAndSettle(screen.getByTestId("onboarding-continue"));
  await waitFor(() =>
    expect(mocked.patchMe).toHaveBeenCalledWith({
      home_currency: "USD",
      opening_balance_minor: 500,
      onboarding_completed: true,
    }),
  );
});
