import type { TokenScale } from "./types";

export const borderRadius = {
  none: "0",
  xs: "0.25rem",
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  full: "9999px",
} as const satisfies TokenScale<string>;

export type BorderRadiusToken = keyof typeof borderRadius;
