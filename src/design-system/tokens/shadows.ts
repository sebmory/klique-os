import type { TokenScale } from "./types";

export const shadow = {
  none: "none",
  xs: "0 1px 2px rgba(14, 18, 24, 0.05), 0 1px 1px rgba(14, 18, 24, 0.04)",
  sm: "0 2px 6px rgba(14, 18, 24, 0.08), 0 1px 2px rgba(14, 18, 24, 0.06)",
  md: "0 8px 18px rgba(14, 18, 24, 0.11), 0 2px 6px rgba(14, 18, 24, 0.07)",
  lg: "0 14px 30px rgba(14, 18, 24, 0.14), 0 4px 10px rgba(14, 18, 24, 0.08)",
  xl: "0 24px 52px rgba(14, 18, 24, 0.18), 0 8px 20px rgba(14, 18, 24, 0.1)",
  focus: "0 0 0 3px rgba(44, 138, 225, 0.35)",
} as const satisfies TokenScale<string>;

export type ShadowToken = keyof typeof shadow;
