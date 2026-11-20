import { useWindowDimensions } from "react-native";

export const WIDE_BREAKPOINT = 900;
export function useBreakpoint(): { isWide: boolean } {
  return { isWide: useWindowDimensions().width >= WIDE_BREAKPOINT };
}
