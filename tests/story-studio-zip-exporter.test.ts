// @vitest-environment jsdom
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportStoryStudioProjectZip,
  StoryStudioZipExportError,
} from "@/lib/story-studio/zip-exporter";
import type { StoryStudioPhoto } from "@/types/story-studio-photo";
import type { StoryStudioFrame, StoryStudioProjectPayload } from "@/types/story-studio";

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  exportPng: vi.fn(),
}));

vi.mock("@/lib/story-studio/browser-renderer", () => ({
  renderStoryStudioFrameToCanvas: mocks.render,
  exportStoryStudioCanvasPng: mocks.exportPng,
}));

const roles = ["result", "context", "poll", "question"] as const;
const hiddenBrandKitSnapshot = {
  name: "Elfic Fribourg Test",
  primaryColor: "#000000",
  secondaryColor: "#FFFFFF",
  accentColor: "#F2B800",
  textColor: "#FFFFFF",
  mutedTextColor: "#CCCCCC",
  lightLogoPhotoId: "11111111-1111-4111-8111-111111111111",
  darkLogoPhotoId: null,
  lightLogoUrl: "https://studio.public.blob.vercel-storage.com/story-studio/brand-kit-logos/elfic.png",
  darkLogoUrl: null,
  fontFamily: "Arial" as const,
  signatureMode: "hidden" as const,
};
const frame = (index: number): StoryStudioFrame => ({
  id: `frame-${index + 1}`,
  order: (index + 1) as StoryStudioFrame["order"],
  role: roles[index],
  sourceStoryIndex: index + 1,
  text: { eyebrow: "Après-match", headline: `Story ${index + 1}`, body: "", interaction: "" },
  textLayouts: {
    editorial_klique: {
      eyebrow: { x: 72, y: 180 },
      headline: { x: 96, y: 320 },
      body: { x: 120, y: 720 },
    },
  },
  logoLayouts: {
    editorial_klique: { x: 180 + index * 20, y: 260 + index * 30, scale: 1 + index * 0.25 },
  },
  ...(index === 0 ? {
    matchCard: {
      competition: "SB League",
      homeTeam: { name: "Elfic", logoPhotoId: null, logoUrl: null },
      awayTeam: { name: "Adversaire", logoPhotoId: null, logoUrl: null },
      homeScore: 12,
      awayScore: 10,
    },
  } : {}),
  photo: { assetId: `photo-${index + 1}`, visible: true, scale: 1, x: 0, y: 0 },
  elements: { athleteName: false, score: false, competition: false, logo: false, signature: false, interactionZone: false },
});

const payload: StoryStudioProjectPayload = {
  schemaVersion: 1,
  templateKey: "editorial_klique",
  brandKitId: "22222222-2222-4222-8222-222222222222",
  brandKitSnapshot: hiddenBrandKitSnapshot,
  frames: [frame(0), frame(1), frame(2), frame(3)],
};

const photos = payload.frames.map((item, index): StoryStudioPhoto => ({
  id: item.photo.assetId!,
  workspaceId: "workspace-1",
  userId: "user-1",
  mediaId: null,
  athleteId: null,
  blobUrl: `https://studio.public.blob.vercel-storage.com/story-studio/photos/${index + 1}.jpg`,
  blobPathname: `story-studio/photos/${index + 1}.jpg`,
  contentType: "image/jpeg",
  width: 1080,
  height: 1920,
  sizeBytes: 1024,
  createdAt: "2026-09-28T10:00:00.000Z",
}));

describe("Story Studio ZIP exporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let pngIndex = 0;
    mocks.render.mockImplementation(async ({ canvas, template }: { canvas: HTMLCanvasElement; template: { canvas: { width: number; height: number } } }) => {
      canvas.width = template.canvas.width;
      canvas.height = template.canvas.height;
    });
    mocks.exportPng.mockImplementation(async () => {
      pngIndex += 1;
      return new Blob([`png-${pngIndex}`], { type: "image/png" });
    });
  });

  it("exports four 1080 x 1920 PNG files sequentially in story order", async () => {
    const dimensions: Array<[number, number]> = [];
    const canvases: HTMLCanvasElement[] = [];
    mocks.exportPng.mockImplementation(async (canvas: HTMLCanvasElement) => {
      dimensions.push([canvas.width, canvas.height]);
      canvases.push(canvas);
      return new Blob([`png-${dimensions.length}`], { type: "image/png" });
    });

    const zipBlob = await exportStoryStudioProjectZip({ payload, photos });
    const zip = await JSZip.loadAsync(zipBlob);
    const names = Object.keys(zip.files);

    expect(names).toEqual([
      "01-resultat.png",
      "02-fait-marquant.png",
      "03-sondage.png",
      "04-question.png",
    ]);
    expect(dimensions).toEqual(Array.from({ length: 4 }, () => [1080, 1920]));
    expect(new Set(canvases)).toHaveLength(1);
    for (const [index, [renderInput]] of mocks.render.mock.calls.entries()) {
      expect(renderInput.frame.textLayouts.editorial_klique.headline).toEqual({ x: 96, y: 320 });
      expect(renderInput.frame.logoLayouts.editorial_klique).toEqual(payload.frames[index].logoLayouts?.editorial_klique);
      expect(renderInput.brandKitSnapshot).toEqual(hiddenBrandKitSnapshot);
      expect(renderInput.onTextBounds).toBeUndefined();
    }
    expect(mocks.render.mock.calls[0][0].frame.matchCard).toMatchObject({ homeScore: 12, awayScore: 10 });
    await expect(Promise.all(names.map((name) => zip.file(name)!.async("string"))))
      .resolves.toEqual(["png-1", "png-2", "png-3", "png-4"]);
  });

  it("exports every frame at the explicit 1080 x 1350 project format", async () => {
    const dimensions: Array<[number, number]> = [];
    mocks.exportPng.mockImplementation(async (canvas: HTMLCanvasElement) => {
      dimensions.push([canvas.width, canvas.height]);
      return new Blob([`png-${dimensions.length}`], { type: "image/png" });
    });

    await exportStoryStudioProjectZip({
      payload: { ...payload, canvasFormat: "1080x1350" },
      photos,
    });

    expect(dimensions).toEqual(Array.from({ length: 4 }, () => [1080, 1350]));
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      template: expect.objectContaining({ canvasFormat: "1080x1350", canvas: { width: 1080, height: 1350 } }),
    }));
  });

  it("reports the failing frame and stops before later frames", async () => {
    const progress: Array<{ index: number; status: string; error?: string }> = [];
    mocks.render.mockImplementation(async ({ frame: renderedFrame, canvas }: { frame: StoryStudioFrame; canvas: HTMLCanvasElement }) => {
      canvas.width = 1080;
      canvas.height = 1920;
      if (renderedFrame.order === 2) throw new Error("Photo CORS bloquée.");
    });

    await expect(exportStoryStudioProjectZip({
      payload,
      photos,
      onFrameProgress: (item) => progress.push(item),
    })).rejects.toMatchObject({ frameIndex: 1 } satisfies Partial<StoryStudioZipExportError>);
    expect(progress).toEqual([
      { index: 0, status: "rendering" },
      { index: 0, status: "completed" },
      { index: 1, status: "rendering" },
      { index: 1, status: "error", error: "Photo CORS bloquée." },
    ]);
    expect(mocks.exportPng).toHaveBeenCalledTimes(1);
  });
});