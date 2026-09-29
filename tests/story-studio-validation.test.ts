import { describe, expect, it } from "vitest";
import { StoryStudioValidationError, validateStoryStudioProjectPayload } from "@/lib/story-studio/validation";
import type { StoryStudioProjectPayload } from "@/types/story-studio";

const frame = (order: 1 | 2 | 3 | 4, role: "result" | "context" | "poll" | "question") => ({
  id: `frame-${order}`,
  order,
  role,
  sourceStoryIndex: order,
  text: { eyebrow: "", headline: "", body: "", interaction: "" },
  photo: { assetId: null, visible: true, scale: 1, x: 0, y: 0 },
  elements: { athleteName: true, score: true, competition: true, logo: false, signature: true, interactionZone: order > 2 },
});

const validPayload: StoryStudioProjectPayload = {
  schemaVersion: 1,
  templateKey: "editorial_klique",
  frames: [frame(1, "result"), frame(2, "context"), frame(3, "poll"), frame(4, "question")],
};

const brandKitSnapshot = {
  name: "Club historique",
  primaryColor: "#112233",
  secondaryColor: "#FFFFFF",
  accentColor: "#F2B800",
  textColor: "#FFFFFF",
  mutedTextColor: "#CCCCCC",
  lightLogoPhotoId: "11111111-1111-4111-8111-111111111111",
  darkLogoPhotoId: null,
  lightLogoUrl: "https://studio.public.blob.vercel-storage.com/story-studio/photos/logo.png",
  darkLogoUrl: null,
  fontFamily: "Arial" as const,
  signatureMode: "discreet" as const,
};

describe("Story Studio project validation", () => {
  it("accepts the four ordered V1 frames and future photo settings", () => {
    expect(validateStoryStudioProjectPayload(validPayload)).toEqual(validPayload);
  });

  it("accepts legacy payloads and restores a strict immutable Brand Kit snapshot", () => {
    const brandedPayload = {
      ...validPayload,
      brandKitId: "22222222-2222-4222-8222-222222222222",
      brandKitSnapshot,
    };
    expect(validateStoryStudioProjectPayload(brandedPayload)).toEqual(brandedPayload);
    expect(validateStoryStudioProjectPayload(validPayload)).toEqual(validPayload);
  });

  it.each([
    {
      field: "lightLogoUrl" as const,
      idField: "lightLogoPhotoId" as const,
      url: "https://studio.public.blob.vercel-storage.com/story-studio/photos/logo.png",
    },
    {
      field: "darkLogoUrl" as const,
      idField: "darkLogoPhotoId" as const,
      url: "https://studio.public.blob.vercel-storage.com/story-studio/brand-kit-logos/elfic.png",
    },
  ])("accepts $field from an allowed Story Studio Blob path", ({ field, idField, url }) => {
    const snapshot = {
      ...brandKitSnapshot,
      [idField]: "33333333-3333-4333-8333-333333333333",
      [field]: url,
    };

    const result = validateStoryStudioProjectPayload({
      ...validPayload,
      brandKitId: "22222222-2222-4222-8222-222222222222",
      brandKitSnapshot: snapshot,
    });

    expect(result.brandKitSnapshot?.[field]).toBe(url);
  });

  it("accepts independent text layouts by frame and template", () => {
    const frames = [...validPayload.frames] as StoryStudioProjectPayload["frames"];
    frames[0] = {
      ...frames[0],
      textLayouts: {
        editorial_klique: {
          eyebrow: { x: 72, y: 200 },
          headline: { x: 90, y: 300 },
          body: { x: 110, y: 700 },
        },
        match_energy: {
          eyebrow: { x: 120, y: 240 },
          headline: { x: 140, y: 420 },
          body: { x: 160, y: 900 },
        },
      },
    };
    expect(validateStoryStudioProjectPayload({ ...validPayload, frames }).frames[0].textLayouts)
      .toEqual(frames[0].textLayouts);

    frames[0] = {
      ...frames[0],
      textLayouts: {
        editorial_klique: {
          ...frames[0].textLayouts!.editorial_klique!,
          headline: { x: 1081, y: 300 },
        },
      },
    };
    expect(() => validateStoryStudioProjectPayload({ ...validPayload, frames })).toThrow(/headline.x/);
  });

  it("accepts strict independent logo layouts while preserving legacy frames", () => {
    expect(validateStoryStudioProjectPayload(validPayload)).toEqual(validPayload);
    const frames = [...validPayload.frames] as StoryStudioProjectPayload["frames"];
    frames[0] = {
      ...frames[0],
      logoLayouts: {
        editorial_klique: { x: 0, y: 0, scale: 0.25 },
        match_energy: { x: 1080, y: 1920, scale: 4 },
      },
    };
    expect(validateStoryStudioProjectPayload({ ...validPayload, frames }).frames[0].logoLayouts)
      .toEqual(frames[0].logoLayouts);

    frames[0] = { ...frames[0], logoLayouts: { editorial_klique: { x: 20, y: 30, scale: 4.01 } } };
    expect(() => validateStoryStudioProjectPayload({ ...validPayload, frames })).toThrow(/logoLayouts.*scale/);
  });

  it("accepts an optional project format and keeps layouts separate with format bounds", () => {
    const frames = [...validPayload.frames] as StoryStudioProjectPayload["frames"];
    frames[0] = {
      ...frames[0],
      textLayouts: {
        "1080x1920:editorial_klique": {
          eyebrow: { x: 72, y: 1500 },
          headline: { x: 72, y: 1600 },
          body: { x: 72, y: 1800 },
        },
        "1080x1350:editorial_klique": {
          eyebrow: { x: 72, y: 700 },
          headline: { x: 72, y: 800 },
          body: { x: 72, y: 1100 },
        },
      },
      logoLayouts: {
        "1080x1920:editorial_klique": { x: 700, y: 1500, scale: 1 },
        "1080x1350:editorial_klique": { x: 600, y: 900, scale: 1.5 },
      },
    };
    const formattedPayload = { ...validPayload, canvasFormat: "1080x1350" as const, frames };
    expect(validateStoryStudioProjectPayload(formattedPayload)).toEqual(formattedPayload);
    expect(validateStoryStudioProjectPayload(validPayload)).toEqual(validPayload);

    frames[0] = {
      ...frames[0],
      logoLayouts: { "1080x1350:editorial_klique": { x: 20, y: 1351, scale: 1 } },
    };
    expect(() => validateStoryStudioProjectPayload({ ...formattedPayload, frames })).toThrow(/logoLayouts.*y/);
    expect(() => validateStoryStudioProjectPayload({ ...validPayload, canvasFormat: "square" })).toThrow(/canvasFormat/);
  });

  it("strictly validates an optional match card and its Blob logo snapshots", () => {
    const frames = [...validPayload.frames] as StoryStudioProjectPayload["frames"];
    frames[0] = {
      ...frames[0],
      matchCard: {
        competition: "SB League",
        homeTeam: {
          name: "Elfic Fribourg",
          logoPhotoId: "11111111-1111-4111-8111-111111111111",
          logoUrl: "https://studio.public.blob.vercel-storage.com/story-studio/brand-kit-logos/elfic.png",
        },
        awayTeam: { name: "Équipe adverse au nom particulièrement long", logoPhotoId: null, logoUrl: null },
        homeScore: 12,
        awayScore: 10,
      },
    };
    const payload = { ...validPayload, canvasFormat: "1080x1350" as const, frames };
    expect(validateStoryStudioProjectPayload(payload)).toEqual(payload);
    expect(validateStoryStudioProjectPayload(validPayload)).toEqual(validPayload);

    frames[0] = { ...frames[0], matchCard: { ...frames[0].matchCard!, homeScore: 100 } };
    expect(() => validateStoryStudioProjectPayload({ ...payload, frames })).toThrow(/homeScore/);
    frames[0] = {
      ...frames[0],
      matchCard: {
        ...frames[0].matchCard!,
        homeScore: 12,
        homeTeam: { ...frames[0].matchCard!.homeTeam, logoUrl: "https://example.com/logo.png" },
      },
    };
    expect(() => validateStoryStudioProjectPayload({ ...payload, frames })).toThrow(/Blob Vercel Story Studio/);
  });

  it("strictly validates an optional transparent subject layer without changing legacy frames", () => {
    const frames = [...validPayload.frames] as StoryStudioProjectPayload["frames"];
    frames[0] = {
      ...frames[0],
      subjectLayer: {
        photoId: "44444444-4444-4444-8444-444444444444",
        url: "https://studio.public.blob.vercel-storage.com/story-studio/subjects/player.png",
        x: 180,
        y: 240,
        scale: 1.25,
      },
    };
    expect(validateStoryStudioProjectPayload({ ...validPayload, frames }).frames[0].subjectLayer)
      .toEqual(frames[0].subjectLayer);
    expect(validateStoryStudioProjectPayload(validPayload)).toEqual(validPayload);

    frames[0] = {
      ...frames[0],
      subjectLayer: { ...frames[0].subjectLayer!, url: "https://example.com/player.png" },
    };
    expect(() => validateStoryStudioProjectPayload({ ...validPayload, frames })).toThrow(/subjects/);
  });

  it("rejects incomplete or external Brand Kit snapshots", () => {
    expect(() => validateStoryStudioProjectPayload({
      ...validPayload,
      brandKitId: "22222222-2222-4222-8222-222222222222",
    })).toThrow(/champs inattendus/);
    expect(() => validateStoryStudioProjectPayload({
      ...validPayload,
      brandKitId: "22222222-2222-4222-8222-222222222222",
      brandKitSnapshot: { ...brandKitSnapshot, lightLogoUrl: "https://example.com/logo.png" },
    })).toThrow(/Blob Vercel Story Studio/);
    expect(() => validateStoryStudioProjectPayload({
      ...validPayload,
      brandKitId: "22222222-2222-4222-8222-222222222222",
      brandKitSnapshot: {
        ...brandKitSnapshot,
        lightLogoUrl: "https://studio.public.blob.vercel-storage.com/story-studio/other/logo.png",
      },
    })).toThrow(/Blob Vercel Story Studio/);
  });

  it("rejects an incomplete frame set", () => {
    expect(() => validateStoryStudioProjectPayload({ ...validPayload, frames: validPayload.frames.slice(0, 3) }))
      .toThrowError(StoryStudioValidationError);
  });

  it("rejects a role that does not match the fixed V1 sequence", () => {
    const frames = [...validPayload.frames];
    frames[2] = { ...frames[2], role: "question" };
    expect(() => validateStoryStudioProjectPayload({ ...validPayload, frames }))
      .toThrow("frames[2].role doit valoir poll.");
  });
});