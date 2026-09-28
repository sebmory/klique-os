import { describe, expect, it } from "vitest";
import {
  validateStoryStudioBrandKitInput,
  validateStoryStudioBrandKitUpdate,
} from "@/lib/story-studio/brand-kit-validation";

const validInput = {
  name: " Club Nord ",
  primaryColor: "#aabbcc",
  secondaryColor: "#FFFFFF",
  accentColor: "#F2B800",
  textColor: "#101010",
  mutedTextColor: "#999999",
  lightLogoPhotoId: "11111111-1111-4111-8111-111111111111",
  darkLogoPhotoId: null,
  fontFamily: "Georgia",
  signatureMode: "discreet",
};

describe("Story Studio Brand Kit validation", () => {
  it("normalizes a complete valid kit", () => {
    expect(validateStoryStudioBrandKitInput(validInput)).toEqual({
      ...validInput,
      name: "Club Nord",
      primaryColor: "#AABBCC",
    });
  });

  it.each([
    [{ ...validInput, accentColor: "yellow" }],
    [{ ...validInput, lightLogoPhotoId: "https://example.com/logo.png" }],
    [{ ...validInput, fontFamily: "Comic Sans MS" }],
    [{ ...validInput, signatureMode: "large" }],
    [{ ...validInput, unknown: true }],
  ])("rejects invalid colors, assets, fonts, signatures and unknown fields", (input) => {
    expect(() => validateStoryStudioBrandKitInput(input)).toThrow();
  });

  it("accepts strict partial updates and rejects empty updates", () => {
    expect(validateStoryStudioBrandKitUpdate({ accentColor: "#abcdef", lightLogoPhotoId: null })).toEqual({
      accentColor: "#ABCDEF",
      lightLogoPhotoId: null,
    });
    expect(() => validateStoryStudioBrandKitUpdate({})).toThrow(/Au moins un champ/);
  });
});