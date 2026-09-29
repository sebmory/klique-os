// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryStudioSavedEditor } from "@/components/contents/story-studio/StoryStudioSavedEditor";
import type { StoryStudioBrandKit } from "@/types/story-studio-brand-kit";
import type { StoryStudioBrandKitSnapshot } from "@/types/story-studio";
import { DEFAULT_STORY_STUDIO_CANVAS_FORMAT, getStoryStudioLayoutKey } from "@/types/story-studio";
import { MAX_STORY_STUDIO_PHOTO_BYTES } from "@/types/story-studio-photo";

const { exportZipMock, renderFrameMock, uploadMock } = vi.hoisted(() => ({
  exportZipMock: vi.fn(),
  renderFrameMock: vi.fn().mockResolvedValue(undefined),
  uploadMock: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({ upload: uploadMock }));

vi.mock("@/lib/story-studio/browser-renderer", () => ({
  renderStoryStudioFrameToCanvas: renderFrameMock,
  exportStoryStudioCanvasPng: vi.fn(),
}));

vi.mock("@/lib/story-studio/zip-exporter", () => ({
  exportStoryStudioProjectZip: exportZipMock,
}));

const frame = (order: 1 | 2 | 3 | 4, role: "result" | "context" | "poll" | "question") => ({
  id: `frame-${order}`,
  order,
  role,
  sourceStoryIndex: order,
  text: { eyebrow: "Après-match", headline: `Titre ${order}`, body: `Texte ${order}`, interaction: "" },
  photo: { assetId: null, visible: false, scale: 1, x: 0, y: 0 },
  elements: { athleteName: false, score: true, competition: false, logo: true, signature: false, interactionZone: false },
});

const savedBrandKitSnapshot: StoryStudioBrandKitSnapshot = {
  name: "Ancien Club Nord",
  primaryColor: "#112233",
  secondaryColor: "#FFFFFF",
  accentColor: "#AA0000",
  textColor: "#FFFFFF",
  mutedTextColor: "#CCCCCC",
  lightLogoPhotoId: null,
  darkLogoPhotoId: null,
  lightLogoUrl: null,
  darkLogoUrl: null,
  fontFamily: "Georgia",
  signatureMode: "visible",
};

const currentBrandKit: StoryStudioBrandKit = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace-1",
  name: "Club Nord modifié",
  primaryColor: "#445566",
  secondaryColor: "#FFFFFF",
  accentColor: "#00AA00",
  textColor: "#FFFFFF",
  mutedTextColor: "#DDDDDD",
  lightLogoPhotoId: null,
  darkLogoPhotoId: null,
  lightLogoUrl: null,
  darkLogoUrl: null,
  fontFamily: "Arial",
  signatureMode: "discreet",
  isDefault: false,
  createdAt: "2026-09-28T10:00:00.000Z",
  updatedAt: "2026-09-28T11:00:00.000Z",
};

const secondBrandKit: StoryStudioBrandKit = {
  ...currentBrandKit,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Club Sud",
  primaryColor: "#010203",
  accentColor: "#F2B800",
  fontFamily: "Impact",
  signatureMode: "hidden",
};

const project = {
  id: "project-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  mediaId: null,
  sourcePackId: "pack-1",
  sourceStoriesVariantId: "variant-1",
  sourceDocumentId: "document-1",
  athleteId: "athlete-1",
  projectType: "after_match" as const,
  templateKey: "editorial_klique" as const,
  status: "draft" as const,
  payload: {
    schemaVersion: 1 as const,
    templateKey: "editorial_klique" as const,
    brandKitId: currentBrandKit.id,
    brandKitSnapshot: savedBrandKitSnapshot,
    frames: [frame(1, "result"), frame(2, "context"), frame(3, "poll"), frame(4, "question")],
  },
  version: 1,
  createdAt: "2026-09-28T10:00:00.000Z",
  updatedAt: "2026-09-28T10:00:00.000Z",
};

const photo = {
  id: "photo-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  mediaId: null,
  athleteId: "athlete-1",
  blobUrl: "https://studio.public.blob.vercel-storage.com/photo-1.jpg",
  blobPathname: "story-studio/photos/photo-1.jpg",
  contentType: "image/jpeg" as const,
  width: 1080,
  height: 1920,
  sizeBytes: 1024,
  createdAt: "2026-09-28T10:00:00.000Z",
};

const brandLogo = {
  ...photo,
  id: "logo-1",
  athleteId: null,
  blobUrl: "https://studio.public.blob.vercel-storage.com/story-studio/brand-kit-logos/logo-1.png",
  blobPathname: "story-studio/brand-kit-logos/logo-1.png",
  contentType: "image/png" as const,
  width: 512,
  height: 512,
};

const frameModel = {
  id: "33333333-3333-4333-8333-333333333333",
  workspaceId: "workspace-1",
  createdByUserId: "user-2",
  name: "Modèle score premium",
  content: {
    schemaVersion: 1 as const,
    canvasFormat: "1080x1350" as const,
    templateKey: "match_energy" as const,
    brandKitId: secondBrandKit.id,
    brandKitSnapshot: {
      name: secondBrandKit.name,
      primaryColor: secondBrandKit.primaryColor,
      secondaryColor: secondBrandKit.secondaryColor,
      accentColor: secondBrandKit.accentColor,
      textColor: secondBrandKit.textColor,
      mutedTextColor: secondBrandKit.mutedTextColor,
      lightLogoPhotoId: secondBrandKit.lightLogoPhotoId,
      darkLogoPhotoId: secondBrandKit.darkLogoPhotoId,
      lightLogoUrl: secondBrandKit.lightLogoUrl,
      darkLogoUrl: secondBrandKit.darkLogoUrl,
      fontFamily: secondBrandKit.fontFamily,
      signatureMode: secondBrandKit.signatureMode,
    },
    frame: {
      text: { eyebrow: "MODÈLE", headline: "Titre du modèle", body: "Corps du modèle", interaction: "" },
      elements: { athleteName: true, score: false, competition: true, logo: true, signature: true, interactionZone: false },
      textLayout: {
        eyebrow: { x: 90, y: 120 },
        headline: { x: 90, y: 240 },
        body: { x: 90, y: 430 },
      },
      logoLayout: { x: 760, y: 110, scale: 1.4 },
    },
  },
  createdAt: "2026-09-29T10:00:00.000Z",
  updatedAt: "2026-09-29T10:00:00.000Z",
};

const jsonResponse = (payload: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
}) as Response;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

let container: HTMLElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

const setControlValue = async (selector: string, value: string) => {
  const control = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const prototype = control instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  await act(async () => {
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    await flush();
  });
};

const patchCalls = () => fetchMock.mock.calls.filter(([, options]) => (options as RequestInit | undefined)?.method === "PATCH");

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  renderFrameMock.mockImplementation(async ({ canvas, frame: renderedFrame, template, onTextBounds, onLogoBounds, onDiagnostics }) => {
    canvas.width = template.canvas.width;
    canvas.height = template.canvas.height;
    const layoutKey = getStoryStudioLayoutKey(template.canvasFormat, template.key);
    const textLayout = renderedFrame.textLayouts?.[layoutKey]
      ?? (template.canvasFormat === DEFAULT_STORY_STUDIO_CANVAS_FORMAT ? renderedFrame.textLayouts?.[template.key] : undefined);
    onTextBounds?.({
      eyebrow: { x: textLayout?.eyebrow.x ?? 72, y: textLayout?.eyebrow.y ?? 100, width: 936, height: 42, position: textLayout?.eyebrow ?? { x: 72, y: 100 } },
      headline: { x: textLayout?.headline.x ?? 72, y: textLayout?.headline.y ?? 200, width: 936, height: 90, position: textLayout?.headline ?? { x: 72, y: 200 } },
      body: { x: textLayout?.body.x ?? 72, y: textLayout?.body.y ?? 350, width: 936, height: 50, position: textLayout?.body ?? { x: 72, y: 350 } },
    });
    const defaultLogo = template.composition.logo;
    const logoLayout = renderedFrame.logoLayouts?.[layoutKey]
      ?? (template.canvasFormat === DEFAULT_STORY_STUDIO_CANVAS_FORMAT ? renderedFrame.logoLayouts?.[template.key] : undefined)
      ?? { x: defaultLogo.x, y: defaultLogo.y, scale: 1 };
    onLogoBounds?.({
      x: logoLayout.x,
      y: logoLayout.y,
      width: defaultLogo.width * logoLayout.scale,
      height: defaultLogo.height * logoLayout.scale,
      layout: logoLayout,
    });
    onDiagnostics?.({
      headlineFontSize: 84,
      headlineOverflow: false,
      stickerZone: renderedFrame.role === "poll" || renderedFrame.role === "question"
        ? { x: 140, y: 1120, width: 800, height: 260, cornerRadius: 24 }
        : null,
    });
  });
  exportZipMock.mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
  uploadMock.mockImplementation(async (pathname: string) => ({
    url: pathname.includes("/subjects/")
      ? "https://studio.public.blob.vercel-storage.com/story-studio/subjects/player.png"
      : "https://studio.public.blob.vercel-storage.com/photo-2.jpg",
    pathname,
  }));
  fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      const body = JSON.parse(String(options.body));
      return Promise.resolve(jsonResponse({ project: { ...project, payload: body.payload, version: 2 } }));
    }
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      if (url.includes("/frame-models")) {
        return Promise.resolve(jsonResponse({ frameModel: { ...frameModel, ...body } }, 201));
      }
      if (body.action === "create-upload-intent") {
        if (body.assetKind === "subjectLayer") {
          return Promise.resolve(jsonResponse({
            pathname: "story-studio/subjects/player.png",
            uploadIntent: "signed-subject-intent",
          }));
        }
        return Promise.resolve(jsonResponse({ pathname: "story-studio/photos/upload-2.jpg", uploadIntent: "signed-intent" }));
      }
      if (body.action === "register-upload") {
        if (body.uploadIntent === "signed-subject-intent") {
          return Promise.resolve(jsonResponse({
            photo: {
              ...photo,
              id: "55555555-5555-4555-8555-555555555555",
              blobUrl: "https://studio.public.blob.vercel-storage.com/story-studio/subjects/player.png",
              blobPathname: "story-studio/subjects/player.png",
              contentType: "image/png",
            },
          }, 201));
        }
        return Promise.resolve(jsonResponse({ photo: { ...photo, id: "photo-2", blobUrl: "https://studio.public.blob.vercel-storage.com/photo-2.jpg" } }, 201));
      }
    }
    if (url.includes("/frame-models")) return Promise.resolve(jsonResponse({ frameModels: [frameModel] }));
    if (url.includes("/photos")) return Promise.resolve(jsonResponse({ photos: [photo, brandLogo] }));
    if (url.includes("/brand-kits")) return Promise.resolve(jsonResponse({
      brandKits: [{
        ...currentBrandKit,
        lightLogoPhotoId: brandLogo.id,
        lightLogoUrl: brandLogo.blobUrl,
      }, secondBrandKit],
    }));
    return Promise.resolve(jsonResponse({ project }));
  });
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<StoryStudioSavedEditor projectId="project-1" />);
    await flush();
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("saved Story Studio editor", () => {
  it("keeps an Aucune interaction editorial note visible, editable and autosaved", async () => {
    const editorialNote = "Aucune interaction prévue sur cette frame.";
    const editedNote = "Aucune interaction prévue, note éditoriale ajustée.";
    const editorialProject = {
      ...project,
      payload: {
        ...project.payload,
        frames: project.payload.frames.map((item, index) => index === 0
          ? { ...item, text: { ...item.text, interaction: editorialNote } }
          : item),
      },
    };
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        const body = JSON.parse(String(options.body));
        return Promise.resolve(jsonResponse({ project: { ...editorialProject, payload: body.payload, version: 2 } }));
      }
      if (url.includes("/photos")) return Promise.resolve(jsonResponse({ photos: [photo] }));
      if (url.includes("/brand-kits")) return Promise.resolve(jsonResponse({ brandKits: [] }));
      return Promise.resolve(jsonResponse({ project: editorialProject }));
    });
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<StoryStudioSavedEditor projectId="project-1" />);
      await flush();
    });

    const selector = '[aria-label="Interaction de la frame active"]';
    expect((container.querySelector(selector) as HTMLTextAreaElement).value).toBe(editorialNote);

    await setControlValue(selector, editedNote);
    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });

    const body = JSON.parse(String((patchCalls()[0]?.[1] as RequestInit).body));
    expect(body.payload.frames[0].text.interaction).toBe(editedNote);
  });

  it("repairs legacy four-frame text and preserves every source value for editing", async () => {
    const sourceContents = [
      "Victoire 2-1 pour Vevey Sport, le 27 septembre 2026 en 1re ligue. Abdou Böbödi CAMARA est au centre de cet après-match.",
      "Attaquant de Vevey Sport, Abdou Böbödi CAMARA est passé par le FC Nantes. Il y a disputé la Youth League et remporté deux titres de champion de France U19.",
      "Après une victoire, quel aspect souhaitez-vous découvrir en priorité?",
      "Quelle question aimeriez-vous poser à Abdou Böbödi CAMARA après ce succès?",
    ];
    const sourceInteractions = [
      "Aucune — ouverture visuelle avec le résultat, la compétition et la date.",
      "Aucune — portrait vertical accompagné d’une chronologie sobre.",
      "Sondage : « L’analyse du match » / « Le ressenti du joueur »",
      "Sticker Questions pour recueillir les propositions de la communauté.",
    ];
    const legacyProject = {
      ...project,
      payload: {
        ...project.payload,
        frames: project.payload.frames.map((item, index) => ({
          ...item,
          text: {
            ...item.text,
            headline: sourceContents[index],
            body: "",
            interaction: sourceInteractions[index],
          },
        })),
      },
    };
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        const body = JSON.parse(String(options.body));
        return Promise.resolve(jsonResponse({ project: { ...legacyProject, payload: body.payload, version: 2 } }));
      }
      if (url.includes("/photos")) return Promise.resolve(jsonResponse({ photos: [photo] }));
      if (url.includes("/brand-kits")) return Promise.resolve(jsonResponse({ brandKits: [] }));
      return Promise.resolve(jsonResponse({ project: legacyProject }));
    });
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<StoryStudioSavedEditor projectId="project-1" />);
      await flush();
    });

    expect((container.querySelector('[aria-label="Titre de la frame active"]') as HTMLInputElement).value)
      .toBe("Victoire 2-1 pour Vevey Sport, le 27 septembre 2026 en 1re ligue.");
    expect((container.querySelector('[aria-label="Texte de la frame active"]') as HTMLTextAreaElement).value)
      .toBe("Abdou Böbödi CAMARA est au centre de cet après-match.");
    expect((container.querySelector('[aria-label="Interaction de la frame active"]') as HTMLTextAreaElement).value)
      .toBe(sourceInteractions[0]);

    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });
    const body = JSON.parse(String((patchCalls()[0]?.[1] as RequestInit).body));
    body.payload.frames.forEach((savedFrame: typeof project.payload.frames[number], index: number) => {
      expect([savedFrame.text.headline, savedFrame.text.body].filter(Boolean).join(" ")).toBe(sourceContents[index]);
      expect(savedFrame.text.interaction).toBe(sourceInteractions[index]);
    });
  });

  it("disables the ZIP when a frame has no photo but keeps individual PNG export", () => {
    const zipButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.includes("Télécharger les 4 Stories"));
    const pngButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.includes("Exporter la frame"));

    expect(zipButton?.disabled).toBe(true);
    expect(zipButton?.getAttribute("aria-describedby")).toBe("story-studio-zip-requirement");
    expect(container.textContent).toContain("Une photo est requise sur chaque frame");
    expect(pngButton?.disabled).toBe(false);
  });

  it("warns and blocks exports when the active title cannot fit", async () => {
    renderFrameMock.mockImplementation(async ({ canvas, onDiagnostics }) => {
      canvas.width = 1080;
      canvas.height = 1920;
      onDiagnostics?.({ headlineFontSize: 42, headlineOverflow: true, stickerZone: null });
    });
    await setControlValue('[aria-label="Titre de la frame active"]', "Un titre impossible à faire tenir");

    expect(container.textContent).toContain("Le titre reste trop long à la taille minimale lisible");
    const pngButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.includes("Exporter la frame"));
    const zipButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.includes("Télécharger les 4 Stories"));
    expect(pngButton?.disabled).toBe(true);
    expect(zipButton?.disabled).toBe(true);
    expect(pngButton?.getAttribute("aria-describedby")).toBe("story-studio-headline-overflow");
  });

  it("shows the native Instagram sticker guide only as an editor overlay", async () => {
    const pollButton = container.querySelector<HTMLButtonElement>('[aria-label="Frame 3 · Sondage"]');
    await act(async () => {
      pollButton?.click();
      await flush();
    });

    expect(container.querySelector('[aria-label="Zone du sticker Sondage Instagram"]')).not.toBeNull();
    expect(container.textContent).toContain("Zone réservée au sticker natif Instagram");
  });

  it("shows ZIP progress and the error on the frame that failed", async () => {
    const completeProject = {
      ...project,
      payload: {
        ...project.payload,
        frames: project.payload.frames.map((item) => ({
          ...item,
          photo: { ...item.photo, assetId: photo.id, visible: true },
        })),
      },
    };
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/photos")) return Promise.resolve(jsonResponse({ photos: [photo] }));
      if (url.includes("/brand-kits")) return Promise.resolve(jsonResponse({ brandKits: [] }));
      return Promise.resolve(jsonResponse({ project: completeProject }));
    });
    exportZipMock.mockImplementation(async ({ onFrameProgress }) => {
      onFrameProgress({ index: 0, status: "rendering" });
      onFrameProgress({ index: 0, status: "completed" });
      onFrameProgress({ index: 1, status: "rendering" });
      onFrameProgress({ index: 1, status: "error", error: "Photo CORS bloquée." });
      throw new Error("Photo CORS bloquée.");
    });
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<StoryStudioSavedEditor projectId="project-1" />);
      await flush();
    });

    const zipButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.includes("Télécharger les 4 Stories"));
    expect(zipButton?.disabled).toBe(false);
    await act(async () => {
      zipButton?.click();
      await flush();
    });

    const zipStatus = [...container.querySelectorAll<HTMLElement>('[role="status"]')]
      .find((item) => item.textContent?.includes("Export interrompu"));
    expect(zipStatus).toBeDefined();
    expect(container.textContent).toContain("Frame 1 · Ajoutée au ZIP");
    expect(container.textContent).toContain("Frame 2 · Échec · Photo CORS bloquée.");
    expect(container.textContent).toContain("Frame 3 · En attente");
  });

  it("keeps the 1080 x 1920 Canvas and ZIP export available at phone width", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const completeProject = {
      ...project,
      payload: {
        ...project.payload,
        frames: project.payload.frames.map((item) => ({
          ...item,
          photo: { ...item.photo, assetId: photo.id, visible: true },
        })),
      },
    };
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/photos")) return Promise.resolve(jsonResponse({ photos: [photo] }));
      if (url.includes("/brand-kits")) return Promise.resolve(jsonResponse({ brandKits: [] }));
      return Promise.resolve(jsonResponse({ project: completeProject }));
    });
    renderFrameMock.mockImplementation(async ({ canvas }: { canvas: HTMLCanvasElement }) => {
      canvas.width = 1080;
      canvas.height = 1920;
    });
    const createObjectUrl = vi.fn(() => "blob:stories");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<StoryStudioSavedEditor projectId="project-1" />);
      await flush();
    });

    const canvas = container.querySelector("canvas");
    const zipButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.includes("Télécharger les 4 Stories"));
    expect([canvas?.width, canvas?.height]).toEqual([1080, 1920]);
    expect(zipButton?.disabled).toBe(false);
    await act(async () => {
      zipButton?.click();
      await flush();
    });

    expect(exportZipMock).toHaveBeenCalledWith(expect.objectContaining({ payload: completeProject.payload }));
    expect(container.textContent).toContain("ZIP téléchargé");
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:stories");
  });

  it("restores the saved snapshot and autosaves a newly selected Brand Kit", async () => {
    const savedLogoLayout = { "1080x1350:editorial_klique": { x: 320, y: 480, scale: 1.75 } };
    const projectWithLogoLayout = {
      ...project,
      payload: {
        ...project.payload,
        canvasFormat: "1080x1350" as const,
        frames: project.payload.frames.map((item, index) => index === 0
          ? { ...item, logoLayouts: savedLogoLayout }
          : item) as typeof project.payload.frames,
      },
    };
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        const body = JSON.parse(String(options.body));
        return Promise.resolve(jsonResponse({ project: { ...projectWithLogoLayout, payload: body.payload, version: 2 } }));
      }
      if (url.includes("/photos")) return Promise.resolve(jsonResponse({ photos: [photo] }));
      if (url.includes("/brand-kits")) return Promise.resolve(jsonResponse({ brandKits: [currentBrandKit, secondBrandKit] }));
      return Promise.resolve(jsonResponse({ project: projectWithLogoLayout }));
    });
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<StoryStudioSavedEditor projectId="project-1" />);
      await flush();
    });

    expect(renderFrameMock).toHaveBeenLastCalledWith(expect.objectContaining({
      brandKitSnapshot: savedBrandKitSnapshot,
      frame: expect.objectContaining({ logoLayouts: savedLogoLayout }),
    }));
    expect(container.querySelector("canvas")?.height).toBe(1350);
    expect(container.querySelector("h1")?.textContent).toContain("1080 × 1350");
    expect(container.textContent).toContain("Snapshot enregistré · Ancien Club Nord");

    await setControlValue('[aria-label="Brand Kit du projet"]', secondBrandKit.id);
    expect(renderFrameMock).toHaveBeenLastCalledWith(expect.objectContaining({
      brandKitSnapshot: expect.objectContaining({
        name: "Club Sud",
        primaryColor: "#010203",
        fontFamily: "Impact",
        signatureMode: "hidden",
      }),
    }));
    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });
    const body = JSON.parse(String((patchCalls()[0]?.[1] as RequestInit).body));
    expect(body.payload).toMatchObject({
      brandKitId: secondBrandKit.id,
      brandKitSnapshot: {
        name: "Club Sud",
        primaryColor: "#010203",
        accentColor: "#F2B800",
        signatureMode: "hidden",
      },
    });
    expect(body.payload.frames[0].logoLayouts).toEqual(savedLogoLayout);
  });

  it("debounces and saves text, template, photo and crop with the current version", async () => {
    await setControlValue('[aria-label="Titre de la frame active"]', "Titre sauvegardé");
    const minimalButton = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((button) => button.textContent === "Minimal Premium");
    const photoButton = container.querySelector<HTMLButtonElement>('[aria-label="Utiliser la photo photo-1"]');
    await act(async () => {
      minimalButton?.click();
      photoButton?.click();
      await flush();
    });
    await setControlValue('[aria-label="Zoom de la photo"]', "1.5");

    await act(async () => {
      vi.advanceTimersByTime(699);
      await flush();
    });
    expect(patchCalls()).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await flush();
    });
    expect(patchCalls()).toHaveLength(1);
    const body = JSON.parse(String((patchCalls()[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      expectedVersion: 1,
      payload: {
        templateKey: "minimal_premium",
      },
    });
    expect(body.payload.frames[0]).toMatchObject({
      text: { headline: "Titre sauvegardé" },
      photo: { assetId: "photo-1", visible: true, scale: 1.5 },
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Enregistré");
  });

  it("persists text and logo layouts per template and resets only the active layout", async () => {
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => ({
      x: 0, y: 0, left: 0, top: 0, right: 540, bottom: canvas.height / 2, width: 540, height: canvas.height / 2,
      toJSON: () => ({}),
    }));
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    const dispatchPointer = (type: string, clientX: number, clientY: number, pointerId: number) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { clientX, clientY, pointerId });
      canvas.dispatchEvent(event);
    };

    await act(async () => {
      dispatchPointer("pointerdown", 100, 125, 1);
      dispatchPointer("pointermove", 150, 165, 1);
      dispatchPointer("pointerup", 150, 165, 1);
      await flush();
    });
    expect(container.querySelector('[data-label="TITRE"]')?.className).toContain("activeTextSelection");
    await act(async () => {
      dispatchPointer("pointerdown", 450, 55, 3);
      dispatchPointer("pointermove", 400, 105, 3);
      dispatchPointer("pointerup", 400, 105, 3);
      await flush();
    });
    await setControlValue('[aria-label="Taille du logo du Brand Kit"]', "1.5");

    const matchButton = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((button) => button.textContent === "Énergie Match");
    await act(async () => {
      matchButton?.click();
      await flush();
    });
    await act(async () => {
      dispatchPointer("pointerdown", 100, 125, 2);
      dispatchPointer("pointermove", 200, 175, 2);
      dispatchPointer("pointerup", 200, 175, 2);
      await flush();
    });
    await act(async () => {
      dispatchPointer("pointerdown", 450, 70, 4);
      dispatchPointer("pointermove", 425, 120, 4);
      dispatchPointer("pointerup", 425, 120, 4);
      await flush();
    });
    const editorialButton = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((button) => button.textContent === "Éditorial KLIQUE");
    await act(async () => {
      editorialButton?.click();
      vi.advanceTimersByTime(700);
      await flush();
    });

    const savedBody = JSON.parse(String((patchCalls()[0]?.[1] as RequestInit).body));
    expect(savedBody.payload.frames[0].textLayouts).toMatchObject({
      "1080x1920:editorial_klique": { headline: { x: 172, y: 280 } },
      "1080x1920:match_energy": { headline: { x: 272, y: 300 } },
    });
    expect(savedBody.payload.frames[0].logoLayouts).toMatchObject({
      "1080x1920:editorial_klique": { x: 688, y: 172, scale: 1.5 },
      "1080x1920:match_energy": { x: 738, y: 204, scale: 1 },
    });

    const resetButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Réinitialiser la disposition"));
    await act(async () => {
      resetButton?.click();
      await flush();
    });
    const resetFrame = renderFrameMock.mock.calls.at(-1)?.[0].frame;
    expect(resetFrame.textLayouts?.["1080x1920:editorial_klique"]).toBeUndefined();
    expect(resetFrame.textLayouts?.["1080x1920:match_energy"]).toBeDefined();
    expect(resetFrame.logoLayouts?.["1080x1920:editorial_klique"]).toBeUndefined();
    expect(resetFrame.logoLayouts?.["1080x1920:match_energy"]).toBeDefined();
  });

  it("restores independent layouts after a round trip between project formats", async () => {
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => ({
      x: 0, y: 0, left: 0, top: 0, right: 540, bottom: canvas.height / 2, width: 540, height: canvas.height / 2,
      toJSON: () => ({}),
    }));
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    const dispatchPointer = (type: string, clientX: number, clientY: number, pointerId: number) => {
      const event = new Event(type, { bubbles: true });
      Object.assign(event, { clientX, clientY, pointerId });
      canvas.dispatchEvent(event);
    };
    const formatButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Format du projet"] button')]
      .find((button) => button.textContent?.includes(label));

    await act(async () => {
      dispatchPointer("pointerdown", 100, 125, 10);
      dispatchPointer("pointermove", 150, 165, 10);
      dispatchPointer("pointerup", 150, 165, 10);
      dispatchPointer("pointerdown", 450, 55, 12);
      dispatchPointer("pointermove", 400, 105, 12);
      dispatchPointer("pointerup", 400, 105, 12);
      await flush();
    });
    await act(async () => {
      formatButton("1080 × 1350")?.click();
      await flush();
    });
    await act(async () => {
      dispatchPointer("pointerdown", 100, 125, 11);
      dispatchPointer("pointermove", 200, 175, 11);
      dispatchPointer("pointerup", 200, 175, 11);
      dispatchPointer("pointerdown", 450, 55, 13);
      dispatchPointer("pointermove", 425, 105, 13);
      dispatchPointer("pointerup", 425, 105, 13);
      await flush();
    });
    await act(async () => {
      formatButton("1080 × 1920")?.click();
      await flush();
    });

    const renderedFrame = renderFrameMock.mock.calls.at(-1)?.[0].frame;
    expect(renderedFrame.textLayouts).toMatchObject({
      "1080x1920:editorial_klique": { headline: { x: 172, y: 280 } },
      "1080x1350:editorial_klique": { headline: { x: 272, y: 300 } },
    });
    expect(renderedFrame.textLayouts["1080x1920:editorial_klique"].headline).toEqual({ x: 172, y: 280 });
    expect(renderedFrame.logoLayouts).toMatchObject({
      "1080x1920:editorial_klique": { x: 688, y: 172, scale: 1 },
      "1080x1350:editorial_klique": { x: 738, y: 164, scale: 1 },
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });
    const savedBody = JSON.parse(String((patchCalls().at(-1)?.[1] as RequestInit).body));
    expect(savedBody.payload.canvasFormat).toBe("1080x1920");
    expect(savedBody.payload.frames[0]).toMatchObject({
      textLayouts: expect.objectContaining({
        "1080x1350:editorial_klique": expect.any(Object),
      }),
      logoLayouts: expect.objectContaining({
        "1080x1350:editorial_klique": { x: 738, y: 164, scale: 1 },
      }),
    });

    const resetButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Réinitialiser la disposition"));
    await act(async () => {
      resetButton?.click();
      await flush();
    });
    const resetFrame = renderFrameMock.mock.calls.at(-1)?.[0].frame;
    expect(resetFrame.textLayouts["1080x1920:editorial_klique"]).toBeUndefined();
    expect(resetFrame.logoLayouts["1080x1920:editorial_klique"]).toBeUndefined();
    expect(resetFrame.textLayouts["1080x1350:editorial_klique"]).toBeDefined();
    expect(resetFrame.logoLayouts["1080x1350:editorial_klique"]).toBeDefined();
  });

  it("edits and autosaves a 1080x1350 match card without losing it across formats", async () => {
    const formatButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Format du projet"] button')]
      .find((button) => button.textContent?.includes(label));
    await act(async () => {
      formatButton("1080 × 1350")?.click();
      await flush();
    });
    const addButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Ajouter un bloc match"));
    await act(async () => {
      addButton?.click();
      await flush();
    });

    await setControlValue('[aria-label="Compétition du match"]', "SB League Women");
    await setControlValue('[aria-label="Équipe domicile"]', "Elfic Fribourg Basketball");
    await setControlValue('[aria-label="Score domicile"]', "12");
    await setControlValue('[aria-label="Équipe extérieure"]', "Adversaire au nom très long");
    await setControlValue('[aria-label="Score extérieur"]', "10");
    const homeLogo = container.querySelector<HTMLButtonElement>('[aria-label="Logo domicile : Club Nord modifié · clair"]');
    const awayLogo = container.querySelector<HTMLButtonElement>('[aria-label="Logo extérieur : Club Nord modifié · clair"]');
    expect(homeLogo?.querySelector("img")?.getAttribute("src")).toBe(brandLogo.blobUrl);
    expect(container.querySelector('[aria-label="Logo domicile : Logo workspace 1"]')).toBeNull();
    const noHomeLogo = container.querySelector<HTMLButtonElement>('[aria-label="Logo domicile : Aucun"]');
    expect(noHomeLogo?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      homeLogo?.click();
      awayLogo?.click();
      await flush();
    });
    expect(container.querySelector('fieldset[aria-label="Logo domicile"] > div > img')?.getAttribute("src")).toBe(brandLogo.blobUrl);
    await act(async () => {
      noHomeLogo?.click();
      await flush();
    });
    expect(renderFrameMock.mock.calls.at(-1)?.[0].frame.matchCard.homeTeam).toMatchObject({ logoPhotoId: null, logoUrl: null });
    await act(async () => {
      homeLogo?.click();
      await flush();
    });

    await act(async () => {
      formatButton("1080 × 1920")?.click();
      await flush();
      formatButton("1080 × 1350")?.click();
      await flush();
      vi.advanceTimersByTime(700);
      await flush();
    });

    const renderedFrame = renderFrameMock.mock.calls.at(-1)?.[0].frame;
    expect(renderedFrame.matchCard).toEqual({
      competition: "SB League Women",
      homeTeam: { name: "Elfic Fribourg Basketball", logoPhotoId: brandLogo.id, logoUrl: brandLogo.blobUrl },
      awayTeam: { name: "Adversaire au nom très long", logoPhotoId: brandLogo.id, logoUrl: brandLogo.blobUrl },
      homeScore: 12,
      awayScore: 10,
    });
    const savedBody = JSON.parse(String((patchCalls().at(-1)?.[1] as RequestInit).body));
    expect(savedBody.payload.frames[0].matchCard).toEqual(renderedFrame.matchCard);
  });

  it("saves only reusable 1080x1350 frame fields as a workspace model", async () => {
    const formatButton = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Format du projet"] button')]
      .find((button) => button.textContent?.includes("1080 × 1350"));
    await act(async () => {
      formatButton?.click();
      await flush();
    });
    const saveModelButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Enregistrer comme modèle");
    await act(async () => {
      saveModelButton?.click();
      await flush();
    });
    await setControlValue('[aria-label="Nom du modèle de frame"]', "Ma composition");
    const confirmSave = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Enregistrer le modèle");
    await act(async () => {
      confirmSave?.click();
      await flush();
    });

    const modelPost = fetchMock.mock.calls.find(([url, options]) => (
      String(url).includes("/frame-models") && (options as RequestInit | undefined)?.method === "POST"
    ));
    const body = JSON.parse(String((modelPost?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      name: "Ma composition",
      content: { schemaVersion: 1, canvasFormat: "1080x1350", templateKey: "editorial_klique" },
    });
    expect(body.content.frame).not.toHaveProperty("photo");
    expect(body.content.frame).not.toHaveProperty("matchCard");
    expect(body.content.brandKitSnapshot).toEqual(savedBrandKitSnapshot);
  });

  it("shows replaced fields and preserves photo and match data when applying a model", async () => {
    const formatButton = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Format du projet"] button')]
      .find((button) => button.textContent?.includes("1080 × 1350"));
    await act(async () => {
      formatButton?.click();
      await flush();
    });
    const photoButton = container.querySelector<HTMLButtonElement>('[aria-label="Utiliser la photo photo-1"]');
    const addMatchButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Ajouter un bloc match"));
    await act(async () => {
      photoButton?.click();
      addMatchButton?.click();
      await flush();
    });
    const beforeApply = renderFrameMock.mock.calls.at(-1)?.[0].frame;

    const applyButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Appliquer un modèle");
    await act(async () => {
      applyButton?.click();
      await flush();
    });
    await setControlValue('[aria-label="Modèle de frame à appliquer"]', frameModel.id);
    const confirmation = container.querySelector('[aria-label="Confirmer l’application du modèle"]');
    expect(confirmation?.textContent).toContain("Style visuel du projet");
    expect(confirmation?.textContent).toContain("Brand Kit par défaut du projet");
    expect(confirmation?.textContent).toContain("Textes de la frame active");
    expect(confirmation?.textContent).toContain("La photo du projet et les données du match restent inchangées");

    const confirmApply = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Confirmer l’application");
    await act(async () => {
      confirmApply?.click();
      await flush();
      vi.advanceTimersByTime(700);
      await flush();
    });

    const rendered = renderFrameMock.mock.calls.at(-1)?.[0];
    expect(rendered.template.key).toBe(frameModel.content.templateKey);
    expect(rendered.frame.text).toEqual(frameModel.content.frame.text);
    expect(rendered.frame.photo).toEqual(beforeApply.photo);
    expect(rendered.frame.matchCard).toEqual(beforeApply.matchCard);
    expect(rendered.frame.textLayouts["1080x1350:match_energy"]).toEqual(frameModel.content.frame.textLayout);
    const savedBody = JSON.parse(String((patchCalls().at(-1)?.[1] as RequestInit).body));
    expect(savedBody.payload.brandKitSnapshot).toEqual(frameModel.content.brandKitSnapshot);
    expect(savedBody.payload.frames[0].photo).toEqual(beforeApply.photo);
    expect(savedBody.payload.frames[0].matchCard).toEqual(beforeApply.matchCard);
  });

  it("uploads directly to Blob, registers metadata and selects the photo", async () => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["photo"], "photo.jpg", { type: "image/jpeg" })],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    });

    const postCalls = fetchMock.mock.calls.filter(([, options]) => (options as RequestInit | undefined)?.method === "POST");
    expect(postCalls).toHaveLength(2);
    expect(JSON.parse(String(postCalls[0]?.[1]?.body))).toMatchObject({
      action: "create-upload-intent",
      contentType: "image/jpeg",
    });
    expect(uploadMock).toHaveBeenCalledWith(
      "story-studio/photos/upload-2.jpg",
      expect.any(File),
      expect.objectContaining({
        handleUploadUrl: "/api/contents/storage/story-studio/photos",
        clientPayload: "signed-intent",
        multipart: true,
      }),
    );
    expect(JSON.parse(String(postCalls[1]?.[1]?.body))).toMatchObject({
      action: "register-upload",
      uploadIntent: "signed-intent",
    });
    expect(container.querySelector('[aria-label="Utiliser la photo photo-2"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(renderFrameMock).toHaveBeenLastCalledWith(expect.objectContaining({
      photoUrl: "https://studio.public.blob.vercel-storage.com/photo-2.jpg",
      frame: expect.objectContaining({ photo: expect.objectContaining({ assetId: "photo-2" }) }),
    }));
  });

  it("uploads, resizes and autosaves an optional transparent subject layer", async () => {
    const input = container.querySelector('input[type="file"][accept="image/png"]') as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["png"], "player.png", { type: "image/png" })],
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    });

    const intentCall = fetchMock.mock.calls.find(([, options]) => {
      if ((options as RequestInit | undefined)?.method !== "POST") return false;
      return JSON.parse(String((options as RequestInit).body)).assetKind === "subjectLayer";
    });
    expect(JSON.parse(String((intentCall?.[1] as RequestInit).body))).toMatchObject({
      assetKind: "subjectLayer",
      contentType: "image/png",
    });
    expect(renderFrameMock.mock.calls.at(-1)?.[0].frame.subjectLayer).toMatchObject({
      photoId: "55555555-5555-4555-8555-555555555555",
      url: "https://studio.public.blob.vercel-storage.com/story-studio/subjects/player.png",
      x: 180,
      y: 240,
      scale: 1,
    });

    await setControlValue('[aria-label="Taille du sujet détouré"]', "1.5");
    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });
    const savedBody = JSON.parse(String((patchCalls().at(-1)?.[1] as RequestInit).body));
    expect(savedBody.payload.frames[0].subjectLayer.scale).toBe(1.5);
  });

  it("rejects a photo over 25 MB before any upload request", async () => {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const oversized = new File(["photo"], "oversized.jpg", { type: "image/jpeg" });
    Object.defineProperty(oversized, "size", { value: MAX_STORY_STUDIO_PHOTO_BYTES + 1 });
    Object.defineProperty(input, "files", { configurable: true, value: [oversized] });
    const requestCount = fetchMock.mock.calls.length;

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await flush();
    });

    expect(fetchMock).toHaveBeenCalledTimes(requestCount);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("limite de 25 Mo");
  });

  it("shows a 409 and stops autosave without replacing the local draft", async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (options?.method === "PATCH") {
        return Promise.resolve(jsonResponse({
          message: "Conflit de version du projet Story Studio.",
          currentVersion: 2,
          currentProject: { ...project, version: 2 },
        }, 409));
      }
      if (url.includes("/photos")) return Promise.resolve(jsonResponse({ photos: [photo] }));
      return Promise.resolve(jsonResponse({ project }));
    });

    await setControlValue('[aria-label="Titre de la frame active"]', "Brouillon local");
    await act(async () => {
      vi.advanceTimersByTime(700);
      await flush();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Conflit 409");
    expect((container.querySelector('[aria-label="Titre de la frame active"]') as HTMLInputElement).value).toBe("Brouillon local");
    await setControlValue('[aria-label="Texte de la frame active"]', "Encore local");
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await flush();
    });
    expect(patchCalls()).toHaveLength(1);
  });
});