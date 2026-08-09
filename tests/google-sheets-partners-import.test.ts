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

import { getPartnersFromGoogleSheets } from "@/lib/google-sheets";

const PARTNERS_RANGE = "'20_Partenaires'!A1:AZ300";
const FORMS_PARTNERS_RANGE = "'Forms_Partenaires_Responses'!A1:Z500";

const createPartnersSheet = (rows: string[][]) => ({
  data: {
    values: [
      ["Nom", "Type", "Catégorie", "Contact principal", "Email", "Téléphone", "Statut"],
      ...rows,
    ],
  },
});

describe("getPartnersFromGoogleSheets partner form imports", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";

    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === PARTNERS_RANGE) {
        return createPartnersSheet([
          ["Studio Alpha", "Partenaire", "Media", "Mila Benjak", "alpha@example.com", "010101", "Actif"],
        ]);
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return { data: { values: [] } };
      }

      return { data: { values: [] } };
    });
  });

  it("adds a new partner that is absent from the CRM partners sheet", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === PARTNERS_RANGE) {
        return createPartnersSheet([
          ["Studio Alpha", "Partenaire", "Media", "Mila Benjak", "alpha@example.com", "010101", "Actif"],
        ]);
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom de la structure", "Nom du contact", "Type"],
              ["2026-08-01 10:00:00", "new@example.com", "Studio Nouveau", "Nina Laurent", "Expert"],
            ],
          },
        };
      }

      return { data: { values: [] } };
    });

    const partners = await getPartnersFromGoogleSheets();

    expect(partners.some((partner) => partner.email === "new@example.com")).toBe(true);
    expect(partners.some((partner) => partner.name === "Studio Nouveau")).toBe(true);
    expect(partners.some((partner) => partner.expertKlique)).toBe(true);
  });

  it("does not create a duplicate when the partner already exists by email", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === PARTNERS_RANGE) {
        return createPartnersSheet([
          ["Studio Alpha", "Partenaire", "Media", "Mila Benjak", "alpha@example.com", "010101", "Actif"],
        ]);
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom de la structure", "Nom du contact", "Type"],
              ["2026-08-01 10:00:00", "alpha@example.com", "Studio Alpha", "Mila Benjak", "Partenaire"],
            ],
          },
        };
      }

      return { data: { values: [] } };
    });

    const partners = await getPartnersFromGoogleSheets();

    expect(partners.filter((partner) => partner.email === "alpha@example.com")).toHaveLength(1);
  });

  it("does not create a duplicate when the partner already exists by structure and contact", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === PARTNERS_RANGE) {
        return createPartnersSheet([
          ["Studio Alpha", "Partenaire", "Media", "Mila Benjak", "", "010101", "Actif"],
        ]);
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom de la structure", "Nom du contact", "Type"],
              ["2026-08-01 10:00:00", "", "Studio Alpha", "Mila Benjak", "Partenaire"],
            ],
          },
        };
      }

      return { data: { values: [] } };
    });

    const partners = await getPartnersFromGoogleSheets();

    expect(partners.filter((partner) => partner.name === "Studio Alpha")).toHaveLength(1);
  });

  it("ignores an incomplete partner row without name or email", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === PARTNERS_RANGE) {
        return createPartnersSheet([
          ["Studio Alpha", "Partenaire", "Media", "Mila Benjak", "alpha@example.com", "010101", "Actif"],
        ]);
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom de la structure", "Nom du contact", "Type"],
              ["2026-08-01 10:00:00", "", "", "", "Partenaire"],
            ],
          },
        };
      }

      return { data: { values: [] } };
    });

    const partners = await getPartnersFromGoogleSheets();

    expect(partners.filter((partner) => partner.name === "Studio Alpha")).toHaveLength(1);
  });
});
