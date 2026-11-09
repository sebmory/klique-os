import { describe, expect, it } from "vitest";
import {
  getCreativeProfileChecklist,
  isCreativeProfileComplete,
  mergeCreativeOnboardingProfile,
  type CreativeOnboardingProfile,
} from "@/lib/creatives/onboarding";

const profile = (overrides: Partial<CreativeOnboardingProfile> = {}): CreativeOnboardingProfile => ({
  displayName: "Camille Exemple",
  creativeType: "both",
  portfolioUrl: "https://portfolio.example",
  coverageAreas: ["Vaud"],
  specialties: ["Football"],
  bio: "Photographe et vidéaste sportive.",
  generalAvailability: "Soirs et week-ends.",
  onboardingStatus: "profile_incomplete",
  onboardingMessage: null,
  ...overrides,
});

describe("creative onboarding", () => {
  it("requires every advertised profile field before Admin validation", () => {
    expect(getCreativeProfileChecklist(profile())).toEqual({
      displayName: true,
      creativeType: true,
      coverageAreas: true,
      specialties: true,
      portfolioUrl: true,
      bio: true,
      generalAvailability: true,
    });
    expect(isCreativeProfileComplete(profile())).toBe(true);
    expect(isCreativeProfileComplete(profile({ specialties: [] }))).toBe(false);
  });

  it("requires an HTTPS portfolio", () => {
    expect(getCreativeProfileChecklist(profile({
      portfolioUrl: "http://portfolio.example",
    })).portfolioUrl).toBe(false);
    expect(getCreativeProfileChecklist(profile({
      portfolioUrl: "not-a-url",
    })).portfolioUrl).toBe(false);
  });

  it("prefills the Forms profile and updates only fields explicitly changed", () => {
    const current = profile({
      onboardingStatus: "account_created",
      generalAvailability: null,
    });
    const merged = mergeCreativeOnboardingProfile(current, {
      generalAvailability: "Le week-end.",
    });

    expect(merged).toEqual({
      ...current,
      generalAvailability: "Le week-end.",
    });
    expect(isCreativeProfileComplete(merged)).toBe(true);
  });

  it("never erases known values with empty invitation or profile fields", () => {
    const current = profile();
    expect(mergeCreativeOnboardingProfile(current, {
      displayName: " ",
      portfolioUrl: "",
      coverageAreas: [],
      specialties: [" "],
      bio: null,
      generalAvailability: "",
    })).toEqual(current);
  });
});
