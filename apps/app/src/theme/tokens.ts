export const palette = {
  light: {
    bg: "#F6F7FB",
    card: "#FFFFFF",
    ink: "#111827",
    muted: "#6B7280",
    line: "#E5E7EB",
    brand: "#2563EB",
    brandInk: "#FFFFFF",
    good: "#047857",
    bad: "#B91C1C",
    chip: "#EEF2FF",
  },
  dark: {
    bg: "#0B0F17",
    card: "#161B26",
    ink: "#F3F4F6",
    muted: "#9CA3AF",
    line: "#273042",
    brand: "#3B82F6",
    brandInk: "#0B0F17",
    good: "#34D399",
    bad: "#F87171",
    chip: "#1E293B",
  },
} as const;
export type Colors = { [K in keyof (typeof palette)["light"]]: string };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
