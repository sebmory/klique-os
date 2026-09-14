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

const PARTNERS_RANGE = "'06_Partenaires'!A1:AZ300";
const FORMS_PARTNERS_RANGE = "'Forms_Partenaires_Responses'!A1:Z500";

const createPartnerRow = ({
  name,
  type,
  category,
  contact,
  email,
  phone,
  status,
}: {
  name: string;
  type: string;
  category: string;
  contact: string;
  email: string;
  phone: string;
  status: string;
}) => {
  const row = Array.from({ length: 25 }, () => "");
  row[0] = name;
  row[1] = type;
  row[2] = category;
  row[3] = contact;
  row[5] = email;
  row[6] = phone;
  row[10] = status;
  return row;
};

const createPartnersSheet = (rows: string[][]) => ({
  data: {
    values: [
      ["Nom", "Type de relation", "Catégorie", "Contact principal", "Fonction", "E-mail", "Téléphone", "Site", "Description", "Athlètes concernés", "Statut", "", "", "", "", "", "", "", "", "Offre / avantage membres", "", "", "", "", "Date arrivée KLIQUE"],
      ...rows,
    ],
  },
});

const partnerFormHeaders = [
  "Nom de l'entreprise",
  "Personne de contact",
  "E-mail de contact",
  "Téléphone",
  "Site internet",
  "Instagram",
  "Présentez votre activité en quelques mots / lignes",
  "Quels avantages souhaiteriez-vous proposer aux membres Klique (la liste est évolutive) ?",
  "Merci de préciser les détails des avantages sélectionnés (% de réduction, nature de l'offre / cadeau /produits à tester / etc.)",
  "Quels types de collaborations vous intéressent pour votre entreprise (la liste est évolutive) ?",
  "Communication - Acceptez-vous que Klique utilise votre logo et vos visuels pour présenter le partenariat ?",
  "Logo - Disposez-vous d'un logo HD pour la communication de Klique ?",
];

const createPartnerFormRow = (name: string, contact: string, email: string) => [
  name,
  contact,
  email,
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
];

describe("getPartnersFromGoogleSheets partner form imports", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";

    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === PARTNERS_RANGE) {
        return createPartnersSheet([
          createPartnerRow({ name: "Studio Alpha", type: "Partenaire", category: "Media", contact: "Mila Benjak", email: "alpha@example.com", phone: "010101", status: "Actif" }),
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
          createPartnerRow({ name: "Studio Alpha", type: "Expert Klique", category: "Media", contact: "Mila Benjak", email: "alpha@example.com", phone: "010101", status: "Actif" }),
        ]);
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return {
          data: {
            values: [
              partnerFormHeaders,
              createPartnerFormRow("Studio Nouveau", "Nina Laurent", "new@example.com"),
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
          createPartnerRow({ name: "Studio Alpha", type: "Partenaire", category: "Media", contact: "Mila Benjak", email: "alpha@example.com", phone: "010101", status: "Actif" }),
        ]);
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return {
          data: {
            values: [
              partnerFormHeaders,
              createPartnerFormRow("Studio Alpha", "Mila Benjak", "alpha@example.com"),
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
          createPartnerRow({ name: "Studio Alpha", type: "Partenaire", category: "Media", contact: "Mila Benjak", email: "", phone: "010101", status: "Actif" }),
        ]);
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return {
          data: {
            values: [
              partnerFormHeaders,
              createPartnerFormRow("Studio Alpha", "Mila Benjak", ""),
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
          createPartnerRow({ name: "Studio Alpha", type: "Partenaire", category: "Media", contact: "Mila Benjak", email: "alpha@example.com", phone: "010101", status: "Actif" }),
        ]);
      }

      if (range === FORMS_PARTNERS_RANGE) {
        return {
          data: {
            values: [
              partnerFormHeaders,
              createPartnerFormRow("", "", ""),
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
