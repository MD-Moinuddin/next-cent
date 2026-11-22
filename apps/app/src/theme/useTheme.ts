import { useColorScheme } from "react-native";
import {
  chartColors,
  palette,
  radius,
  spacing,
  type Colors,
  type Radius,
  type Spacing,
} from "./tokens";

export function useTheme(): {
  colors: Colors;
  spacing: Spacing;
  radius: Radius;
  chart: readonly string[];
  dark: boolean;
} {
  const dark = useColorScheme() === "dark";
  return {
    colors: palette[dark ? "dark" : "light"],
    spacing,
    radius,
    chart: chartColors[dark ? "dark" : "light"],
    dark,
  };
}
