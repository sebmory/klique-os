import type { TokenScale } from "./types";
import { motionDurations, motionEasings } from "./motion";
import { spacing } from "./spacing";
import { motionScale } from "./motion";

export const animationKeyframe = {
  fadeIn: "fadeIn",
  slideUp: "slideUp",
  scaleIn: "scaleIn",
} as const satisfies TokenScale<string>;

export const animation = {
  fadeIn: `${animationKeyframe.fadeIn} ${motionDurations.normal} ${motionEasings.standard}`,
  slideUp: `${animationKeyframe.slideUp} ${motionDurations.normal} ${motionEasings.decelerate}`,
  scaleIn: `${animationKeyframe.scaleIn} ${motionDurations.fast} ${motionEasings.standard}`,
} as const satisfies TokenScale<string>;

export const animationKeyframes = {
  fadeIn: {
    from: { opacity: "0" },
    to: { opacity: "1" },
  },
  slideUp: {
    from: { opacity: "0", transform: `translateY(${spacing[3]})` },
    to: { opacity: "1", transform: "translateY(0)" },
  },
  scaleIn: {
    from: { opacity: "0", transform: `scale(${motionScale.enter})` },
    to: { opacity: "1", transform: `scale(${motionScale.idle})` },
  },
} as const;

export type AnimationKeyframeToken = keyof typeof animationKeyframe;
export type AnimationToken = keyof typeof animation;
