import type { TokenScale } from "./types";

export const letterSpacing = {
  "display-xl": "-0.035em",
  "display-l": "-0.03em",
  "display-m": "-0.025em",
  h1: "-0.02em",
  h2: "-0.016em",
  h3: "-0.012em",
  h4: "-0.008em",
  "body-large": "0",
  body: "0",
  "body-small": "0.002em",
  caption: "0.01em",
  label: "0.08em",
  button: "0.01em",
  tighter: "-0.03em",
  tight: "-0.015em",
  normal: "0",
  wide: "0.02em",
  wider: "0.06em",
} as const satisfies TokenScale<string>;

export type LetterSpacingToken = keyof typeof letterSpacing;
