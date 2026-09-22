import { beforeEach, describe, expect, it, vi } from "vitest";

const valuesGetMock = vi.fn();
const valuesAppendMock = vi.fn();
const valuesUpdateMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(function GoogleAuth() { return {}; }) },
    sheets: vi.fn(() => ({
      spreadsheets: {
        values: {
          get: valuesGetMock,
          append: valuesAppendMock,
          update: valuesUpdateMock,
        },
      },
    })),
  },
}));

import {
  addPartnerToGoogleSheets,
  resolvePartnerReference,
  updatePartnerInGoogleSheets,
} from "@/lib/google-sheets";
import type { NewPartner, Partner } from "@/types/partner";

const headers = [
  "Nom", "Type de relation", "Catégorie", "Contact principal", "Fonction", "E-mail",
  "Téléphone", "Site", "Description", "Athlètes concernés", "Statut",
  "", "", "", "", "", "", "", "", "Offre / avantage membres", "Instagram", "Notes",
  "", "", "Date arrivée KLIQUE",
];

const newPartner: NewPartner = {
  name: "Studio Alpha",
  relationType: "Partenaire",
  category: "Media",
  expertKlique: false,
  contact: "Mila Benjak",
  email: "alpha@example.com",
  phone: "+41 79 000 00 00",
  website: "https://alpha.example.com",
  instagram: "@alpha",
  description: "Studio créatif",
  benefits: "20% pour les membres",
  notes: "",
  status: "Actif",
  athletes: "",
};

describe("06_Partenaires stable UUID writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";
  });

  it("creates the Partner ID header and writes the generated UUID in column Z", async () => {
    let appendedRow: unknown[] = [];
    valuesAppendMock.mockImplementation(async ({ requestBody }) => {
      appendedRow = requestBody.values[0];
      return { data: { updates: { updatedRange: "'06_Partenaires'!A4:Z4" } } };
    });
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === "'06_Partenaires'!A1:Z3") return { data: { values: [headers] } };
      if (range === "'06_Partenaires'!A4:Z4") return { data: { values: [appendedRow] } };
      if (range === "'06_Partenaires'!A4:Z") return { data: { values: [appendedRow] } };
      return { data: { values: [] } };
    });

    const created = await addPartnerToGoogleSheets(newPartner);

    expect(created.partnerId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(appendedRow[25]).toBe(created.partnerId);
    expect(valuesUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      range: "'06_Partenaires'!Z1",
      requestBody: { values: [["Partner ID"]] },
    }));
    expect(valuesAppendMock).toHaveBeenCalledWith(expect.objectContaining({ range: "'06_Partenaires'!A:Z" }));
  });

  it("updates 06_Partenaires and preserves the Partner ID", async () => {
    const partnerId = "3d216a5b-4594-4c5a-b66b-1338b982a95f";
    const row = [...headers, partnerId];
    valuesGetMock
      .mockResolvedValueOnce({ data: { values: [[...headers, "Partner ID"]] } })
      .mockResolvedValueOnce({ data: { values: [row] } });

    await updatePartnerInGoogleSheets({ row: 4, benefits: "Nouvelle offre", name: "Studio Alpha Renommé" });

    expect(valuesGetMock).not.toHaveBeenCalledWith(expect.objectContaining({ range: expect.stringContaining("20_Partenaires") }));
    expect(valuesUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      range: "'06_Partenaires'!A4:Z4",
      requestBody: { values: [expect.arrayContaining([partnerId, "Nouvelle offre", "Studio Alpha Renommé"])] },
    }));
  });

  it.each(["3d216a5b-4594-4c5a-b66b-1338b982a95f", "row-7", "7", "Studio Alpha"])(
    "resolves the canonical partner from %s",
    (reference) => {
      const partner = { ...newPartner, id: "3d216a5b-4594-4c5a-b66b-1338b982a95f", row: 7 } as Partner;
      expect(resolvePartnerReference([partner], reference)?.id).toBe(partner.id);
    },
  );
});