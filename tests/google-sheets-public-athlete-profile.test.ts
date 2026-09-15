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

const ATHLETES_RANGE = "'02_Athlètes'!A3:AI200";
const FORMS_RANGE = "'Forms_Adhesion_Responses'!A1:Z500";

const mockSheets = (athleteRows: unknown[][], formRows: unknown[][]) => {
  valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
    if (range === ATHLETES_RANGE) return { data: { values: athleteRows } };
    if (range === FORMS_RANGE) return { data: { values: formRows } };
    throw new Error(`Unexpected range: ${range}`);
  });
};

describe("getPublicAthleteProfileFromGoogleSheets", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";
  });

  it("enriches the public profile by normalized email without exposing sensitive fields", async () => {
    mockSheets(
      [
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
            "Email",
            "Téléphone",
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
            " MILA@EXAMPLE.COM ",
            "+41 79 000 00 00",
            "2000-01-01",
            "Attaquante",
            "Palmarès interne",
          ],
      ],
      [
        [
          "Horodateur",
          "Email",
          "Nom complet",
          "Sport pratiqué",
          "Club actuel",
          "Compte Instagram",
          "Palmarès",
          "Objectifs à court terme",
          "Objectifs à long terme",
          "Date de naissance",
          "Nationalité",
          "Spécialité",
          "Taille / poids",
          "Fichiers",
          "Préférences internes",
          "Téléphone",
        ],
        ["2026-01-01", "other@example.com", "Nom interne", "Mauvais sport", "Mauvais club", "@wrong", "Mauvais palmarès"],
        [
          "2026-02-01",
          " mila@example.com ",
          "Autre identité",
          "Football féminin",
          "Club formulaire",
          "@mila.form",
          "Championne régionale",
          "Intégrer la sélection",
          "Passer professionnelle",
          "2000-01-01",
          "Suisse",
          "Attaquante",
          "170 cm / 60 kg",
          "drive.example/file",
          "Contact le matin",
          "+41 79 111 11 11",
        ],
      ],
    );

    const profile = await getPublicAthleteProfileFromGoogleSheets("athlete-1");

    expect(profile).toMatchObject({
      name: "Mila Martin",
      sport: "Football",
      club: "FC Lausanne",
      age: new Date().getUTCFullYear() - 2000,
      nationality: "Suisse",
      position: "Attaquante",
      palmares: "Championne régionale",
      shortTermGoals: "Intégrer la sélection",
      longTermGoals: "Passer professionnelle",
      city: "Lausanne",
      country: "Suisse",
      presentation: "Présentation publique",
      journey: "Parcours public",
      goals: "Objectifs publics",
      socialLinks: [{ label: "Instagram", url: "@mila.public" }],
    });
    expect(profile).not.toHaveProperty("email");
    expect(profile).not.toHaveProperty("phone");
    expect(profile).not.toHaveProperty("birthDate");
    expect(profile).not.toHaveProperty("heightWeight");
    expect(profile).not.toHaveProperty("files");
    expect(profile).not.toHaveProperty("timestamp");
    expect(profile).not.toHaveProperty("preferences");
    expect(profile?.socialLinks).not.toContainEqual(expect.objectContaining({ url: "@mila.private" }));
    expect(profile?.socialLinks).not.toContainEqual(expect.objectContaining({ url: "@mila.form" }));
  });

  it("falls back to normalized name and omits absent enrichment", async () => {
    mockSheets(
      [
        ["Nom", "Sport", "Club", "Instagram", "Téléphone", "Email", "Statut", "Nom public", "Instagram public", "Athlete ID"],
        ["Élodie Dupont", "", "", "", "", "", "Actif", "Élodie Dupont", "", "athlete-2"],
      ],
      [
        ["Horodateur", "Email", "Nom complet", "Sport", "Club", "Instagram", "Date de naissance", "Nationalité", "Position"],
        ["2026-03-01", "", " elodie dupont ", "Judo", "Judo Club", "@elodie", "date invalide", "France", ""],
      ],
    );

    const profile = await getPublicAthleteProfileFromGoogleSheets("athlete-2");

    expect(profile).toMatchObject({
      sport: "Judo",
      club: "Judo Club",
      nationality: "France",
      socialLinks: [{ label: "Instagram", url: "@elodie" }],
    });
    expect(profile).not.toHaveProperty("age");
    expect(profile).not.toHaveProperty("position");
    expect(profile).not.toHaveProperty("palmares");
    expect(profile).not.toHaveProperty("shortTermGoals");
    expect(profile).not.toHaveProperty("longTermGoals");
  });
});