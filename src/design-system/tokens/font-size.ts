import type { TokenScale } from "./types";

export const fontSize = {
  "display-xl": "4.5rem",
  "display-l": "3.75rem",
  "display-m": "3rem",
  h1: "2.25rem",
  h2: "1.875rem",
  h3: "1.5rem",
  h4: "1.25rem",
  "body-large": "1.125rem",
  body: "1rem",
  "body-small": "0.875rem",
  caption: "0.75rem",
  label: "0.75rem",
  button: "0.9375rem",
  xs: "0.75rem",
  sm: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
  "5xl": "3rem",
} as const satisfies TokenScale<string>;

export type FontSizeToken = keyof typeof fontSize;
