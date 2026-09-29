import { describe, expect, it } from "vitest";
import {
  StoryStudioFrameModelValidationError,
  validateStoryStudioFrameModelInput,
} from "@/lib/story-studio/frame-model-validation";

const content = {
  schemaVersion: 1,
  canvasFormat: "1080x1350",
  templateKey: "editorial_klique",
  brandKitId: null,
  brandKitSnapshot: null,
  frame: {
    text: { eyebrow: "Finale", headline: "Victoire", body: "Texte", interaction: "" },
    elements: {
      athleteName: true,
      score: true,
      competition: true,
      logo: true,
      signature: false,
      interactionZone: false,
    },
    textLayout: {
      eyebrow: { x: 72, y: 90 },
      headline: { x: 72, y: 180 },
      body: { x: 72, y: 360 },
    },
    logoLayout: { x: 800, y: 80, scale: 1.25 },
  },
} as const;

describe("Story Studio frame model validation", () => {
  it("accepts a strict 1080x1350 reusable composition", () => {
    expect(validateStoryStudioFrameModelInput({ name: "Résultat premium", content })).toEqual({
      name: "Résultat premium",
      content,
    });
  });

  it("rejects photo and match data from the reusable frame", () => {
    expect(() => validateStoryStudioFrameModelInput({
      name: "Interdit",
      content: { ...content, frame: { ...content.frame, photo: { assetId: "photo-1" } } },
    })).toThrow(StoryStudioFrameModelValidationError);
    expect(() => validateStoryStudioFrameModelInput({
      name: "Interdit",
      content: { ...content, frame: { ...content.frame, matchCard: {} } },
    })).toThrow(StoryStudioFrameModelValidationError);
  });

  it("rejects other formats and malformed Brand Kit snapshots", () => {
    expect(() => validateStoryStudioFrameModelInput({
      name: "Story",
      content: { ...content, canvasFormat: "1080x1920" },
    })).toThrow("format 1080x1350");
    expect(() => validateStoryStudioFrameModelInput({
      name: "Snapshot invalide",
      content: { ...content, brandKitId: "not-a-uuid", brandKitSnapshot: {} },
    })).toThrow(StoryStudioFrameModelValidationError);
  });
});