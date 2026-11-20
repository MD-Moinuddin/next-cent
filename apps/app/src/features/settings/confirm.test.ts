import { Alert, Platform } from "react-native";
import { confirmDestructive } from "./confirm";

const setOS = (os: string) =>
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
const original = Platform.OS;
afterEach(() => {
  setOS(original);
  jest.restoreAllMocks();
});

it("uses window.confirm on web", async () => {
  setOS("web");
  const confirm = jest.fn().mockReturnValue(true);
  (globalThis as { window?: unknown }).window = { confirm };
  await expect(confirmDestructive("Sure?")).resolves.toBe(true);
  expect(confirm).toHaveBeenCalledWith("Sure?");
  confirm.mockReturnValue(false);
  await expect(confirmDestructive("Sure?")).resolves.toBe(false);
});

it("uses an Alert with Cancel and Delete on native", async () => {
  setOS("ios");
  const spy = jest
    .spyOn(Alert, "alert")
    .mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === "destructive")?.onPress?.();
    });
  await expect(confirmDestructive("Sure?")).resolves.toBe(true);
  expect(spy.mock.calls[0]![0]).toBe("Sure?");
  spy.mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === "cancel")?.onPress?.();
  });
  await expect(confirmDestructive("Sure?")).resolves.toBe(false);
});
