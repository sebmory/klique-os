import type { TokenScale } from "./types";
import { motionDurations, motionEasings } from "./motion";

export const transitionDuration = {
  fast: motionDurations.fast,
  normal: motionDurations.normal,
  slow: motionDurations.slow,
  instant: motionDurations.instant,
  slower: motionDurations.slower,
} as const satisfies TokenScale<string>;

export const transitionEasing = {
  ease: motionEasings.ease,
  "ease-in": motionEasings["ease-in"],
  "ease-out": motionEasings["ease-out"],
  "ease-in-out": motionEasings["ease-in-out"],
  standard: motionEasings.standard,
  emphasized: motionEasings.emphasized,
  decelerate: motionEasings.decelerate,
  accelerate: motionEasings.accelerate,
} as const satisfies TokenScale<string>;

export const transition = {
  default: `all ${transitionDuration.normal} ${transitionEasing.ease}`,
  emphasized: `all ${transitionDuration.normal} ${transitionEasing["ease-in-out"]}`,
  fast: `all ${transitionDuration.fast} ${transitionEasing["ease-out"]}`,
  slow: `all ${transitionDuration.slow} ${transitionEasing["ease-in-out"]}`,
} as const satisfies TokenScale<string>;

export const transitionPreset = {
  hover: `color ${transitionDuration.fast} ${transitionEasing.ease}, background-color ${transitionDuration.fast} ${transitionEasing.ease}, border-color ${transitionDuration.fast} ${transitionEasing.ease}, box-shadow ${transitionDuration.fast} ${transitionEasing.ease}`,
  dropdown: `opacity ${transitionDuration.fast} ${transitionEasing["ease-out"]}, transform ${transitionDuration.fast} ${transitionEasing["ease-out"]}`,
  sidebar: `transform ${transitionDuration.slow} ${transitionEasing["ease-in-out"]}`,
  modal: `opacity ${transitionDuration.normal} ${transitionEasing["ease-out"]}, transform ${transitionDuration.normal} ${transitionEasing["ease-out"]}`,
  tooltip: `opacity ${transitionDuration.fast} ${transitionEasing["ease-out"]}, transform ${transitionDuration.fast} ${transitionEasing["ease-out"]}`,
  toast: `opacity ${transitionDuration.normal} ${transitionEasing["ease-in-out"]}, transform ${transitionDuration.normal} ${transitionEasing["ease-in-out"]}`,
  accordion: `max-height ${transitionDuration.slow} ${transitionEasing["ease-in-out"]}, opacity ${transitionDuration.normal} ${transitionEasing.ease}`,
  navigation: `color ${transitionDuration.fast} ${transitionEasing.ease}, background-color ${transitionDuration.fast} ${transitionEasing.ease}`,
} as const satisfies TokenScale<string>;

export type TransitionDurationToken = keyof typeof transitionDuration;
export type TransitionEasingToken = keyof typeof transitionEasing;
export type TransitionToken = keyof typeof transition;
export type TransitionPresetToken = keyof typeof transitionPreset;
