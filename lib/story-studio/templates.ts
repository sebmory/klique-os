import type { StoryStudioTemplateKey } from "@/types/story-studio";

export const STORY_STUDIO_CANVAS = {
  width: 1080,
  height: 1920,
} as const;

export type StoryStudioTemplateDefinition = {
  key: StoryStudioTemplateKey;
  version: 1;
  label: string;
  canvas: typeof STORY_STUDIO_CANVAS;
  composition: {
    backgroundColor: string;
    secondaryColor: string;
    foregroundColor: string;
    accentColor: string;
    mutedColor: string;
    overlayOpacity: number;
    textAlign: "left" | "center";
    fontFamily: string;
    eyebrowSize: number;
    headlineSize: number;
    bodySize: number;
    interactionSize: number;
    safeArea: { top: number; right: number; bottom: number; left: number };
    photo: { x: number; y: number; width: number; height: number; cornerRadius: number };
    text: { x: number; y: number; width: number; maxHeight: number; gap: number };
    interaction: { x: number; y: number; width: number; height: number; cornerRadius: number };
  };
};

export const storyStudioTemplates = {
  editorial_klique: {
    key: "editorial_klique",
    version: 1,
    label: "Éditorial KLIQUE",
    canvas: STORY_STUDIO_CANVAS,
    composition: {
      backgroundColor: "#000000",
      secondaryColor: "#FFFFFF",
      foregroundColor: "#FFFFFF",
      accentColor: "#F2B800",
      mutedColor: "#D9D9D9",
      overlayOpacity: 0.28,
      textAlign: "left",
      fontFamily: "Georgia",
      eyebrowSize: 32,
      headlineSize: 88,
      bodySize: 38,
      interactionSize: 38,
      safeArea: { top: 72, right: 72, bottom: 96, left: 72 },
      photo: { x: 0, y: 0, width: 1080, height: 1800, cornerRadius: 0 },
      text: { x: 72, y: 1080, width: 936, maxHeight: 570, gap: 24 },
      interaction: { x: 72, y: 1660, width: 936, height: 140, cornerRadius: 4 },
    },
  },
  match_energy: {
    key: "match_energy",
    version: 1,
    label: "Énergie Match",
    canvas: STORY_STUDIO_CANVAS,
    composition: {
      backgroundColor: "#111111",
      secondaryColor: "#FFFFFF",
      foregroundColor: "#FFFFFF",
      accentColor: "#F4D13D",
      mutedColor: "#D8D8D8",
      overlayOpacity: 0.48,
      textAlign: "left",
      fontFamily: "Impact",
      eyebrowSize: 38,
      headlineSize: 108,
      bodySize: 42,
      interactionSize: 40,
      safeArea: { top: 104, right: 72, bottom: 112, left: 72 },
      photo: { x: 0, y: 0, width: 1080, height: 1920, cornerRadius: 0 },
      text: { x: 72, y: 400, width: 936, maxHeight: 1060, gap: 24 },
      interaction: { x: 72, y: 1570, width: 936, height: 180, cornerRadius: 4 },
    },
  },
  minimal_premium: {
    key: "minimal_premium",
    version: 1,
    label: "Minimal Premium",
    canvas: STORY_STUDIO_CANVAS,
    composition: {
      backgroundColor: "#FAFAF8",
      secondaryColor: "#FFFFFF",
      foregroundColor: "#171717",
      accentColor: "#1E5B4F",
      mutedColor: "#777772",
      overlayOpacity: 0,
      textAlign: "center",
      fontFamily: "Times New Roman",
      eyebrowSize: 30,
      headlineSize: 76,
      bodySize: 36,
      interactionSize: 34,
      safeArea: { top: 120, right: 96, bottom: 128, left: 96 },
      photo: { x: 72, y: 168, width: 936, height: 1010, cornerRadius: 8 },
      text: { x: 96, y: 1230, width: 888, maxHeight: 390, gap: 32 },
      interaction: { x: 150, y: 1660, width: 780, height: 120, cornerRadius: 8 },
    },
  },
} as const satisfies Record<StoryStudioTemplateKey, StoryStudioTemplateDefinition>;

export const getStoryStudioTemplate = (key: StoryStudioTemplateKey): StoryStudioTemplateDefinition =>
  storyStudioTemplates[key];