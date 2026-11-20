import { act, renderHook } from "@testing-library/react-native";
import { useDebouncedValue } from "./useDebouncedValue";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("returns the initial value immediately and the latest value after the delay", async () => {
  const { result, rerender } = await renderHook(
    ({ v }: { v: string }) => useDebouncedValue(v, 300),
    { initialProps: { v: "a" } },
  );
  expect(result.current).toBe("a");
  await rerender({ v: "ab" });
  await rerender({ v: "abc" });
  await act(async () => {
    jest.advanceTimersByTime(299);
  });
  expect(result.current).toBe("a");
  await act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(result.current).toBe("abc");
});
it("restarts the timer on every change", async () => {
  const { result, rerender } = await renderHook(
    ({ v }: { v: string }) => useDebouncedValue(v, 300),
    { initialProps: { v: "a" } },
  );
  await rerender({ v: "b" });
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  await rerender({ v: "c" });
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  expect(result.current).toBe("a");
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  expect(result.current).toBe("c");
});
