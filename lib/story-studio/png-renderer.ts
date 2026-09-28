import type { StoryStudioProject } from "@/types/story-studio";

export type StoryStudioPngRenderResult = {
  bytes: ArrayBuffer;
  filename: string;
  placeholder: boolean;
};

const transparentPixelPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export const renderStoryStudioProjectPng = async (
  project: StoryStudioProject
): Promise<StoryStudioPngRenderResult> => {
  // TODO: remplacer ce pixel PNG par le renderer 1080x1920 des templates Story Studio.
  const bytes = Uint8Array.from(Buffer.from(transparentPixelPngBase64, "base64")).buffer;
  const safeProjectId = project.id.replace(/[^a-zA-Z0-9_-]/g, "-");

  return {
    bytes,
    filename: `story-studio-${safeProjectId}.png`,
    placeholder: true,
  };
};