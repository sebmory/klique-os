import type { TokenScale } from "./types";

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 800,
} as const satisfies TokenScale<number>;

export type FontWeightToken = keyof typeof fontWeight;
