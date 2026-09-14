import { beforeEach, describe, expect, it, vi } from "vitest";

const valuesGetMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(function GoogleAuth() {
        return {};
      }),
    },
    sheets: vi.fn(() => ({
      spreadsheets: {
        values: { get: valuesGetMock },
      },
    })),
  },
}));

import { getPublicAthleteProfileFromGoogleSheets } from "@/lib/google-sheets";

describe("getPublicAthleteProfileFromGoogleSheets", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";
  });

  it("maps public location and socials without exposing internal athlete fields", async () => {
    valuesGetMock.mockResolvedValue({
      data: {
        values: [
          [
            "Athlete ID",
            "Nom",
            "Sport",
            "Club",
            "Statut",
            "Nom public",
            "Ville publique",
            "Pays public",
            "Présentation publique",
            "Parcours sportif public",
            "Objectifs sportifs publics",
            "Instagram public",
            "Instagram",
            "Date de naissance",
            "Position",
            "Palmarès",
          ],
          [
            "athlete-1",
            "Nom interne",
            "Football",
            "FC Lausanne",
            "Actif",
            "Mila Martin",
            "Lausanne",
            "Suisse",
            "Présentation publique",
            "Parcours public",
            "Objectifs publics",
            "@mila.public",
            "@mila.private",
            "2000-01-01",
            "Attaquante",
            "Palmarès interne",
          ],
        ],
      },
    });

    const profile = await getPublicAthleteProfileFromGoogleSheets("athlete-1");

    expect(profile).toMatchObject({
      name: "Mila Martin",
      sport: "Football",
      club: "FC Lausanne",
      city: "Lausanne",
      country: "Suisse",
      presentation: "Présentation publique",
      journey: "Parcours public",
      goals: "Objectifs publics",
      socialLinks: [{ label: "Instagram", url: "@mila.public" }],
    });
    expect(profile).not.toHaveProperty("birthDate");
    expect(profile).not.toHaveProperty("position");
    expect(profile).not.toHaveProperty("palmares");
    expect(profile?.socialLinks).not.toContainEqual(expect.objectContaining({ url: "@mila.private" }));
  });
});