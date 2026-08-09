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
const FORMS_RANGE = "'Forms_Adhesion_Responses'!A1:Z500";
const WEEKLY_RESPONSES_RANGE = "'Forms_Hebdo_Responses'!A1:Z500";

describe("getAthletesFromGoogleSheets row mapping", () => {
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
              ],
              [
                "Refuse Athlete",
                "Tennis",
                "Club B",
                "@refuse",
                "222",
                "refuse@example.com",
                "Refusé",
              ],
              [
                "Beta Dupont",
                "Natation",
                "Club C",
                "@beta",
                "333",
                "beta@example.com",
                "Actif",
              ],
            ],
          },
        };
      }

      if (range === FORMS_RANGE) {
        return {
          data: {
            values: [["Horodateur", "Email"]],
          },
        };
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [],
          },
        };
      }

      throw new Error(`Unexpected range: ${range}`);
    });
  });

  it("keeps absolute sheet row indexes when a refused row is filtered out", async () => {
    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes).toHaveLength(2);
    expect(athletes.map((item) => item.name)).toEqual(["Alpha Martin", "Beta Dupont"]);
    expect(athletes.map((item) => item.row)).toEqual([4, 6]);
  });
});
