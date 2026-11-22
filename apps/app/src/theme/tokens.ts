// NextCent design tokens. Primary is Navy, secondary (accent) is Sky; every text/background pair meets WCAG AA.
export const palette = {
  light: {
    bg: "#F4F7F6",
    card: "#FFFFFF",
    ink: "#10201E",
    muted: "#46565A",
    line: "#DDE5E3",
    brand: "#0F4C81", // primary: buttons, active tab, links (white on it 9:1)
    brandInk: "#FFFFFF",
    brandDeep: "#0B2545", // hero surfaces (white on it 16:1)
    brandDeepInk: "#FFFFFF",
    brandDeepMuted: "#BCD3EA",
    accent: "#38BDF8", // secondary: the Add button, progress, highlights (ink on it 7.6:1)
    accentInk: "#0B2545",
    good: "#0F4C81", // income; always paired with a "+" sign
    bad: "#C2410C", // over budget, errors, destructive (white on it 5.2:1)
    chip: "#DDE9F5",
    chipInk: "#0B2545",
  },
  dark: {
    bg: "#0A1628",
    card: "#112240",
    ink: "#F1F5F9",
    muted: "#A3B5CB",
    line: "#1F3A63",
    brand: "#38BDF8",
    brandInk: "#0B2545",
    brandDeep: "#0D2B52",
    brandDeepInk: "#FFFFFF",
    brandDeepMuted: "#BCD3EA",
    accent: "#38BDF8",
    accentInk: "#0B2545",
    good: "#7DD3FC",
    bad: "#FB923C",
    chip: "#18305A",
    chipInk: "#F1F5F9",
  },
} as const;
export type Colors = { [K in keyof (typeof palette)["light"]]: string };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
// One soft elevation level, used by cards and the Add button.
export const shadow = {
  card: {
    shadowColor: "#0B2545",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  hero: {
    shadowColor: "#0B2545",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
} as const;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
