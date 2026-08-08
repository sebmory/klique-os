import { animations, keyframes } from "../animations";
import { breakpoints } from "../breakpoints";
import { iconSizes, iconStrokeWidths } from "../icons";
import { radius } from "../radius";
import { shadows } from "../shadows";
import { spacing } from "../spacing";
import {
  colorPalette,
  semanticColorVariables,
  motionDurations,
  motionEasings,
  opacity,
  transition,
  transitionDuration,
  transitionEasing,
  transitionPreset,
  zIndex,
} from "../tokens";
import {
  fontFamilies,
  hierarchy,
  fontSizes,
  fontWeights,
  letterSpacings,
  lineHeights,
} from "../typography";

type TokenLeaf = string | number;
export type TokenNode = {
  readonly [key: string]: TokenLeaf | TokenNode;
};

export const themeTokenContract = {
  color: {
    palette: colorPalette,
    semantic: semanticColorVariables,
  },
  typography: {
    families: fontFamilies,
    sizes: fontSizes,
    lineHeights,
    weights: fontWeights,
    letterSpacings,
    hierarchy,
  },
  spacing,
  shadow: shadows,
  radius,
  motion: {
    duration: motionDurations,
    easing: motionEasings,
    transition,
    transitionDuration,
    transitionEasing,
    transitionPreset,
    animation: animations,
    keyframes,
  },
  layer: {
    zIndex,
    opacity,
  },
  breakpoint: breakpoints,
  icon: {
    size: iconSizes,
    stroke: iconStrokeWidths,
  },
} as const satisfies TokenNode;

const isTokenLeaf = (value: TokenLeaf | TokenNode): value is TokenLeaf => {
  return typeof value === "string" || typeof value === "number";
};

export const flattenTokens = (node: TokenNode, path: string[] = []): Record<string, string> => {
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(node)) {
    const nextPath = [...path, key];

    if (isTokenLeaf(value)) {
      output[nextPath.join("-")] = String(value);
      continue;
    }

    Object.assign(output, flattenTokens(value, nextPath));
  }

  return output;
};
