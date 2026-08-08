import { fontSize } from "./font-size";
import { fontWeight } from "./font-weight";
import { letterSpacing } from "./letter-spacing";
import { lineHeight } from "./line-height";
import { typography } from "./typography";

type TextStyle = {
  readonly fontFamily: (typeof typography)[keyof typeof typography];
  readonly fontSize: (typeof fontSize)[keyof typeof fontSize];
  readonly fontWeight: (typeof fontWeight)[keyof typeof fontWeight];
  readonly lineHeight: (typeof lineHeight)[keyof typeof lineHeight];
  readonly letterSpacing: (typeof letterSpacing)[keyof typeof letterSpacing];
  readonly textTransform?: "none" | "uppercase";
};

export const textStyles = {
  displayXL: {
    fontFamily: typography.sans,
    fontSize: fontSize["display-xl"],
    fontWeight: fontWeight.black,
    lineHeight: lineHeight["display-xl"],
    letterSpacing: letterSpacing["display-xl"],
  },
  displayL: {
    fontFamily: typography.sans,
    fontSize: fontSize["display-l"],
    fontWeight: fontWeight.black,
    lineHeight: lineHeight["display-l"],
    letterSpacing: letterSpacing["display-l"],
  },
  displayM: {
    fontFamily: typography.sans,
    fontSize: fontSize["display-m"],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight["display-m"],
    letterSpacing: letterSpacing["display-m"],
  },
  h1: {
    fontFamily: typography.sans,
    fontSize: fontSize.h1,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.h1,
    letterSpacing: letterSpacing.h1,
  },
  h2: {
    fontFamily: typography.sans,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.h2,
    letterSpacing: letterSpacing.h2,
  },
  h3: {
    fontFamily: typography.sans,
    fontSize: fontSize.h3,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.h3,
    letterSpacing: letterSpacing.h3,
  },
  h4: {
    fontFamily: typography.sans,
    fontSize: fontSize.h4,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.h4,
    letterSpacing: letterSpacing.h4,
  },
  bodyLarge: {
    fontFamily: typography.body,
    fontSize: fontSize["body-large"],
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight["body-large"],
    letterSpacing: letterSpacing["body-large"],
  },
  body: {
    fontFamily: typography.body,
    fontSize: fontSize.body,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.body,
    letterSpacing: letterSpacing.body,
  },
  bodySmall: {
    fontFamily: typography.body,
    fontSize: fontSize["body-small"],
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight["body-small"],
    letterSpacing: letterSpacing["body-small"],
  },
  caption: {
    fontFamily: typography.body,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.caption,
    letterSpacing: letterSpacing.caption,
  },
  label: {
    fontFamily: typography.sans,
    fontSize: fontSize.label,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.label,
    letterSpacing: letterSpacing.label,
    textTransform: "uppercase",
  },
  button: {
    fontFamily: typography.sans,
    fontSize: fontSize.button,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.button,
    letterSpacing: letterSpacing.button,
  },
} as const satisfies Record<string, TextStyle>;

export type TextStyleToken = keyof typeof textStyles;
