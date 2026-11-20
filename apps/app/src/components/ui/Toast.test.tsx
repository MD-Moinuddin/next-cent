import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "./Button";
import { ToastProvider, useToast } from "./Toast";

const onAction = jest.fn();
function Trigger({ withAction = true }: { withAction?: boolean }) {
  const toast = useToast();
  return (
    <Button
      label="go"
      onPress={() =>
        toast.show({
          message: "Saved",
          ...(withAction ? { actionLabel: "Undo", onAction } : {}),
        })
      }
    />
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  onAction.mockClear();
});
afterEach(() => jest.useRealTimers());

it("shows a message and auto-dismisses after 5 seconds", async () => {
  await render(
    <ToastProvider>
      <Trigger withAction={false} />
    </ToastProvider>,
  );
  expect(screen.queryByTestId("toast")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "go" }));
  expect(screen.getByText("Saved")).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(4900);
  });
  expect(screen.getByText("Saved")).toBeTruthy();
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  expect(screen.queryByText("Saved")).toBeNull();
});

it("runs the action once and dismisses", async () => {
  await render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
  await fireEvent.press(screen.getByRole("button", { name: "go" }));
  await fireEvent.press(screen.getByTestId("toast-action"));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Saved")).toBeNull();
});

it("throws a clear error without a provider", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  await expect(render(<Trigger />)).rejects.toThrow("ToastProvider missing");
  spy.mockRestore();
});
