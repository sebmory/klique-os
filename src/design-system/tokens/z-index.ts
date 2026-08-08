import type { TokenScale } from "./types";

export const zIndex = {
  base: 0,
  content: 10,
  sticky: 100,
  dropdown: 400,
  overlay: 700,
  modal: 800,
  popover: 900,
  toast: 1000,
  tooltip: 1100,
} as const satisfies TokenScale<number>;

export type ZIndexToken = keyof typeof zIndex;
