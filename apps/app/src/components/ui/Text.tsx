import { Text as RNText, type TextProps } from "react-native";
import { useTheme } from "@/theme/useTheme";

type Variant = "title" | "body" | "caption" | "amount" | "label";
type Tone = "default" | "muted" | "good" | "bad";
const sizes: Record<
  Variant,
  { fontSize: number; fontWeight: "400" | "600" | "700" }
> = {
  title: { fontSize: 22, fontWeight: "700" },
  body: { fontSize: 16, fontWeight: "400" },
  caption: { fontSize: 13, fontWeight: "400" },
  amount: { fontSize: 36, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "600" },
};

export function Text({
  variant = "body",
  tone = "default",
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const { colors } = useTheme();
  const color = {
    default: colors.ink,
    muted: colors.muted,
    good: colors.good,
    bad: colors.bad,
  }[tone];
  return <RNText {...rest} style={[sizes[variant], { color }, style]} />;
}
