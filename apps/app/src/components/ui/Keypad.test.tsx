import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import { Keypad, mapKeyboardKey } from "./Keypad";

describe("mapKeyboardKey", () => {
  it("maps digits, dot, comma and Backspace; ignores the rest", () => {
    expect(mapKeyboardKey("7")).toBe("7");
    expect(mapKeyboardKey(".")).toBe(".");
    expect(mapKeyboardKey(",")).toBe(".");
    expect(mapKeyboardKey("Backspace")).toBe("back");
    expect(mapKeyboardKey("a")).toBeNull();
    expect(mapKeyboardKey("Enter")).toBeNull();
    expect(mapKeyboardKey("12")).toBeNull();
  });
});

describe("Keypad", () => {
  it("renders 12 accessible keys at least 56 high and reports presses", async () => {
    const onKey = jest.fn();
    await render(<Keypad onKey={onKey} />);
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0])
      expect(screen.getByTestId(`key-${id}`)).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "decimal point" }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("key-1").props.style).toMatchObject({
      height: 56,
    });
    expect(screen.getByRole("button", { name: "backspace" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("key-4"));
    await fireEvent.press(screen.getByTestId("key-dot"));
    await fireEvent.press(screen.getByTestId("key-back"));
    expect(onKey.mock.calls.map((c) => c[0])).toEqual(["4", ".", "back"]);
  });

  it("disables the dot when decimals are not allowed", async () => {
    const onKey = jest.fn();
    await render(<Keypad onKey={onKey} allowDot={false} />);
    await fireEvent.press(screen.getByTestId("key-dot"));
    expect(onKey).not.toHaveBeenCalled();
  });

  describe("web keyboard", () => {
    const original = Platform.OS;
    const target = globalThis as unknown as Record<string, unknown>;
    let add: jest.Mock;
    let remove: jest.Mock;
    beforeEach(() => {
      add = jest.fn();
      remove = jest.fn();
      target.addEventListener = add;
      target.removeEventListener = remove;
    });
    afterEach(() => {
      Platform.OS = original;
      delete target.addEventListener;
      delete target.removeEventListener;
    });

    it("adds a keydown listener on web, maps keys, and removes it on unmount", async () => {
      Platform.OS = "web";
      const onKey = jest.fn();
      const view = await render(<Keypad onKey={onKey} />);
      expect(add).toHaveBeenCalledTimes(1);
      expect(add.mock.calls[0]![0]).toBe("keydown");
      const handler = add.mock.calls[0]![1] as (e: unknown) => void;
      handler({ key: "5" });
      handler({ key: "," });
      handler({ key: "Backspace" });
      handler({ key: "x" });
      handler({ key: "9", ctrlKey: true });
      handler({ key: "3", target: { tagName: "INPUT" } });
      expect(onKey.mock.calls.map((c) => c[0])).toEqual(["5", ".", "back"]);
      await view.unmount();
      expect(remove).toHaveBeenCalledWith("keydown", handler);
    });

    it("adds no listener on native", async () => {
      Platform.OS = "ios";
      await render(<Keypad onKey={jest.fn()} />);
      expect(add).not.toHaveBeenCalled();
    });
  });
});
