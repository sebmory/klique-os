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

import { getAthleteEcosystemPartnersFromGoogleSheets } from "@/lib/google-sheets";

describe("getAthleteEcosystemPartnersFromGoogleSheets", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";

    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === "'06_Partenaires'!A4:K200") {
        return {
          data: {
            values: [
              [
                "Klyo Massage",
                "Partenaire",
                "Bien-etre",
                "Mila Benjak",
                "Fondatrice",
                "contact@klyo-massage.ch",
                "+41 79 111 11 11",
                "klyo-massage.ch",
                "Massage sportif et récupération pour athlètes.",
                "Athlètes KLIQUE",
                "Actif",
              ],
              [
                "Avec Rachel",
                "Partenaire",
                "Coaching",
                "Rachel Meconi",
                "Coach",
                "contact@avec-rachel.com",
                "+41 79 412 12 15",
                "avec-rachel.com",
                "Coach en préparation mentale pour sportifs.",
                "Athlètes KLIQUE",
                "Actif",
              ],
            ],
          },
        };
      }

      return { data: { values: [] } };
    });
  });

  it("reads only the partner form sheet and maps partner cards from it", async () => {
    const partners = await getAthleteEcosystemPartnersFromGoogleSheets();

    expect(valuesGetMock).toHaveBeenCalledTimes(1);
    expect(valuesGetMock).toHaveBeenCalledWith(
      expect.objectContaining({ range: "'06_Partenaires'!A4:K200" })
    );

    expect(partners).toHaveLength(2);
    expect(partners.some((partner) => partner.name === "Klyo Massage")).toBe(true);
    expect(partners.some((partner) => partner.name === "Avec Rachel")).toBe(true);

    const klyo = partners.find((partner) => partner.name === "Klyo Massage");
    expect(klyo).toMatchObject({
      category: "Bien-etre",
      contactName: "Mila Benjak",
      contact: "Mila Benjak",
      contactRole: "Fondatrice",
      email: "contact@klyo-massage.ch",
      phone: "+41 79 111 11 11",
      website: "klyo-massage.ch",
      memberOffer: "Massage sportif et récupération pour athlètes.",
      benefits: "Massage sportif et récupération pour athlètes.",
      status: "Actif",
    });

    const avecRachel = partners.find((partner) => partner.name === "Avec Rachel");
    expect(avecRachel).toMatchObject({
      category: "Coaching",
      contactName: "Rachel Meconi",
      contact: "Rachel Meconi",
      contactRole: "Coach",
      email: "contact@avec-rachel.com",
      phone: "+41 79 412 12 15",
      website: "avec-rachel.com",
      memberOffer: "Coach en préparation mentale pour sportifs.",
      benefits: "Coach en préparation mentale pour sportifs.",
      status: "Actif",
      type: "Partenaire",
    });
  });
});
