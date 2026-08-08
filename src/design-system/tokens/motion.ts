export const motionDurations = {
  fast: "120ms",
  normal: "200ms",
  slow: "320ms",
  instant: "0ms",
  slower: "480ms",
} as const;

export const motionEasings = {
  ease: "ease",
  "ease-in": "ease-in",
  "ease-out": "ease-out",
  "ease-in-out": "ease-in-out",
  standard: "ease-out",
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
  decelerate: "ease-out",
  accelerate: "ease-in",
} as const;

export const motionScale = {
  enter: "0.96",
  exit: "1.04",
  idle: "1",
} as const;
