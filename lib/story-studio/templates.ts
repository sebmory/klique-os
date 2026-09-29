import {
  DEFAULT_STORY_STUDIO_CANVAS_FORMAT,
  type StoryStudioCanvasFormat,
  type StoryStudioTemplateKey,
} from "@/types/story-studio";

export const STORY_STUDIO_CANVASES = {
  "1080x1920": { width: 1080, height: 1920 },
  "1080x1350": { width: 1080, height: 1350 },
} as const;
export const STORY_STUDIO_CANVAS = STORY_STUDIO_CANVASES[DEFAULT_STORY_STUDIO_CANVAS_FORMAT];

export type StoryStudioTemplateDefinition = {
  key: StoryStudioTemplateKey;
  canvasFormat: StoryStudioCanvasFormat;
  version: 1;
  label: string;
  canvas: { readonly width: number; readonly height: number };
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
    logo: { x: number; y: number; width: number; height: number };
    matchCard: { x: number; y: number; width: number; height: number; cornerRadius: number } | null;
    text: { x: number; y: number; width: number; maxHeight: number; gap: number };
    interaction: { x: number; y: number; width: number; height: number; cornerRadius: number };
  };
};

export const storyStudioTemplates = {
  editorial_klique: {
    key: "editorial_klique",
    canvasFormat: "1080x1920",
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
      logo: { x: 788, y: 72, width: 220, height: 110 },
      matchCard: null,
      text: { x: 72, y: 1080, width: 936, maxHeight: 570, gap: 24 },
      interaction: { x: 72, y: 1660, width: 936, height: 140, cornerRadius: 4 },
    },
  },
  match_energy: {
    key: "match_energy",
    canvasFormat: "1080x1920",
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
      logo: { x: 788, y: 104, width: 220, height: 110 },
      matchCard: null,
      text: { x: 72, y: 400, width: 936, maxHeight: 1060, gap: 24 },
      interaction: { x: 72, y: 1570, width: 936, height: 180, cornerRadius: 4 },
    },
  },
  minimal_premium: {
    key: "minimal_premium",
    canvasFormat: "1080x1920",
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
      logo: { x: 764, y: 120, width: 220, height: 110 },
      matchCard: null,
      text: { x: 96, y: 1230, width: 888, maxHeight: 390, gap: 32 },
      interaction: { x: 150, y: 1660, width: 780, height: 120, cornerRadius: 8 },
    },
  },
} as const satisfies Record<StoryStudioTemplateKey, StoryStudioTemplateDefinition>;

const storyStudioFeedTemplates = {
  editorial_klique: {
    key: "editorial_klique",
    canvasFormat: "1080x1350",
    version: 1,
    label: "Éditorial KLIQUE",
    canvas: STORY_STUDIO_CANVASES["1080x1350"],
    composition: {
      backgroundColor: "#000000",
      secondaryColor: "#FFFFFF",
      foregroundColor: "#FFFFFF",
      accentColor: "#F2B800",
      mutedColor: "#D9D9D9",
      overlayOpacity: 0.28,
      textAlign: "left",
      fontFamily: "Georgia",
      eyebrowSize: 30,
      headlineSize: 76,
      bodySize: 34,
      interactionSize: 34,
      safeArea: { top: 64, right: 72, bottom: 64, left: 72 },
      photo: { x: 0, y: 0, width: 1080, height: 1350, cornerRadius: 0 },
      logo: { x: 788, y: 64, width: 220, height: 110 },
      matchCard: { x: 72, y: 330, width: 936, height: 260, cornerRadius: 8 },
      text: { x: 72, y: 680, width: 936, maxHeight: 390, gap: 20 },
      interaction: { x: 72, y: 1140, width: 936, height: 130, cornerRadius: 4 },
    },
  },
  match_energy: {
    key: "match_energy",
    canvasFormat: "1080x1350",
    version: 1,
    label: "Énergie Match",
    canvas: STORY_STUDIO_CANVASES["1080x1350"],
    composition: {
      backgroundColor: "#111111",
      secondaryColor: "#FFFFFF",
      foregroundColor: "#FFFFFF",
      accentColor: "#F4D13D",
      mutedColor: "#D8D8D8",
      overlayOpacity: 0.48,
      textAlign: "left",
      fontFamily: "Impact",
      eyebrowSize: 34,
      headlineSize: 88,
      bodySize: 36,
      interactionSize: 36,
      safeArea: { top: 88, right: 72, bottom: 72, left: 72 },
      photo: { x: 0, y: 0, width: 1080, height: 1350, cornerRadius: 0 },
      logo: { x: 788, y: 88, width: 220, height: 110 },
      matchCard: { x: 72, y: 760, width: 936, height: 260, cornerRadius: 8 },
      text: { x: 72, y: 330, width: 936, maxHeight: 690, gap: 20 },
      interaction: { x: 72, y: 1080, width: 936, height: 150, cornerRadius: 4 },
    },
  },
  minimal_premium: {
    key: "minimal_premium",
    canvasFormat: "1080x1350",
    version: 1,
    label: "Minimal Premium",
    canvas: STORY_STUDIO_CANVASES["1080x1350"],
    composition: {
      backgroundColor: "#FAFAF8",
      secondaryColor: "#FFFFFF",
      foregroundColor: "#171717",
      accentColor: "#1E5B4F",
      mutedColor: "#777772",
      overlayOpacity: 0,
      textAlign: "center",
      fontFamily: "Times New Roman",
      eyebrowSize: 28,
      headlineSize: 66,
      bodySize: 32,
      interactionSize: 30,
      safeArea: { top: 72, right: 96, bottom: 72, left: 96 },
      photo: { x: 72, y: 132, width: 936, height: 610, cornerRadius: 8 },
      logo: { x: 764, y: 72, width: 220, height: 110 },
      matchCard: { x: 120, y: 430, width: 840, height: 250, cornerRadius: 8 },
      text: { x: 96, y: 790, width: 888, maxHeight: 300, gap: 24 },
      interaction: { x: 150, y: 1140, width: 780, height: 110, cornerRadius: 8 },
    },
  },
} as const satisfies Record<StoryStudioTemplateKey, StoryStudioTemplateDefinition>;

export const storyStudioTemplatesByFormat = {
  "1080x1920": storyStudioTemplates,
  "1080x1350": storyStudioFeedTemplates,
} as const satisfies Record<StoryStudioCanvasFormat, Record<StoryStudioTemplateKey, StoryStudioTemplateDefinition>>;

export const getStoryStudioTemplate = (
  key: StoryStudioTemplateKey,
  canvasFormat: StoryStudioCanvasFormat = DEFAULT_STORY_STUDIO_CANVAS_FORMAT,
): StoryStudioTemplateDefinition => storyStudioTemplatesByFormat[canvasFormat][key];