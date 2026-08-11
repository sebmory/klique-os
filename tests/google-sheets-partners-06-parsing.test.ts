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
const LEGACY_PARTNERS_RANGE = "'06_Partenaires'!A1:AZ300";
const FORMS_PARTNERS_RANGE = "'Forms_Partenaires_Responses'!A1:N500";

describe("getPartnersFromGoogleSheets 06_Partenaires parsing", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";

    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === PARTNERS_RANGE) {
        return { data: { values: [] } };
      }

      if (range === LEGACY_PARTNERS_RANGE) {
        return {
          data: {
            values: [
              ["Nom", "Type de relation", "Catégorie", "Contact principal", "Fonction", "E-mail", "Téléphone", "Site", "Offre / avantage membres", "Athlètes concernés", "Statut"],
              ["Klyo Massage", "Partenaire", "Bien-être", "Mila Benjak", "Fondatrice", "klyomassage@gmail.com", "+41 79 111 11 11", "klyo-massage.ch", "Massage sportif", "", "Actif"],
              ["Avec Rachel", "Partenaire", "Bien-être", "Rachel Meconi", "Coach", "contact@avec-rachel.com", "+41 79 412 12 15", "avec-rachel.com", "Préparation mentale", "", "Actif"],
            ],
          },
        };
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return { data: { values: [] } };
      }

      return { data: { values: [] } };
    });
  });

  it("maps phone and site from the exact 06 columns", async () => {
    const partners = await getPartnersFromGoogleSheets();

    const klyo = partners.find((partner) => partner.name === "Klyo Massage");
    const avecRachel = partners.find((partner) => partner.name === "Avec Rachel");

    expect(klyo).toMatchObject({
      email: "klyomassage@gmail.com",
      phone: "+41 79 111 11 11",
      website: "klyo-massage.ch",
    });

    expect(avecRachel).toMatchObject({
      email: "contact@avec-rachel.com",
      phone: "+41 79 412 12 15",
      website: "avec-rachel.com",
    });
  });
});
