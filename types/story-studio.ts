export const storyStudioTemplateKeys = [
  "editorial_klique",
  "match_energy",
  "minimal_premium",
] as const;

export const storyStudioCanvasFormats = ["1080x1920", "1080x1350"] as const;
export const DEFAULT_STORY_STUDIO_CANVAS_FORMAT = "1080x1920" as const;

export type StoryStudioTemplateKey = typeof storyStudioTemplateKeys[number];
export type StoryStudioCanvasFormat = typeof storyStudioCanvasFormats[number];
export type StoryStudioLayoutKey = StoryStudioTemplateKey | `${StoryStudioCanvasFormat}:${StoryStudioTemplateKey}`;
export type StoryStudioProjectStatus = "draft" | "finalized";
export type StoryStudioFrameRole = "result" | "context" | "poll" | "question";
export type StoryStudioFrameOrder = 1 | 2 | 3 | 4;
export type StoryStudioTextBlock = "eyebrow" | "headline" | "body";
export type StoryStudioTextPosition = { x: number; y: number };
export type StoryStudioTextLayout = Record<StoryStudioTextBlock, StoryStudioTextPosition>;
export type StoryStudioLogoLayout = { x: number; y: number; scale: number };

export type StoryStudioSubjectLayer = {
  photoId: string;
  url: string;
  x: number;
  y: number;
  scale: number;
};

export type StoryStudioMatchTeam = {
  name: string;
  logoPhotoId: string | null;
  logoUrl: string | null;
};

export type StoryStudioMatchCard = {
  competition: string;
  homeTeam: StoryStudioMatchTeam;
  awayTeam: StoryStudioMatchTeam;
  homeScore: number;
  awayScore: number;
};

export const getStoryStudioLayoutKey = (
  canvasFormat: StoryStudioCanvasFormat,
  templateKey: StoryStudioTemplateKey,
): `${StoryStudioCanvasFormat}:${StoryStudioTemplateKey}` => `${canvasFormat}:${templateKey}`;

export type StoryStudioBrandKitSnapshot = {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  mutedTextColor: string;
  lightLogoPhotoId: string | null;
  darkLogoPhotoId: string | null;
  lightLogoUrl: string | null;
  darkLogoUrl: string | null;
  fontFamily: "Arial" | "Georgia" | "Impact" | "Times New Roman";
  signatureMode: "visible" | "discreet" | "hidden";
};

export type StoryStudioFrame = {
  id: string;
  order: StoryStudioFrameOrder;
  role: StoryStudioFrameRole;
  sourceStoryIndex: number | null;
  text: {
    eyebrow: string;
    headline: string;
    body: string;
    interaction: string;
  };
  matchCard?: StoryStudioMatchCard;
  subjectLayer?: StoryStudioSubjectLayer;
  textLayouts?: Partial<Record<StoryStudioLayoutKey, StoryStudioTextLayout>>;
  logoLayouts?: Partial<Record<StoryStudioLayoutKey, StoryStudioLogoLayout>>;
  photo: {
    assetId: string | null;
    visible: boolean;
    scale: number;
    x: number;
    y: number;
  };
  elements: {
    athleteName: boolean;
    score: boolean;
    competition: boolean;
    logo: boolean;
    signature: boolean;
    interactionZone: boolean;
  };
};

export type StoryStudioProjectPayload = {
  schemaVersion: 1;
  canvasFormat?: StoryStudioCanvasFormat;
  templateKey: StoryStudioTemplateKey;
  brandKitId?: string | null;
  brandKitSnapshot?: StoryStudioBrandKitSnapshot | null;
  frames: [StoryStudioFrame, StoryStudioFrame, StoryStudioFrame, StoryStudioFrame];
};

export type StoryStudioProject = {
  id: string;
  workspaceId: string;
  userId: string;
  mediaId: string | null;
  sourcePackId: string;
  sourceStoriesVariantId: string;
  sourceDocumentId: string;
  athleteId: string | null;
  projectType: "after_match";
  templateKey: StoryStudioTemplateKey;
  status: StoryStudioProjectStatus;
  payload: StoryStudioProjectPayload;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrGetStoryStudioProjectInput = {
  sourcePackId: string;
  sourceStoriesVariantId: string;
  sourceDocumentId: string;
  athleteId: string | null;
  payload: StoryStudioProjectPayload;
};

export type UpdateStoryStudioProjectInput = {
  projectId: string;
  expectedVersion: number;
  athleteId: string | null;
  status: StoryStudioProjectStatus;
  payload: StoryStudioProjectPayload;
};