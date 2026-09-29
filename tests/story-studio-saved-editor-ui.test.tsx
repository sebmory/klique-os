// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryStudioSavedEditor } from "@/components/contents/story-studio/StoryStudioSavedEditor";
import type { StoryStudioBrandKit } from "@/types/story-studio-brand-kit";
import type { StoryStudioBrandKitSnapshot } from "@/types/story-studio";
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
    canvas.width = 1080;
    canvas.height = 1920;
    onTextBounds?.({
      eyebrow: { x: 72, y: 100, width: 936, height: 42, position: { x: 72, y: 100 } },
      headline: { x: 72, y: 200, width: 936, height: 90, position: { x: 72, y: 200 } },
      body: { x: 72, y: 350, width: 936, height: 50, position: { x: 72, y: 350 } },
    });
    const defaultLogo = template.composition.logo;
    const logoLayout = renderedFrame.logoLayouts?.[template.key] ?? { x: defaultLogo.x, y: defaultLogo.y, scale: 1 };
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
  uploadMock.mockResolvedValue({
    url: "https://studio.public.blob.vercel-storage.com/photo-2.jpg",
    pathname: "story-studio/photos/upload-2.jpg",
  });
  fetchMock = vi.fn((url: string, options?: RequestInit) => {
    if (options?.method === "PATCH") {
      const body = JSON.parse(String(options.body));
      return Promise.resolve(jsonResponse({ project: { ...project, payload: body.payload, version: 2 } }));
    }
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      if (body.action === "create-upload-intent") {
        return Promise.resolve(jsonResponse({ pathname: "story-studio/photos/upload-2.jpg", uploadIntent: "signed-intent" }));
      }
      if (body.action === "register-upload") {
        return Promise.resolve(jsonResponse({ photo: { ...photo, id: "photo-2", blobUrl: "https://studio.public.blob.vercel-storage.com/photo-2.jpg" } }, 201));
      }
    }
    if (url.includes("/photos")) return Promise.resolve(jsonResponse({ photos: [photo] }));
    if (url.includes("/brand-kits")) return Promise.resolve(jsonResponse({ brandKits: [currentBrandKit, secondBrandKit] }));
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
    const savedLogoLayout = { editorial_klique: { x: 320, y: 480, scale: 1.75 } };
    const projectWithLogoLayout = {
      ...project,
      payload: {
        ...project.payload,
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
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 540, bottom: 960, width: 540, height: 960,
      toJSON: () => ({}),
    });
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
      editorial_klique: { headline: { x: 172, y: 280 } },
      match_energy: { headline: { x: 272, y: 300 } },
    });
    expect(savedBody.payload.frames[0].logoLayouts).toMatchObject({
      editorial_klique: { x: 688, y: 172, scale: 1.5 },
      match_energy: { x: 738, y: 204, scale: 1 },
    });

    const resetButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Réinitialiser la disposition"));
    await act(async () => {
      resetButton?.click();
      await flush();
    });
    const resetFrame = renderFrameMock.mock.calls.at(-1)?.[0].frame;
    expect(resetFrame.textLayouts?.editorial_klique).toBeUndefined();
    expect(resetFrame.textLayouts?.match_energy).toBeDefined();
    expect(resetFrame.logoLayouts?.editorial_klique).toBeUndefined();
    expect(resetFrame.logoLayouts?.match_energy).toBeDefined();
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