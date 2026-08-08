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
        values: {
          get: valuesGetMock,
        },
      },
    })),
  },
}));

import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";

const ATHLETES_RANGE = "'02_Athlètes'!A3:AC200";
const FORMS_RANGE = "'Forms_Adhesion'!A1:Z500";

describe("getAthletesFromGoogleSheets ghost date cleanup", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";

    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return {
          data: {
            values: [
              [
                "Nom",
                "Sport",
                "Club",
                "Instagram",
                "Telephone",
                "Email",
                "Statut",
                "Prochain contact",
                "Notes",
                "Palmarès",
                "Objectif court",
                "Objectif long",
                "Domaines souhaités",
                "Dernier contact",
                "Prochaine action",
                "Notes de suivi",
                "Derniere réponse mensuelle",
                "Derniere réponse hebdo",
                "Dernière publication",
                "Titres Athlète du mois",
                "Éléments à analyser",
                "Contenus planifiés",
                "Dernier post",
                "Dernière story",
                "Jours sans visibilité",
                "Dernier shooting",
                "Medias",
                "Premium",
                "Couverture",
              ],
              [
                "Alpha Martin",
                "Tennis",
                "Club A",
                "@alpha",
                "111",
                "alpha@example.com",
                "Actif",
                "30.12.1899",
                "",
                "",
                "",
                "",
                "",
                "1899-12-30",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
              ],
            ],
          },
        };
      }

      if (range === FORMS_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email"],
              ["30.12.1899", "alpha@example.com"],
            ],
          },
        };
      }

      throw new Error(`Unexpected range: ${range}`);
    });
  });

  it("maps empty and ghost date values to absence", async () => {
    const athletes = await getAthletesFromGoogleSheets();
    expect(athletes).toHaveLength(1);

    const athlete = athletes[0];
    expect(athlete.nextContact).toBe("");
    expect(athlete.lastContact).toBe("");
    expect(athlete.adhesionDate).toBe("");
  });
});
