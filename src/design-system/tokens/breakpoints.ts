import type { TokenScale } from "./types";

export const breakpoints = {
  xs: "420px",
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const satisfies TokenScale<string>;

export type BreakpointToken = keyof typeof breakpoints;
