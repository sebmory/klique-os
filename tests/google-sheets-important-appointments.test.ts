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
const WEEKLY_RESPONSES_RANGE = "'Forms_Hebdo_Responses'!A1:Z500";
const MONTHLY_RESPONSES_RANGE = "'Forms_Mensuel_Responses'!A1:Z500";

const createAthletesSheet = (rows: string[][]) => ({
  data: {
    values: [
      ["Nom", "Sport", "Club", "Instagram", "Telephone", "Email", "Statut"],
      ...rows,
    ],
  },
});

describe("getAthletesFromGoogleSheets important weekly appointments", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";

    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return createAthletesSheet([
          ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif"],
        ]);
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [],
          },
        };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [],
          },
        };
      }

      throw new Error(`Unexpected range: ${range}`);
    });
  });

  it("captures a meaningful appointment from the weekly response", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return createAthletesSheet([
          ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif"],
        ]);
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom et prénom", "As-tu des rendez-vous importants cette semaine ? Si oui, lesquels ? (match, compétition, ...)"],
              ["2026-08-01 09:00:00", "alpha@example.com", "Alpha Martin", "Match à 18h samedi"],
            ],
          },
        };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      throw new Error(`Unexpected range: ${range}`);
    });

    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes[0]?.importantRendezVousThisWeek).toBe("Match à 18h samedi");
  });

  it("ignores empty and negative weekly appointment responses", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return createAthletesSheet([
          ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif"],
        ]);
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom et prénom", "As-tu des rendez-vous importants cette semaine ? Si oui, lesquels ? (match, compétition, ...)"],
              ["2026-08-01 09:00:00", "alpha@example.com", "Alpha Martin", ""],
              ["2026-08-08 09:00:00", "alpha@example.com", "Alpha Martin", "Non"],
            ],
          },
        };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      throw new Error(`Unexpected range: ${range}`);
    });

    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes[0]?.importantRendezVousThisWeek).toBe("");
  });

  it("keeps the latest appointment when the same athlete has multiple weekly responses", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return createAthletesSheet([
          ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif"],
        ]);
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom et prénom", "As-tu des rendez-vous importants cette semaine ? Si oui, lesquels ? (match, compétition, ...)"],
              ["2026-08-01 09:00:00", "alpha@example.com", "Alpha Martin", "Match de préparation"],
              ["2026-08-08 09:00:00", "alpha@example.com", "Alpha Martin", "Compétition nationale"],
            ],
          },
        };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      throw new Error(`Unexpected range: ${range}`);
    });

    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes[0]?.importantRendezVousThisWeek).toBe("Compétition nationale");
    expect(athletes[0]?.lastResponseWeekly).toBe("2026-08-08 09:00:00");
  });
});
