/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportStoryStudioCanvasPng,
  findStoryStudioAlphaBounds,
  renderStoryStudioFrameToCanvas,
  StoryStudioBrowserRenderError,
} from "@/lib/story-studio/browser-renderer";
import { getStoryStudioTemplate } from "@/lib/story-studio/templates";
import type { StoryStudioFrame } from "@/types/story-studio";

const fillStyles: string[] = [];
let currentFillStyle = "";
const context = {
  beginPath: vi.fn(),
  rect: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
  clip: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fill: vi.fn(),
  drawImage: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 20 })),
  set fillStyle(value: string) {
    currentFillStyle = value;
    fillStyles.push(value);
  },
  get fillStyle() {
    return currentFillStyle;
  },
  strokeStyle: "",
  lineWidth: 1,
  font: "",
  textAlign: "left",
  textBaseline: "top",
} as unknown as CanvasRenderingContext2D;

const frame: StoryStudioFrame = {
  id: "frame-1",
  order: 1,
  role: "result",
  sourceStoryIndex: 1,
  text: { eyebrow: "Le match", headline: "Victoire 2-1", body: "But à la 88e minute", interaction: "" },
  photo: { assetId: "photo-1", visible: true, scale: 1.2, x: 0.25, y: -0.2 },
  elements: { athleteName: false, score: true, competition: false, logo: true, signature: false, interactionZone: false },
};

const fourDemoFrames: StoryStudioFrame[] = [
  frame,
  {
    ...frame,
    id: "frame-2",
    order: 2,
    role: "context",
    text: { eyebrow: "Le tournant", headline: "Tout s'est joué à la 88e", body: "Une dernière accélération.", interaction: "" },
  },
  {
    ...frame,
    id: "frame-3",
    order: 3,
    role: "poll",
    text: { eyebrow: "Votre avis", headline: "Le moment du match ?", body: "", interaction: "Le but de la victoire" },
    elements: { ...frame.elements, interactionZone: true },
  },
  {
    ...frame,
    id: "frame-4",
    order: 4,
    role: "question",
    text: {
      eyebrow: "À vous",
      headline: "Quel joueur vous a impressionné ?",
      body: "Partagez votre choix avec la communauté.",
      interaction: "Répondre",
    },
    elements: { ...frame.elements, interactionZone: true },
  },
];

const brandKitSnapshot = {
  name: "Club Nord",
  primaryColor: "#123456",
  secondaryColor: "#FEDCBA",
  accentColor: "#ABCDEF",
  textColor: "#F8F8F8",
  mutedTextColor: "#C0C0C0",
  lightLogoPhotoId: "11111111-1111-4111-8111-111111111111",
  darkLogoPhotoId: null,
  lightLogoUrl: "https://studio.public.blob.vercel-storage.com/story-studio/photos/logo.png",
  darkLogoUrl: null,
  fontFamily: "Arial" as const,
  signatureMode: "discreet" as const,
};

class SuccessfulImage {
  crossOrigin = "";
  decoding = "auto";
  naturalWidth = 1600;
  naturalHeight = 2400;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe("Story Studio browser renderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fillStyles.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load: vi.fn().mockResolvedValue([]) },
    });
    vi.stubGlobal("Image", SuccessfulImage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the selected photo, crop and text on a 1080x1920 canvas", async () => {
    const canvas = document.createElement("canvas");
    await renderStoryStudioFrameToCanvas({
      canvas,
      frame,
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: "https://studio.public.blob.vercel-storage.com/photo.jpg",
    });

    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(context.fillText).toHaveBeenCalledWith("Victoire 2-1", expect.any(Number), expect.any(Number), expect.any(Number));
  });

  it("preserves the historical logo box and applies clamped proportional logo layouts", async () => {
    const defaultBounds = vi.fn();
    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: { ...frame, photo: { ...frame.photo, visible: false } },
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: null,
      brandKitSnapshot,
      onLogoBounds: defaultBounds,
    });
    expect(defaultBounds.mock.calls[0][0].layout).toEqual({ x: 788, y: 72, scale: 1 });
    expect(defaultBounds.mock.calls[0][0].height).toBeCloseTo(110);

    const adjustedBounds = vi.fn();
    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: {
        ...frame,
        photo: { ...frame.photo, visible: false },
        logoLayouts: { editorial_klique: { x: 1000, y: 1900, scale: 2 } },
      },
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: null,
      brandKitSnapshot,
      onLogoBounds: adjustedBounds,
    });
    expect(adjustedBounds.mock.calls[0][0].layout).toEqual({ x: 640, y: 1700, scale: 2 });
    expect(adjustedBounds.mock.calls[0][0].height).toBeCloseTo(220);
    const [, , , width, height] = vi.mocked(context.drawImage).mock.calls.at(-1)!;
    expect(Number(width) / Number(height)).toBeCloseTo(1600 / 2400);
  });

  it("renders 1080x1350 with its own text and logo layouts", async () => {
    const onTextBounds = vi.fn();
    const onLogoBounds = vi.fn();
    const canvas = document.createElement("canvas");
    await renderStoryStudioFrameToCanvas({
      canvas,
      frame: {
        ...frame,
        photo: { ...frame.photo, visible: false },
        textLayouts: {
          editorial_klique: {
            eyebrow: { x: 72, y: 1200 },
            headline: { x: 72, y: 1300 },
            body: { x: 72, y: 1500 },
          },
          "1080x1350:editorial_klique": {
            eyebrow: { x: 90, y: 500 },
            headline: { x: 110, y: 620 },
            body: { x: 130, y: 900 },
          },
        },
        logoLayouts: {
          editorial_klique: { x: 700, y: 1500, scale: 1 },
          "1080x1350:editorial_klique": { x: 500, y: 300, scale: 1.5 },
        },
      },
      template: getStoryStudioTemplate("editorial_klique", "1080x1350"),
      photoUrl: null,
      brandKitSnapshot,
      onTextBounds,
      onLogoBounds,
    });

    expect([canvas.width, canvas.height]).toEqual([1080, 1350]);
    expect(onTextBounds.mock.calls[0][0].headline.position).toEqual({ x: 110, y: 620 });
    expect(onLogoBounds.mock.calls[0][0].layout).toEqual({ x: 500, y: 300, scale: 1.5 });
  });

  it("renders an optional 1080x1350 match card with two-digit scores and fitted team names", async () => {
    const canvas = document.createElement("canvas");
    const matchFrame: StoryStudioFrame = {
      ...frame,
      photo: { ...frame.photo, visible: false },
      matchCard: {
        competition: "SB League Women",
        homeTeam: {
          name: "Elfic Fribourg Basketball",
          logoPhotoId: "11111111-1111-4111-8111-111111111111",
          logoUrl: "https://studio.public.blob.vercel-storage.com/story-studio/brand-kit-logos/elfic.png",
        },
        awayTeam: {
          name: "Une équipe adverse avec un nom exceptionnellement long",
          logoPhotoId: "22222222-2222-4222-8222-222222222222",
          logoUrl: "https://studio.public.blob.vercel-storage.com/story-studio/brand-kit-logos/adversaire.png",
        },
        homeScore: 12,
        awayScore: 10,
      },
    };
    await renderStoryStudioFrameToCanvas({
      canvas,
      frame: matchFrame,
      template: getStoryStudioTemplate("match_energy", "1080x1350"),
      photoUrl: null,
    });

    expect([canvas.width, canvas.height]).toEqual([1080, 1350]);
    expect(context.fillText).toHaveBeenCalledWith("12", expect.any(Number), expect.any(Number), 120);
    expect(context.fillText).toHaveBeenCalledWith("10", expect.any(Number), expect.any(Number), 120);
    expect(vi.mocked(context.fillText).mock.calls.some(([text]) => String(text).endsWith("…"))).toBe(true);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    for (const [, , , width, height] of vi.mocked(context.drawImage).mock.calls) {
      expect(Number(width) / Number(height)).toBeCloseTo(1600 / 2400);
    }
  });

  it("does not add match card drawing for historical frames", async () => {
    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: { ...frame, photo: { ...frame.photo, visible: false } },
      template: getStoryStudioTemplate("match_energy", "1080x1350"),
      photoUrl: null,
    });

    expect(vi.mocked(context.fillText).mock.calls.map(([text]) => String(text))).not.toContain("–");
  });

  it("tracks transparent margins and layers the subject before the score band", async () => {
    const pixels = new Uint8ClampedArray(6 * 5 * 4);
    for (const [x, y] of [[2, 1], [4, 3]]) pixels[(y * 6 + x) * 4 + 3] = 255;
    expect(findStoryStudioAlphaBounds(pixels, 6, 5)).toEqual({ x: 2, y: 1, width: 3, height: 3 });

    const onSubjectBounds = vi.fn();
    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: {
        ...frame,
        photo: { ...frame.photo, visible: false },
        subjectLayer: {
          photoId: "44444444-4444-4444-8444-444444444444",
          url: "https://studio.public.blob.vercel-storage.com/story-studio/subjects/player.png",
          x: 180,
          y: 240,
          scale: 1,
        },
        matchCard: {
          competition: "SB League",
          homeTeam: { name: "Elfic", logoPhotoId: null, logoUrl: null },
          awayTeam: { name: "Adversaire", logoPhotoId: null, logoUrl: null },
          homeScore: 82,
          awayScore: 71,
        },
      },
      template: getStoryStudioTemplate("match_energy", "1080x1350"),
      photoUrl: null,
      onSubjectBounds,
    });

    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(onSubjectBounds).toHaveBeenCalledWith(expect.objectContaining({ x: 180, y: 240 }));
    expect(vi.mocked(context.fillText).mock.calls.map(([text]) => String(text))).toContain("82");
    const headlineCall = vi.mocked(context.fillText).mock.calls.findIndex(([text]) => text === frame.text.headline);
    const scoreCall = vi.mocked(context.fillText).mock.calls.findIndex(([text]) => text === "82");
    expect(vi.mocked(context.fillText).mock.invocationCallOrder[headlineCall])
      .toBeLessThan(vi.mocked(context.drawImage).mock.invocationCallOrder[0]);
    expect(vi.mocked(context.drawImage).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(context.fillText).mock.invocationCallOrder[scoreCall]);
  });

  it("reduces headline type without adding an ellipsis", async () => {
    const onDiagnostics = vi.fn();
    vi.mocked(context.measureText).mockImplementation((text: string) => {
      const fontSize = Number(context.font.match(/(\d+)px/)?.[1] ?? 16);
      return { width: text.length * fontSize * 0.55 } as TextMetrics;
    });
    const longHeadlineFrame = {
      ...frame,
      text: {
        ...frame.text,
        headline: "Une victoire collective construite avec patience et détermination pendant toute la rencontre ".repeat(2),
        body: "",
      },
      textLayouts: {
        editorial_klique: {
          eyebrow: { x: 72, y: 1_160 },
          headline: { x: 72, y: 1_250 },
          body: { x: 72, y: 1_700 },
        },
      },
    };

    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: longHeadlineFrame,
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: "https://studio.public.blob.vercel-storage.com/photo.jpg",
      onDiagnostics,
    });

    const diagnostics = onDiagnostics.mock.calls[0][0];
    expect(diagnostics.headlineFontSize).toBeLessThan(getStoryStudioTemplate("editorial_klique").composition.headlineSize);
    expect(diagnostics.headlineOverflow).toBe(false);
    expect(vi.mocked(context.fillText).mock.calls.map(([text]) => String(text)).join(" ")).not.toContain("…");
  });

  it("rejects export instead of silently truncating an unresolved headline", async () => {
    const overflowingFrame = {
      ...frame,
      text: { ...frame.text, headline: "titre ".repeat(2_000), body: "" },
    };

    await expect(renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: overflowingFrame,
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: "https://studio.public.blob.vercel-storage.com/photo.jpg",
    })).rejects.toMatchObject({ code: "HEADLINE_OVERFLOW" });
    expect(vi.mocked(context.fillText).mock.calls.map(([text]) => String(text)).join(" ")).not.toContain("…");
  });

  it("reports native sticker zones without painting poll or question suggestions", async () => {
    for (const nativeFrame of fourDemoFrames.slice(2)) {
      vi.clearAllMocks();
      const onDiagnostics = vi.fn();
      await renderStoryStudioFrameToCanvas({
        canvas: document.createElement("canvas"),
        frame: nativeFrame,
        template: getStoryStudioTemplate("editorial_klique"),
        photoUrl: "https://studio.public.blob.vercel-storage.com/photo.jpg",
        onDiagnostics,
      });

      const renderedText = vi.mocked(context.fillText).mock.calls.map(([text]) => String(text)).join(" ");
      expect(renderedText).not.toContain(nativeFrame.text.interaction);
      expect(onDiagnostics).toHaveBeenLastCalledWith(expect.objectContaining({ stickerZone: expect.any(Object) }));
    }
  });

  it.each(["headline", "body", "interaction"] as const)(
    "does not paint editorial notes beginning with Aucune interaction from %s",
    async (field) => {
      const editorialNote = "Aucune interaction prévue sur cette frame.";
      const editorialFrame: StoryStudioFrame = {
        ...frame,
        photo: { ...frame.photo, visible: false },
        text: { ...frame.text, [field]: editorialNote },
        elements: { ...frame.elements, interactionZone: true },
      };

      await renderStoryStudioFrameToCanvas({
        canvas: document.createElement("canvas"),
        frame: editorialFrame,
        template: getStoryStudioTemplate("editorial_klique"),
        photoUrl: null,
      });

      const renderedText = vi.mocked(context.fillText).mock.calls.map(([text]) => String(text));
      expect(renderedText).not.toContain(editorialNote);
      expect(editorialFrame.text[field]).toBe(editorialNote);
    },
  );

  it("renders saved positions only for their template and clamps them to its safe area", async () => {
    const onTextBounds = vi.fn();
    const positionedFrame: StoryStudioFrame = {
      ...frame,
      textLayouts: {
        editorial_klique: {
          eyebrow: { x: 120, y: 220 },
          headline: { x: 150, y: 350 },
          body: { x: 180, y: 700 },
        },
        match_energy: {
          eyebrow: { x: 1080, y: 1920 },
          headline: { x: 1080, y: 1920 },
          body: { x: 1080, y: 1920 },
        },
      },
    };

    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: positionedFrame,
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: "https://studio.public.blob.vercel-storage.com/photo.jpg",
      onTextBounds,
    });
    expect(onTextBounds).toHaveBeenLastCalledWith(expect.objectContaining({
      eyebrow: expect.objectContaining({ position: { x: 120, y: 220 } }),
      headline: expect.objectContaining({ position: { x: 150, y: 350 } }),
      body: expect.objectContaining({ position: { x: 180, y: 700 } }),
    }));

    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: positionedFrame,
      template: getStoryStudioTemplate("match_energy"),
      photoUrl: "https://studio.public.blob.vercel-storage.com/photo.jpg",
      onTextBounds,
      onDiagnostics: vi.fn(),
    });
    const matchBounds = onTextBounds.mock.calls.at(-1)?.[0];
    expect(matchBounds.headline.position.x).toBeLessThanOrEqual(848);
    expect(matchBounds.headline.y + matchBounds.headline.height).toBeLessThanOrEqual(1808);
  });

  it("renders all four frames with Editorial KLIQUE and Match Energy", async () => {
    for (const templateKey of ["editorial_klique", "match_energy"] as const) {
      for (const demoFrame of fourDemoFrames) {
        await expect(renderStoryStudioFrameToCanvas({
          canvas: document.createElement("canvas"),
          frame: demoFrame,
          template: getStoryStudioTemplate(templateKey),
          photoUrl: "https://studio.public.blob.vercel-storage.com/photo.jpg",
        })).resolves.toBeUndefined();
      }
    }

    expect(context.drawImage).toHaveBeenCalledTimes(8);
  });

  it.each([
    { signatureMode: "visible" as const, expectedSignature: true },
    { signatureMode: "discreet" as const, expectedSignature: true },
    { signatureMode: "hidden" as const, expectedSignature: false },
  ])("applies the $signatureMode Brand Kit signature without hiding its club logo", async ({ signatureMode, expectedSignature }) => {
    const frameWithLegacyOverrides = {
      ...frame,
      photo: { ...frame.photo, visible: false },
      elements: { ...frame.elements, logo: true, signature: true },
    };

    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: frameWithLegacyOverrides,
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: null,
      brandKitSnapshot: { ...brandKitSnapshot, signatureMode },
    });

    const renderedText = vi.mocked(context.fillText).mock.calls.map(([text]) => String(text));
    expect(renderedText.includes("KLIQUE")).toBe(expectedSignature);
    expect(context.drawImage).toHaveBeenCalledOnce();
  });

  it("preserves legacy frame signature flags when no Brand Kit snapshot exists", async () => {
    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: { ...frame, photo: { ...frame.photo, visible: false }, elements: { ...frame.elements, logo: false, signature: true } },
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: null,
    });

    expect(context.fillText).toHaveBeenCalledWith("KLIQUE", expect.any(Number), expect.any(Number));
  });

  it("keeps the fourth-frame signature contrasted on a black background", async () => {
    const blackBrandKit = {
      ...brandKitSnapshot,
      primaryColor: "#000000",
      textColor: "#000000",
      signatureMode: "discreet" as const,
    };

    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: fourDemoFrames[3],
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: "https://studio.public.blob.vercel-storage.com/photo.jpg",
      brandKitSnapshot: blackBrandKit,
    });

    expect(context.fillText).toHaveBeenCalledWith("KLIQUE", 996, 1824);
    expect(fillStyles.slice(-2)).toEqual(["rgba(0, 0, 0, 0.82)", "#FFFFFF"]);
  });

  it("balances headline lines instead of leaving a short final orphan", async () => {
    vi.mocked(context.measureText).mockImplementation((text: string) => {
      const fontSize = Number(context.font.match(/(\d+)px/)?.[1] ?? 16);
      return { width: text.length * fontSize * 0.52 } as TextMetrics;
    });
    const balancedFrame = {
      ...frame,
      photo: { ...frame.photo, visible: false },
      text: {
        eyebrow: "Ancien surtitre",
        headline: "Victoire 2-1 pour Vevey Sport, le 27 septembre 2026 en 1re ligue.",
        body: "",
        interaction: "",
      },
      elements: { ...frame.elements, logo: false, signature: false },
    };

    await renderStoryStudioFrameToCanvas({
      canvas: document.createElement("canvas"),
      frame: balancedFrame,
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: null,
    });

    const renderedLines = vi.mocked(context.fillText).mock.calls.map(([text]) => String(text));
    const headlineLines = renderedLines.slice(1);
    expect(headlineLines.join(" ")).toBe(balancedFrame.text.headline);
    expect(headlineLines.at(-1)).not.toBe("1re ligue.");
    expect(headlineLines.at(-1)?.split(" ").length).toBeGreaterThan(2);
  });

  it("keeps four long real-data frames inside every template and hides editorial instructions", async () => {
    const longBody = "Le joueur revient sur la rencontre, son parcours, les moments décisifs et la force du collectif. ".repeat(12);
    const realFrames: StoryStudioFrame[] = [
      {
        ...fourDemoFrames[0],
        photo: { ...fourDemoFrames[0].photo, visible: false },
        text: {
          eyebrow: "Après-match avec Abdou Böbödi CAMARA",
          headline: "Victoire 2-1 pour Vevey Sport, le 27 septembre 2026 en 1re ligue.",
          body: `Abdou Böbödi CAMARA est au centre de cet après-match. ${longBody}`,
          interaction: "Aucune — ouverture visuelle avec le résultat, la compétition et la date.",
        },
        elements: { ...fourDemoFrames[0].elements, interactionZone: true },
      },
      {
        ...fourDemoFrames[1],
        photo: { ...fourDemoFrames[1].photo, visible: false },
        text: {
          eyebrow: "Après-match avec Abdou Böbödi CAMARA",
          headline: "Attaquant de Vevey Sport, Abdou Böbödi CAMARA est passé par le FC Nantes.",
          body: `Il y a disputé la Youth League et remporté deux titres de champion de France U19. ${longBody}`,
          interaction: "Aucune — portrait vertical accompagné d’une chronologie sobre.",
        },
        elements: { ...fourDemoFrames[1].elements, interactionZone: true },
      },
      {
        ...fourDemoFrames[2],
        photo: { ...fourDemoFrames[2].photo, visible: false },
        text: {
          eyebrow: "Après-match",
          headline: "Après une victoire, quel aspect souhaitez-vous découvrir en priorité?",
          body: longBody,
          interaction: "Sondage : « L’analyse du match » / « Le ressenti du joueur »",
        },
      },
      {
        ...fourDemoFrames[3],
        photo: { ...fourDemoFrames[3].photo, visible: false },
        text: {
          eyebrow: "Après-match",
          headline: "Quelle question aimeriez-vous poser à Abdou Böbödi CAMARA après ce succès?",
          body: longBody,
          interaction: "Sticker Questions pour recueillir les propositions de la communauté.",
        },
      },
    ];

    for (const templateKey of ["editorial_klique", "match_energy", "minimal_premium"] as const) {
      const template = getStoryStudioTemplate(templateKey);
      for (const realFrame of realFrames) {
        vi.clearAllMocks();
        await renderStoryStudioFrameToCanvas({
          canvas: document.createElement("canvas"),
          frame: realFrame,
          template,
          photoUrl: null,
        });

        expect(context.rect).toHaveBeenCalledWith(
          template.composition.safeArea.left,
          template.composition.safeArea.top,
          template.canvas.width - template.composition.safeArea.left - template.composition.safeArea.right,
          template.canvas.height - template.composition.safeArea.top - template.composition.safeArea.bottom,
        );
        const renderedText = vi.mocked(context.fillText).mock.calls.map(([text]) => String(text)).join(" ");
        expect(renderedText).not.toMatch(/Aucune|ouverture visuelle|portrait vertical|Sticker Questions/i);
        expect(renderedText).toContain("…");
      }
    }
  });

  it("applies and exports a Brand Kit on all three templates", async () => {
    for (const templateKey of ["editorial_klique", "match_energy", "minimal_premium"] as const) {
      vi.clearAllMocks();
      fillStyles.length = 0;
      const canvas = document.createElement("canvas");
      const frameWithoutPhoto = { ...frame, photo: { ...frame.photo, visible: false } };
      await renderStoryStudioFrameToCanvas({
        canvas,
        frame: frameWithoutPhoto,
        template: getStoryStudioTemplate(templateKey),
        photoUrl: null,
        brandKitSnapshot,
      });

      expect(fillStyles).toEqual(expect.arrayContaining([
        brandKitSnapshot.primaryColor,
        brandKitSnapshot.secondaryColor,
        brandKitSnapshot.accentColor,
        brandKitSnapshot.textColor,
      ]));
      expect(context.drawImage).toHaveBeenCalledTimes(1);
      expect(context.fillText).toHaveBeenCalledWith("KLIQUE", expect.any(Number), expect.any(Number));
      expect(document.fonts.load).toHaveBeenCalledWith(expect.stringContaining('"Arial"'));

      vi.spyOn(canvas, "toBlob").mockImplementation((callback, type) => {
        callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: type ?? "image/png" }));
      });
      await expect(exportStoryStudioCanvasPng(canvas)).resolves.toMatchObject({ type: "image/png" });
    }
  });

  it("exports that canvas as a PNG blob", async () => {
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "toBlob").mockImplementation((callback, type) => {
      callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: type ?? "image/png" }));
    });

    const blob = await exportStoryStudioCanvasPng(canvas);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(4);
  });

  it("reports a missing photo and a CORS loading failure clearly", async () => {
    const canvas = document.createElement("canvas");
    await expect(renderStoryStudioFrameToCanvas({
      canvas,
      frame,
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: null,
    })).rejects.toMatchObject({ code: "PHOTO_UNAVAILABLE" });

    class FailedImage extends SuccessfulImage {
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FailedImage);

    await expect(renderStoryStudioFrameToCanvas({
      canvas,
      frame,
      template: getStoryStudioTemplate("editorial_klique"),
      photoUrl: "https://blocked.example/photo.jpg",
    })).rejects.toEqual(expect.objectContaining<Partial<StoryStudioBrowserRenderError>>({
      code: "PHOTO_CORS",
      message: expect.stringContaining("CORS"),
    }));
  });
});