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
const FORMS_ADHESION_RANGE = "'Forms_Adhesion_Responses'!A1:Z500";
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

describe("getAthletesFromGoogleSheets adhesion imports", () => {
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

      if (range === FORMS_ADHESION_RANGE) {
        return {
          data: {
            values: [["Horodateur", "Email", "Nom complet", "Prénom et nom"]],
          },
        };
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      throw new Error(`Unexpected range: ${range}`);
    });
  });

  it("adds a new adhesion that is absent from the CRM athletes sheet", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return createAthletesSheet([
          ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif"],
        ]);
      }

      if (range === FORMS_ADHESION_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom complet"],
              ["2026-08-01 10:00:00", "new@example.com", "Nina Laurent"],
            ],
          },
        };
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      throw new Error(`Unexpected range: ${range}`);
    });

    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes.some((athlete) => athlete.email === "new@example.com")).toBe(true);
    expect(athletes.some((athlete) => athlete.name === "Nina Laurent")).toBe(true);
  });

  it("does not create a duplicate when the adhesion matches an existing athlete by email", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return createAthletesSheet([
          ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif"],
        ]);
      }

      if (range === FORMS_ADHESION_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom complet"],
              ["2026-08-01 10:00:00", "alpha@example.com", "Alpha Martin"],
            ],
          },
        };
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      throw new Error(`Unexpected range: ${range}`);
    });

    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes.filter((athlete) => athlete.email === "alpha@example.com")).toHaveLength(1);
  });

  it("does not create a duplicate when the adhesion matches an existing athlete by normalized name", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return createAthletesSheet([
          ["Mila Benjak", "Tennis", "Club A", "@mila", "111", "", "Actif"],
        ]);
      }

      if (range === FORMS_ADHESION_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom complet"],
              ["2026-08-01 10:00:00", "", "Benjak Mila"],
            ],
          },
        };
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      throw new Error(`Unexpected range: ${range}`);
    });

    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes.filter((athlete) => athlete.name === "Mila Benjak")).toHaveLength(1);
  });

  it("ignores an incomplete adhesion row without name or email", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return createAthletesSheet([
          ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif"],
        ]);
      }

      if (range === FORMS_ADHESION_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom complet"],
              ["2026-08-01 10:00:00", "", ""],
            ],
          },
        };
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return { data: { values: [] } };
      }

      throw new Error(`Unexpected range: ${range}`);
    });

    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes).toHaveLength(1);
    expect(athletes[0]?.name).toBe("Alpha Martin");
  });
});
