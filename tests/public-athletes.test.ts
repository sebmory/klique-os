import { describe, expect, it, vi } from "vitest";
import {
  buildPublicAthleteDirectory,
  selectFeaturedPublicAthletes,
  slugifyPublicAthleteName,
  type PublicAthleteCard,
} from "@/lib/public-athletes";
import { getPublicAthleteBySlug } from "@/lib/public-athletes-server";
import type { PublicAthleteDirectoryEntry } from "@/types/athlete";

const directoryEntry = (
  athleteId: string,
  name: string,
  sport = "Football",
  overrides: Partial<PublicAthleteDirectoryEntry> = {},
): PublicAthleteDirectoryEntry => ({
  athleteId,
  name,
  sport,
  club: "Club public",
  city: "",
  country: "",
  portraitUrl: `https://images.example/${athleteId}.jpg`,
  presentation: `Bio publique de ${name}`,
  ...overrides,
});

describe("public athlete publication rules", () => {
  it("creates stable accents-safe slugs and filters test or incomplete profiles", () => {
    const result = buildPublicAthleteDirectory([
      directoryEntry("athlete-2", "Élodie D’Arc"),
      directoryEntry("athlete-1", "Élodie D’Arc"),
      directoryEntry("seb-mory", "Profil test"),
      directoryEntry("athlete-3", "Sans portrait", "Judo", { portraitUrl: "" }),
      directoryEntry("athlete-4", "Sans bio", "Tennis", { presentation: "" }),
      directoryEntry("athlete-5", "Sans club", "Basketball", { club: "" }),
    ]);

    expect(slugifyPublicAthleteName(" Élodie D’Arc ")).toBe("elodie-d-arc");
    expect(result.map(({ slug }) => slug)).toEqual([
      "elodie-d-arc",
      "elodie-d-arc-2",
      "sans-bio",
      "sans-portrait",
    ]);
    expect(result.find(({ slug }) => slug === "sans-portrait")).not.toHaveProperty("portrait");
    expect(result.every((athlete) => !("athleteId" in athlete))).toBe(true);
  });

  it("uses only sport and club for a missing public biography and tolerates no editorial projection", async () => {
    const athlete = await getPublicAthleteBySlug("noa-roy", {
      listDirectory: vi.fn(async () => [
        directoryEntry("noa", "Noa Roy", "Judo", { portraitUrl: "", presentation: "" }),
      ]),
      getProfile: vi.fn(async () => ({
        name: "Noa Roy",
        sport: "Judo",
        club: "Club public",
        city: "",
        country: "",
        portraitUrl: "",
        presentation: "",
        journey: "",
        goals: "",
        socialLinks: [],
      })),
      getEditorialProjection: vi.fn(async () => null),
    });

    expect(athlete).toEqual({
      slug: "noa-roy",
      name: "Noa Roy",
      sport: "Judo",
      club: "Club public",
      colorCategory: "combat",
      publicBio: "Athlète de Judo au sein de Club public.",
    });
  });

  it("selects featured athletes by deterministic sport round-robin, not CRM order", () => {
    const athletes: PublicAthleteCard[] = [
      ...buildPublicAthleteDirectory([
        directoryEntry("a1", "Football A", "Football"),
        directoryEntry("a2", "Football B", "Football"),
        directoryEntry("b1", "Judo A", "Judo"),
        directoryEntry("c1", "Tennis A", "Tennis"),
        directoryEntry("b2", "Judo B", "Judo"),
      ]),
    ];
    const forward = selectFeaturedPublicAthletes(athletes, 5);
    const reverse = selectFeaturedPublicAthletes([...athletes].reverse(), 5);

    expect(reverse.map(({ slug }) => slug)).toEqual(forward.map(({ slug }) => slug));
    expect(new Set(forward.slice(0, 3).map(({ sport }) => sport)).size).toBe(3);
  });

  it("whitelists only explicit public fields and never serializes private or Sports Watch data", async () => {
    const listDirectory = vi.fn(async () => [
      directoryEntry("private-id", "Mila Martin", "Football", {
        portraitUrl: "https://images.example/mila.jpg",
      }),
    ]);
    const getProfile = vi.fn(async () => ({
      name: "Mila Martin",
      sport: "Football",
      club: "Club public",
      city: "",
      country: "",
      portraitUrl: "https://images.example/mila.jpg",
      presentation: "Bio publique",
      journey: "Parcours public",
      goals: "Sélection nationale",
      socialLinks: [{ label: "Instagram", url: "@private" }],
      email: "private@example.test",
      weeklyFormResponse: { status: "pending", comments: "médical" },
    }));
    const getEditorialProjection = vi.fn(async () => ({
      id: "private-id",
      displayName: "Mila Martin",
      sport: "Football",
      club: "Club public",
      position: "Attaquante",
      biography: "Bio publique",
      palmares: "Coupe régionale",
      communicationObjectives: ["Raconter la saison"],
      publishedFacts: ["12 buts validés"],
      pendingFact: "candidat Sports Watch",
    }));

    const athlete = await getPublicAthleteBySlug("mila-martin", {
      listDirectory,
      getProfile,
      getEditorialProjection,
    });
    const serialized = JSON.stringify(athlete);

    expect(athlete).toEqual({
      slug: "mila-martin",
      name: "Mila Martin",
      sport: "Football",
      club: "Club public",
      portrait: "https://images.example/mila.jpg",
      colorCategory: "field",
      position: "Attaquante",
      publicBio: "Bio publique de Mila Martin",
      journey: "Parcours public",
      goals: ["Sélection nationale", "Raconter la saison"],
      publishedAchievements: ["Coupe régionale"],
      publishedFacts: ["12 buts validés"],
    });
    for (const forbidden of [
      "private-id",
      "private@example.test",
      "@private",
      "pending",
      "médical",
      "candidat Sports Watch",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("returns null without profile reads for unknown, malformed, hidden or incomplete slugs", async () => {
    const sources = {
      listDirectory: vi.fn(async () => [
        directoryEntry("seb-mory", "Profil test"),
        directoryEntry("incomplete", "Profil incomplet", "Judo", { club: "" }),
      ]),
      getProfile: vi.fn(),
      getEditorialProjection: vi.fn(),
    };

    await expect(getPublicAthleteBySlug("profil-test", sources)).resolves.toBeNull();
    await expect(getPublicAthleteBySlug("Profil-incomplet", sources)).resolves.toBeNull();
    expect(sources.getProfile).not.toHaveBeenCalled();
    expect(sources.getEditorialProjection).not.toHaveBeenCalled();
  });
});
