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
        values: { get: valuesGetMock },
      },
    })),
  },
}));

import { getEditorialAthleteProjectionFromGoogleSheets } from "@/lib/google-sheets";

describe("editorial Athlete projection", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";
  });

  it("exposes only explicitly editorial fields to Media", async () => {
    valuesGetMock.mockResolvedValue({
      data: {
        values: [
          [
            "Athlete ID",
            "Nom",
            "Sport",
            "Club",
            "Statut",
            "Nom public",
            "Poste public",
            "Bio publique",
            "Palmarès public",
            "Objectifs communication autorisés",
            "Faits médias validés",
            "Email",
            "Téléphone",
            "Date de naissance",
            "Notes",
            "Prochaine action",
            "Blessure",
            "Crédits",
          ],
          [
            "athlete-1",
            "Nom interne",
            "Football",
            "FC Lausanne",
            "Actif",
            "Mila Martin",
            "Attaquante",
            "Biographie publique",
            "Championne régionale",
            "Présenter le nouveau projet\nAnnoncer la sélection",
            "Sélection annoncée par la fédération",
            "private@example.com",
            "+41 79 000 00 00",
            "2000-01-01",
            "Note de suivi privée",
            "Appeler demain",
            "Douleur au genou",
            "42",
          ],
        ],
      },
    });

    const projection = await getEditorialAthleteProjectionFromGoogleSheets("athlete-1", "media");

    expect(projection).toEqual({
      id: "athlete-1",
      displayName: "Mila Martin",
      sport: "Football",
      club: "FC Lausanne",
      position: "Attaquante",
      biography: "Biographie publique",
      palmares: "Championne régionale",
      communicationObjectives: ["Présenter le nouveau projet", "Annoncer la sélection"],
      publishedFacts: ["Sélection annoncée par la fédération"],
    });
    expect(JSON.stringify(projection)).not.toContain("private@example.com");
    expect(JSON.stringify(projection)).not.toContain("Douleur au genou");
    expect(JSON.stringify(projection)).not.toContain("Appeler demain");
  });

  it("does not read any weekly, monthly, form, or commercial sheet", async () => {
    valuesGetMock.mockResolvedValue({
      data: {
        values: [
          ["Athlete ID", "Nom", "Sport", "Club", "Statut"],
          ["athlete-1", "Mila Martin", "Football", "FC Lausanne", "Actif"],
        ],
      },
    });

    await getEditorialAthleteProjectionFromGoogleSheets("athlete-1", "admin");

    expect(valuesGetMock).toHaveBeenCalledTimes(1);
    expect(valuesGetMock.mock.calls[0]?.[0]?.range).toBe("'02_Athlètes'!A3:AI200");
  });
});
