import type { TokenScale } from "./types";

export const typography = {
  sans: '"Inter", "Segoe UI", sans-serif',
  body: '"Inter", "Segoe UI", sans-serif',
  mono: '"IBM Plex Mono", "SFMono-Regular", monospace',
} as const satisfies TokenScale<string>;

export type TypographyToken = keyof typeof typography;
