import type { TokenScale } from "./types";

export const lineHeight = {
  "display-xl": "1.05",
  "display-l": "1.08",
  "display-m": "1.12",
  h1: "1.15",
  h2: "1.2",
  h3: "1.3",
  h4: "1.35",
  "body-large": "1.6",
  body: "1.6",
  "body-small": "1.55",
  caption: "1.45",
  label: "1.4",
  button: "1.2",
  tight: "1.2",
  snug: "1.35",
  normal: "1.5",
  relaxed: "1.65",
} as const satisfies TokenScale<string>;

export type LineHeightToken = keyof typeof lineHeight;
