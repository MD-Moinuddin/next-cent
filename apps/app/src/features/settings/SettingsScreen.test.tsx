import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";
import { SessionContext, type SessionApi } from "@/lib/auth/session";
import { clearLocalData, discardQueuedMutations } from "@/lib/query/clear";
import { ApiError, NetworkError } from "@/lib/query/errors";
import { queryKeys } from "@/lib/query/queryClient";
import { me } from "@/test/fixtures";
import {
  appWrapperFor,
  createTestClient,
  disposeClient,
  pressAndSettle,
  settle,
} from "@/test/wrapper";
import { confirmDestructive } from "./confirm";
import { exportCsv } from "./exportCsv";
import { SettingsScreen } from "./SettingsScreen";

jest.mock("@/lib/api", () => ({
  api: { getMe: jest.fn(), patchMe: jest.fn(), deleteMe: jest.fn() },
}));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("@/lib/query/clear", () => ({
  clearLocalData: jest.fn(),
  discardQueuedMutations: jest.fn(),
}));
jest.mock("./confirm", () => ({ confirmDestructive: jest.fn() }));
jest.mock("./exportCsv", () => ({ exportCsv: jest.fn() }));
const mocked = jest.mocked(api);
const confirm = jest.mocked(confirmDestructive);
const exportMock = jest.mocked(exportCsv);
const clear = jest.mocked(clearLocalData);
const discard = jest.mocked(discardQueuedMutations);

let client: QueryClient;
let session: jest.Mocked<SessionApi>;

function wrapper({ children }: { children: ReactNode }) {
  const Inner = appWrapperFor(client);
  return (
    <SessionContext.Provider value={session}>
      <Inner>{children}</Inner>
    </SessionContext.Provider>
  );
}
async function setup() {
  client.setQueryData(queryKeys.me, me);
  await render(<SettingsScreen />, { wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  client = createTestClient();
  session = {
    isLoaded: true,
    isSignedIn: true,
    userId: "u1",
    getToken: jest.fn(),
    signOut: jest.fn().mockResolvedValue(undefined),
    deleteAuthAccount: jest.fn().mockResolvedValue(undefined),
  };
  clear.mockResolvedValue(undefined);
  mocked.deleteMe.mockResolvedValue(undefined as never);
  confirm.mockResolvedValue(true);
});
afterEach(() => disposeClient(client));

it("shows the profile, navigation and appearance rows", async () => {
  await setup();
  expect(screen.getByLabelText("Home currency EUR")).toBeTruthy();
  expect(screen.getByLabelText(/^Opening balance .*1,000\.00$/)).toBeTruthy();
  expect(screen.getByLabelText(/^Monthly income .*2,400\.00$/)).toBeTruthy();
  expect(screen.getByText(t.settings.followsSystem)).toBeTruthy();
  await fireEvent.press(screen.getByTestId("settings-categories"));
  expect(mockRouter.push).toHaveBeenCalledWith("/categories");
  await fireEvent.press(screen.getByTestId("settings-recurring"));
  expect(mockRouter.push).toHaveBeenCalledWith("/recurring");
});

it("edits the profile in the onboarding form prefilled from the server", async () => {
  mocked.patchMe.mockResolvedValue({ ...me, opening_balance_minor: 50000 });
  await setup();
  await fireEvent.press(screen.getByTestId("settings-opening"));
  expect(screen.getByTestId("onboarding-opening").props.value).toBe("1000.00");
  expect(screen.getByTestId("onboarding-income").props.value).toBe("2400.00");
  expect(screen.queryByTestId("onboarding-skip")).toBeNull();
  await fireEvent.changeText(screen.getByTestId("onboarding-opening"), "500");
  await pressAndSettle(screen.getByTestId("onboarding-continue"));
  expect(mocked.patchMe).toHaveBeenCalledWith(
    expect.objectContaining({ opening_balance_minor: 50000 }),
  );
  expect(screen.queryByTestId("onboarding-continue")).toBeNull();
});

describe("export", () => {
  it("shows a busy state while exporting", async () => {
    let finish: () => void = () => undefined;
    exportMock.mockReturnValue(new Promise<void>((r) => (finish = r)));
    await setup();
    await pressAndSettle(screen.getByTestId("settings-export"));
    expect(
      screen.getByTestId("settings-export").props.accessibilityState,
    ).toMatchObject({ busy: true });
    finish();
    await settle();
    expect(
      screen.getByTestId("settings-export").props.accessibilityState,
    ).toMatchObject({ busy: false });
  });

  it("shows the offline message when the export has no connection", async () => {
    exportMock.mockRejectedValue(new NetworkError(new TypeError("x")));
    await setup();
    await pressAndSettle(screen.getByTestId("settings-export"));
    expect(screen.getByText(t.common.offlineOnly)).toBeTruthy();
  });

  it("shows an error toast when the export fails", async () => {
    exportMock.mockRejectedValue(new ApiError(500));
    await setup();
    await pressAndSettle(screen.getByTestId("settings-export"));
    expect(screen.getByText(t.errors.exportFailed)).toBeTruthy();
    expect(
      screen.getByTestId("settings-export").props.accessibilityState,
    ).toMatchObject({ busy: false });
  });
});

it("signs out through the session and goes to sign-in", async () => {
  await setup();
  await pressAndSettle(screen.getByTestId("settings-sign-out"));
  expect(session.signOut).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith("/sign-in");
  expect(clear).not.toHaveBeenCalled(); // the session wrapper owns clearing
});

it("shows an error and stays when sign-out fails", async () => {
  session.signOut.mockRejectedValue(new Error("x"));
  await setup();
  await pressAndSettle(screen.getByTestId("settings-sign-out"));
  expect(screen.getByText(t.errors.signOutFailed)).toBeTruthy();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

describe("delete account", () => {
  it("does nothing when not confirmed", async () => {
    confirm.mockResolvedValue(false);
    await setup();
    await pressAndSettle(screen.getByTestId("settings-delete-account"));
    expect(confirm).toHaveBeenCalledWith(t.settings.confirmDelete);
    expect(mocked.deleteMe).not.toHaveBeenCalled();
    expect(session.deleteAuthAccount).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled(); // queued writes survive a cancelled deletion
  });

  it("does nothing but show the offline message when the device is offline", async () => {
    onlineManager.setOnline(false);
    try {
      await setup();
      await pressAndSettle(screen.getByTestId("settings-delete-account"));
      expect(screen.getByText(t.common.offlineOnly)).toBeTruthy();
      expect(confirm).not.toHaveBeenCalled();
      expect(discard).not.toHaveBeenCalled(); // the queued writes are kept
      expect(mocked.deleteMe).not.toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("deletes the data, then the login, then leaves", async () => {
    await setup();
    await pressAndSettle(screen.getByTestId("settings-delete-account"));
    expect(mocked.deleteMe).toHaveBeenCalledTimes(1);
    expect(session.deleteAuthAccount).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledWith(client);
    expect(discard.mock.invocationCallOrder[0]!).toBeLessThan(
      mocked.deleteMe.mock.invocationCallOrder[0]!,
    );
    expect(mocked.deleteMe.mock.invocationCallOrder[0]!).toBeLessThan(
      session.deleteAuthAccount.mock.invocationCallOrder[0]!,
    );
    expect(mockRouter.replace).toHaveBeenCalledWith("/sign-in");
    expect(clear).not.toHaveBeenCalled();
  });

  it("runs nothing else and shows an error when the data deletion fails", async () => {
    mocked.deleteMe.mockRejectedValue(new ApiError(500, { code: "boom" }));
    await setup();
    await pressAndSettle(screen.getByTestId("settings-delete-account"));
    expect(screen.getByText(t.errors.deleteFailed)).toBeTruthy();
    expect(session.deleteAuthAccount).not.toHaveBeenCalled();
    expect(session.signOut).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("shows the offline message when the data deletion cannot reach the server", async () => {
    mocked.deleteMe.mockRejectedValue(new NetworkError(new Error("x")));
    await setup();
    await pressAndSettle(screen.getByTestId("settings-delete-account"));
    expect(screen.getByText(t.common.offlineOnly)).toBeTruthy();
    expect(session.deleteAuthAccount).not.toHaveBeenCalled();
  });

  it("signs out, tells the user and leaves when only the login removal fails", async () => {
    session.deleteAuthAccount.mockRejectedValue(new Error("clerk"));
    await setup();
    await pressAndSettle(screen.getByTestId("settings-delete-account"));
    expect(mocked.deleteMe).toHaveBeenCalledTimes(1);
    expect(session.signOut).toHaveBeenCalledTimes(1); // the wrapper clears local data
    expect(clear).not.toHaveBeenCalled();
    expect(screen.getByText(t.errors.authDeleteFailed)).toBeTruthy();
    expect(mockRouter.replace).toHaveBeenCalledWith("/sign-in");
  });

  it("still clears local data and leaves when that sign-out fails too", async () => {
    session.deleteAuthAccount.mockRejectedValue(new Error("clerk"));
    session.signOut.mockRejectedValue(new Error("clerk"));
    await setup();
    await pressAndSettle(screen.getByTestId("settings-delete-account"));
    expect(session.signOut).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(screen.getByText(t.errors.authDeleteFailed)).toBeTruthy();
    expect(mockRouter.replace).toHaveBeenCalledWith("/sign-in");
  });

  it("two rapid presses stack one confirm and one deletion", async () => {
    let answer: (v: boolean) => void = () => undefined;
    confirm.mockReturnValue(new Promise<boolean>((r) => (answer = r)));
    await setup();
    // Two presses in the same tick, through the host view's click handler (Pressable calls onPress).
    // Two un-awaited fireEvent calls would open overlapping act() scopes.
    const del = screen.getByTestId("settings-delete-account");
    const press = () => del.props.onClick({ nativeEvent: {} });
    await act(async () => {
      press();
      press();
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    answer(true);
    await settle();
    expect(mocked.deleteMe).toHaveBeenCalledTimes(1);
  });

  it("ignores export and sign-out while the delete confirm is open", async () => {
    let answer: (v: boolean) => void = () => undefined;
    confirm.mockReturnValue(new Promise<boolean>((r) => (answer = r)));
    await setup();
    await act(async () => {
      fireEvent.press(screen.getByTestId("settings-delete-account"));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("settings-export"));
      fireEvent.press(screen.getByTestId("settings-sign-out"));
    });
    expect(exportMock).not.toHaveBeenCalled();
    expect(session.signOut).not.toHaveBeenCalled();
    answer(false);
    await settle();
  });

  it("releases the busy flag when the user cancels", async () => {
    confirm.mockResolvedValueOnce(false);
    await setup();
    await pressAndSettle(screen.getByTestId("settings-delete-account"));
    expect(mocked.deleteMe).not.toHaveBeenCalled();
    await pressAndSettle(screen.getByTestId("settings-sign-out"));
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });
});
