import { useColorScheme } from "react-native";
import {
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
  dark: boolean;
} {
  const dark = useColorScheme() === "dark";
  return { colors: palette[dark ? "dark" : "light"], spacing, radius, dark };
}
