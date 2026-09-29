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