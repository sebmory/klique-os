import type { TokenScale } from "./types";

export const opacity = {
  hidden: "0",
  subtle: "0.64",
  medium: "0.8",
  strong: "0.92",
  visible: "1",
} as const satisfies TokenScale<string>;

export type OpacityToken = keyof typeof opacity;
