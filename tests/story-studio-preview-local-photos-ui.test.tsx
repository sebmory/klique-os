// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryStudioPreview } from "@/components/contents/story-studio/StoryStudioPreview";
import type { StoryStudioProject } from "@/types/story-studio";

const { renderFrameMock } = vi.hoisted(() => ({
  renderFrameMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/story-studio/browser-renderer", () => ({
  renderStoryStudioFrameToCanvas: renderFrameMock,
  exportStoryStudioCanvasPng: vi.fn(),
}));

let container: HTMLElement;
let root: Root;

const selectFile = async (name: string) => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([name], name, { type: "image/jpeg" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
};

const selectFrame = async (index: number) => {
  const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  await act(async () => {
    tabs[index]?.click();
    await Promise.resolve();
  });
};

const setControlValue = async (selector: string, value: string) => {
  const control = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  await act(async () => {
    control.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
};

const lastRenderInput = () => renderFrameMock.mock.calls.at(-1)?.[0] as {
  photoUrl: string | null;
  brandKitSnapshot?: StoryStudioProject["payload"]["brandKitSnapshot"];
  frame: {
    id: string;
    text: { headline: string; body: string };
    photo: { scale: number; x: number; y: number };
    matchCard?: StoryStudioProject["payload"]["frames"][number]["matchCard"];
    logoLayouts?: StoryStudioProject["payload"]["frames"][number]["logoLayouts"];
  };
  template: { key: string };
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
    revokeObjectURL: vi.fn(),
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<StoryStudioPreview />);
    await Promise.resolve();
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Story Studio preview local photos", () => {
  it("passes the saved Brand Kit snapshot to the preview renderer", async () => {
    const hiddenSnapshot = {
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
    const roles = ["result", "context", "poll", "question"] as const;
    const loadedProject: StoryStudioProject = {
      id: "project-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      mediaId: null,
      sourcePackId: "pack-1",
      sourceStoriesVariantId: "variant-1",
      sourceDocumentId: "document-1",
      athleteId: null,
      projectType: "after_match",
      templateKey: "editorial_klique",
      status: "draft",
      payload: {
        schemaVersion: 1,
        canvasFormat: "1080x1350",
        templateKey: "editorial_klique",
        brandKitId: "22222222-2222-4222-8222-222222222222",
        brandKitSnapshot: hiddenSnapshot,
        frames: roles.map((role, index) => ({
          id: `frame-${index + 1}`,
          order: (index + 1) as 1 | 2 | 3 | 4,
          role,
          sourceStoryIndex: index + 1,
          text: { eyebrow: "", headline: `Story ${index + 1}`, body: "", interaction: "" },
          photo: { assetId: null, visible: false, scale: 1, x: 0, y: 0 },
          ...(index === 0 ? { logoLayouts: { "1080x1350:editorial_klique": { x: 240, y: 360, scale: 1.5 } } } : {}),
          ...(index === 0 ? {
            matchCard: {
              competition: "SB League",
              homeTeam: { name: "Elfic", logoPhotoId: null, logoUrl: null },
              awayTeam: { name: "Adversaire", logoPhotoId: null, logoUrl: null },
              homeScore: 12,
              awayScore: 10,
            },
          } : {}),
          elements: { athleteName: false, score: false, competition: false, logo: true, signature: true, interactionZone: false },
        })) as StoryStudioProject["payload"]["frames"],
      },
      version: 1,
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      json: async () => url.includes("/photos") ? { photos: [] } : { project: loadedProject },
    })));
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<StoryStudioPreview initialProjectId="project-1" />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lastRenderInput().brandKitSnapshot).toEqual(hiddenSnapshot);
    expect(lastRenderInput().frame.logoLayouts?.["1080x1350:editorial_klique"]).toEqual({ x: 240, y: 360, scale: 1.5 });
    expect(lastRenderInput().frame).toMatchObject({ matchCard: { homeScore: 12, awayScore: 10 } });
    expect(lastRenderInput().template).toMatchObject({ canvasFormat: "1080x1350", canvas: { width: 1080, height: 1350 } });
    expect(container.querySelector("h1")?.textContent).toContain("1080 × 1350");
  });

  it("keeps each frame photo and crop independent in local memory", async () => {
    await selectFile("frame-1.jpg");
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-1.jpg",
      frame: { id: "demo-result", photo: { scale: 1, x: 0, y: 0 } },
    });

    await selectFrame(1);
    expect(lastRenderInput()).toMatchObject({ photoUrl: null, frame: { id: "demo-context" } });
    await selectFile("frame-2.jpg");
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-2.jpg",
      frame: { id: "demo-context", photo: { scale: 1.1, x: 0.15, y: 0 } },
    });

    await selectFrame(0);
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-1.jpg",
      frame: { id: "demo-result", photo: { scale: 1, x: 0, y: 0 } },
    });
    await selectFrame(1);
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-2.jpg",
      frame: { id: "demo-context", photo: { scale: 1.1, x: 0.15, y: 0 } },
    });
  });

  it("keeps text and crop edits per frame while applying the selected template immediately", async () => {
    await selectFile("frame-1.jpg");
    await setControlValue('[aria-label="Titre de la frame active"]', "Titre frame 1");
    await setControlValue('[aria-label="Texte de la frame active"]', "Texte frame 1");
    await setControlValue('[aria-label="Zoom de la photo"]', "1.5");
    await setControlValue('[aria-label="Position horizontale de la photo"]', "0.3");

    const minimalTemplateButton = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((button) => button.textContent === "Minimal Premium");
    await act(async () => {
      minimalTemplateButton?.click();
      await Promise.resolve();
    });
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-1.jpg",
      frame: {
        id: "demo-result",
        text: { headline: "Titre frame 1", body: "Texte frame 1" },
        photo: { scale: 1.5, x: 0.3, y: 0 },
      },
      template: { key: "minimal_premium" },
    });

    await selectFrame(1);
    await selectFile("frame-2.jpg");
    await setControlValue('[aria-label="Titre de la frame active"]', "Titre frame 2");
    await setControlValue('[aria-label="Zoom de la photo"]', "2");
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-2.jpg",
      frame: { id: "demo-context", text: { headline: "Titre frame 2" }, photo: { scale: 2, x: 0.15, y: 0 } },
      template: { key: "minimal_premium" },
    });

    await selectFrame(0);
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-1.jpg",
      frame: {
        id: "demo-result",
        text: { headline: "Titre frame 1", body: "Texte frame 1" },
        photo: { scale: 1.5, x: 0.3, y: 0 },
      },
      template: { key: "minimal_premium" },
    });
  });
});