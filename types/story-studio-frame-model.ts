import type {
  StoryStudioBrandKitSnapshot,
  StoryStudioFrame,
  StoryStudioLogoLayout,
  StoryStudioTemplateKey,
  StoryStudioTextLayout,
} from "@/types/story-studio";

export type StoryStudioFrameModelContent = {
  schemaVersion: 1;
  canvasFormat: "1080x1350";
  templateKey: StoryStudioTemplateKey;
  brandKitId: string | null;
  brandKitSnapshot: StoryStudioBrandKitSnapshot | null;
  frame: {
    text: StoryStudioFrame["text"];
    elements: StoryStudioFrame["elements"];
    textLayout?: StoryStudioTextLayout;
    logoLayout?: StoryStudioLogoLayout;
  };
};

export type StoryStudioFrameModelInput = {
  name: string;
  content: StoryStudioFrameModelContent;
};

export type StoryStudioFrameModel = StoryStudioFrameModelInput & {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};