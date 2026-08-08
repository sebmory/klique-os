import { colorPalette } from "./palette";

export const semanticColorVariables = {
  light: {
    background: colorPalette.Neutral[50],
    surface: colorPalette.Neutral[0],
    surfaceSecondary: colorPalette.Neutral[100],
    surfaceHover: colorPalette.Neutral[200],
    border: colorPalette.Neutral[200],
    borderStrong: colorPalette.Neutral[300],
    textPrimary: colorPalette.Neutral[950],
    textSecondary: colorPalette.Neutral[700],
    textMuted: colorPalette.Neutral[500],
    link: colorPalette.Accent[600],
    focus: colorPalette.Accent[500],
    overlay: "rgba(14, 18, 24, 0.52)",
  },
  dark: {
    background: colorPalette.Neutral[950],
    surface: colorPalette.Neutral[900],
    surfaceSecondary: colorPalette.Neutral[800],
    surfaceHover: colorPalette.Neutral[700],
    border: colorPalette.Neutral[700],
    borderStrong: colorPalette.Neutral[600],
    textPrimary: colorPalette.Neutral[0],
    textSecondary: colorPalette.Neutral[300],
    textMuted: colorPalette.Neutral[400],
    link: colorPalette.Accent[300],
    focus: colorPalette.Accent[400],
    overlay: "rgba(0, 0, 0, 0.64)",
  },
} as const;

export type SemanticColorTheme = keyof typeof semanticColorVariables;
export type SemanticColorVariableName = keyof typeof semanticColorVariables.light;
