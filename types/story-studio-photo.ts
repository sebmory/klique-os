import type { AllowedVisualContentType } from "@/lib/athlete-visuals/service";

export const STORY_STUDIO_PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_STORY_STUDIO_PHOTO_BYTES = 25 * 1024 * 1024;

export type StoryStudioPhoto = {
  id: string;
  workspaceId: string;
  userId: string;
  mediaId: string | null;
  athleteId: string | null;
  blobUrl: string;
  blobPathname: string;
  contentType: AllowedVisualContentType;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: string;
};

export type CreateStoryStudioPhotoInput = {
  athleteId: string | null;
  blob: {
    url: string;
    pathname: string;
    contentType: AllowedVisualContentType;
    width: number;
    height: number;
    sizeBytes: number;
  };
};