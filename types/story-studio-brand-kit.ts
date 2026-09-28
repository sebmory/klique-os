export const storyStudioBrandKitFonts = [
  "Arial",
  "Georgia",
  "Impact",
  "Times New Roman",
] as const;

export const storyStudioBrandKitSignatureModes = ["visible", "discreet", "hidden"] as const;

export type StoryStudioBrandKitFont = typeof storyStudioBrandKitFonts[number];
export type StoryStudioBrandKitSignatureMode = typeof storyStudioBrandKitSignatureModes[number];

export type StoryStudioBrandKit = {
  id: string;
  workspaceId: string;
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
  fontFamily: StoryStudioBrandKitFont;
  signatureMode: StoryStudioBrandKitSignatureMode;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoryStudioBrandKitInput = Pick<
  StoryStudioBrandKit,
  | "name"
  | "primaryColor"
  | "secondaryColor"
  | "accentColor"
  | "textColor"
  | "mutedTextColor"
  | "lightLogoPhotoId"
  | "darkLogoPhotoId"
  | "fontFamily"
  | "signatureMode"
>;

export type UpdateStoryStudioBrandKitInput = Partial<StoryStudioBrandKitInput>;