import JSZip from "jszip";
import {
  exportStoryStudioCanvasPng,
  renderStoryStudioFrameToCanvas,
} from "@/lib/story-studio/browser-renderer";
import { getStoryStudioTemplate, STORY_STUDIO_CANVAS } from "@/lib/story-studio/templates";
import type { StoryStudioPhoto } from "@/types/story-studio-photo";
import type { StoryStudioFrameRole, StoryStudioProjectPayload } from "@/types/story-studio";

export type StoryStudioZipFrameStatus = "pending" | "rendering" | "completed" | "error";

export type StoryStudioZipFrameProgress = {
  index: number;
  status: StoryStudioZipFrameStatus;
  error?: string;
};

type ExportStoryStudioZipInput = {
  payload: StoryStudioProjectPayload;
  photos: StoryStudioPhoto[];
  onFrameProgress?: (progress: StoryStudioZipFrameProgress) => void;
};

const roleFileNames: Record<StoryStudioFrameRole, string> = {
  result: "resultat",
  context: "fait-marquant",
  poll: "sondage",
  question: "question",
};

export class StoryStudioZipExportError extends Error {
  constructor(public readonly frameIndex: number, message: string) {
    super(message);
    this.name = "StoryStudioZipExportError";
  }
}

export const storyStudioZipFileName = (index: number, role: StoryStudioFrameRole): string =>
  `${String(index + 1).padStart(2, "0")}-${roleFileNames[role]}.png`;

export const exportStoryStudioProjectZip = async ({
  payload,
  photos,
  onFrameProgress,
}: ExportStoryStudioZipInput): Promise<Blob> => {
  const zip = new JSZip();
  const canvas = document.createElement("canvas");
  const template = getStoryStudioTemplate(payload.templateKey);

  try {
    for (const [index, frame] of payload.frames.entries()) {
      onFrameProgress?.({ index, status: "rendering" });
      try {
        const photo = frame.photo.visible && frame.photo.assetId
          ? photos.find((candidate) => candidate.id === frame.photo.assetId)
          : null;
        if (!photo) throw new Error("Photo requise pour cette frame.");

        await renderStoryStudioFrameToCanvas({
          canvas,
          frame,
          template,
          photoUrl: photo.blobUrl,
          brandKitSnapshot: payload.brandKitSnapshot,
        });
        if (canvas.width !== STORY_STUDIO_CANVAS.width || canvas.height !== STORY_STUDIO_CANVAS.height) {
          throw new Error("Dimensions Canvas invalides.");
        }

        const png = await exportStoryStudioCanvasPng(canvas);
        zip.file(storyStudioZipFileName(index, frame.role), png, { binary: true });
        onFrameProgress?.({ index, status: "completed" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Export PNG impossible.";
        onFrameProgress?.({ index, status: "error", error: message });
        throw new StoryStudioZipExportError(index, message);
      }
    }

    return await zip.generateAsync({
      type: "blob",
      compression: "STORE",
      streamFiles: true,
      platform: "DOS",
    });
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
};