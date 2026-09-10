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

import { getMediaFromGoogleSheets } from "@/lib/google-sheets";

const MEDIA_RANGE = "'13_Banque Médias'!A3:X300";

const headerRow = [
  "Date",
  "Athlète",
  "Sport",
  "Type de média",
  "Événement / shooting",
  "Lieu",
  "Total fichiers",
  "Verticales",
  "Horizontales",
  "Carrées",
  "Premium total",
  "Fichiers utilisés",
  "Fichiers restants",
  "Premium utilisés",
  "Premium restants",
  "Favoris",
  "Vidéos",
  "Photographe / source",
  "Lien Drive / dossier",
  "Dernière utilisation",
  "Contenu associé",
  "Droits d’utilisation",
  "Notes",
  "IDs athlètes",
];

const dataRow = [
  "18.03.2026",
  "Loan Cueto",
  "Tennis",
  "Photos",
  "Portrait KLIQUE",
  "Bulle",
  "286",
  "154",
  "132",
  "0",
  "12",
  "248",
  "38",
  "8",
  "4",
  "16",
  "3",
  "Sébastien Mory",
  "https://klique.photodeck.com/gallery/portrait-klique",
  "22.07.2026",
  "Portrait",
  "KLIQUE + athlète + médias",
  "Note interne",
  "athlete-1",
];

const setSheetRows = (rows: string[][]) => {
  valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
    if (range === MEDIA_RANGE) return { data: { values: rows } };
    return { data: { values: [] } };
  });
};

describe("getMediaFromGoogleSheets athleteIds mapping", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";
    setSheetRows([headerRow, dataRow]);
  });

  it("reads the sheet up to column X", async () => {
    await getMediaFromGoogleSheets();

    expect(valuesGetMock).toHaveBeenCalledWith(expect.objectContaining({ range: MEDIA_RANGE }));
  });

  it("maps column X into athleteIds without shifting the existing columns", async () => {
    const [lot] = await getMediaFromGoogleSheets();

    expect(lot).toMatchObject({
      row: 4,
      date: "18.03.2026",
      athlete: "Loan Cueto",
      athleteIds: ["athlete-1"],
      sport: "Tennis",
      mediaType: "Photos",
      event: "Portrait KLIQUE",
      place: "Bulle",
      totalFiles: 286,
      vertical: 154,
      horizontal: 132,
      square: 0,
      premiumTotal: 12,
      filesUsed: 248,
      filesRemaining: 38,
      premiumUsed: 8,
      premiumRemaining: 4,
      favorites: 16,
      videos: 3,
      source: "Sébastien Mory",
      driveLink: "https://klique.photodeck.com/gallery/portrait-klique",
      lastUse: "22.07.2026",
      associatedContent: "Portrait",
      rights: "KLIQUE + athlète + médias",
      notes: "Note interne",
    });
  });

  it("splits, trims and deduplicates the comma separated identifiers", async () => {
    setSheetRows([
      headerRow,
      [...dataRow.slice(0, 23), "  athlete-2 , athlete-3,athlete-2 ,, athlete-4  "],
    ]);

    const [lot] = await getMediaFromGoogleSheets();
    expect(lot.athleteIds).toEqual(["athlete-2", "athlete-3", "athlete-4"]);
  });

  it("leaves athleteIds undefined on an empty, blank or missing column X", async () => {
    setSheetRows([
      headerRow,
      [...dataRow.slice(0, 23), ""],
      [...dataRow.slice(0, 23), "  ,  , "],
      dataRow.slice(0, 23),
    ]);

    const lots = await getMediaFromGoogleSheets();

    expect(lots).toHaveLength(3);
    for (const lot of lots) {
      expect(lot.athleteIds).toBeUndefined();
      expect(lot.notes).toBe("Note interne");
      expect(lot.rights).toBe("KLIQUE + athlète + médias");
    }
  });
});
