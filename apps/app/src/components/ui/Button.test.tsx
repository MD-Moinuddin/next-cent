import { fireEvent, render, screen } from "@testing-library/react-native";
import { Button } from "./Button";

it("calls onPress and exposes an accessible button", async () => {
  const onPress = jest.fn();
  await render(<Button label="Save" onPress={onPress} />);
  await fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("does not call onPress when disabled or loading", async () => {
  const onPress = jest.fn();
  await render(<Button label="Save" onPress={onPress} disabled />);
  await fireEvent.press(screen.getByRole("button", { name: "Save" }));
  await screen.rerender(<Button label="Save" onPress={onPress} loading />);
  await fireEvent.press(screen.getByRole("button", { name: "Save" }));
  expect(onPress).not.toHaveBeenCalled();
});
