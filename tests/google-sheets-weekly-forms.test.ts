import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const ATHLETES_RANGE = "'02_Athlètes'!A3:AI200";
const FORMS_ADHESION_RANGE = "'Forms_Adhesion_Responses'!A1:Z500";
const WEEKLY_RESPONSES_RANGE = "'Forms_Hebdo_Responses'!A:Z";
const MONTHLY_RESPONSES_RANGE = "'Forms_Mensuel_Responses'!A:H";

describe("getAthletesFromGoogleSheets weekly and monthly form responses", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
              ],
              ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif"],
              ["Beta Dupont", "Natation", "Club B", "@beta", "222", "beta@example.com", "Actif"],
            ],
          },
        };
      }

      if (range === FORMS_ADHESION_RANGE) {
        return {
          data: {
            values: [["Horodateur", "Email"]],
          },
        };
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom et prénom"],
              ["2024-01-05 09:00:00", "alpha@example.com", "Alpha Martin"],
              ["2024-02-10 10:30:00", "", "Beta Dupont"],
            ],
          },
        };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Nom et prénom", "Dates importantes", "Objectif principal", "Autre actualité", "Opportunité ou besoin", "Moment à couvrir", "Remarque"],
              ["2024-03-05 09:00:00", "Alpha Martin", "", "", "", "", "", ""],
              ["2024-04-10 10:30:00", "Beta Dupont", "", "", "", "", "", ""],
            ],
          },
        };
      }

      throw new Error(`Unexpected range: ${range}`);
    });
  });

  it("uses the latest weekly response and matches by email or normalized name", async () => {
    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes).toHaveLength(2);
    expect(athletes[0]?.lastResponseWeekly).toBe("2024-01-05 09:00:00");
    expect(athletes[1]?.lastResponseWeekly).toBe("2024-02-10 10:30:00");
    expect(athletes[0]?.lastResponseMonthly).toBe("2024-03-05 09:00:00");
    expect(athletes[1]?.lastResponseMonthly).toBe("2024-04-10 10:30:00");
  });

  it("keeps the latest weekly response when the same athlete appears with reordered names", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return {
          data: {
            values: [
              ["Nom", "Sport", "Club", "Instagram", "Telephone", "Email", "Statut"],
              ["Mila Benjak", "Tennis", "Club A", "@mila", "111", "mila@example.com", "Actif"],
            ],
          },
        };
      }

      if (range === FORMS_ADHESION_RANGE) {
        return {
          data: {
            values: [["Horodateur", "Email"]],
          },
        };
      }

      if (range === WEEKLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Email", "Nom et prénom"],
              ["27/07/2026", "mila@example.com", "Mila Benjak"],
              ["04/08/2026 01:26:53", "mila@example.com", "Benjak Mila"],
            ],
          },
        };
      }

      if (range === MONTHLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [
              ["Horodateur", "Nom et prénom", "Dates importantes", "Objectif principal", "Autre actualité", "Opportunité ou besoin", "Moment à couvrir", "Remarque"],
              ["27/07/2026", "Mila Benjak", "", "", "", "", "", ""],
              ["04/08/2026 01:26:53", "Benjak Mila", "", "", "", "", "", ""],
            ],
          },
        };
      }

      throw new Error(`Unexpected range: ${range}`);
    });

    const athletes = await getAthletesFromGoogleSheets();

    expect(athletes).toHaveLength(1);
    expect(athletes[0]?.lastResponseWeekly).toContain("04/08/2026");
    expect(athletes[0]?.lastResponseMonthly).toContain("04/08/2026");
  });

  it("maps the real weekly business headers without losing Liban's competition, result, or appointment", async () => {
    valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
      if (range === ATHLETES_RANGE) {
        return {
          data: {
            values: [
              ["Nom", "Sport", "Club", "Instagram", "Telephone", "Email", "Statut"],
              ["Liban Maxamed", "Basketball", "Sarine", "", "", "", "Actif"],
            ],
          },
        };
      }
      if (range === FORMS_ADHESION_RANGE) {
        return { data: { values: [["Horodateur", "Email"]] } };
      }
      if (range === WEEKLY_RESPONSES_RANGE) {
        return {
          data: {
            values: [
              [
                "Horodateur",
                "Nom et prénom",
                "As-tu participé cette semaine à une compétition, un match ou un tournoi?",
                "Si oui, lequel?",
                "Quel(s) résultat(s) as-tu obtenu(s) ?",
                "As-tu vécu récemment l'un des événements suivants ?",
                "Explique-nous cette actualité en quelques mots",
                "As-tu des photos ou vidéos de cette actualité ?",
                "Lien vers les résultats, un article ou une publication",
                "As-tu des rendez-vous importants cette semaine ? Si oui, lesquels ? (match, compétition, ...)",
                "As-tu besoin que Klique te contacte rapidement cette semaine ? (besoin de conseil, mise en relation, problème, etc.)",
                "Si oui, pourquoi ?",
                "Date du premier rendez-vous important de la semaine",
                "Date du deuxième (éventuel) rendez-vous important de la semaine",
                "Date du troisième (éventuel) rendez-vous important de la semaine",
              ],
              [
                "15/10/2026 04:35:30",
                "Liban Maxamed",
                "Oui",
                "Coupe suisse",
                "Win avec un bon apport défensif",
                "",
                "",
                "",
                "https://example.com/resultats",
                "Match de championnat vs Sarine",
                "Non",
                "",
                "18/10/2026",
                "",
                "",
              ],
            ],
          },
        };
      }
      if (range === MONTHLY_RESPONSES_RANGE) {
        return { data: { values: [["Horodateur", "Nom et prénom"]] } };
      }
      throw new Error(`Unexpected range: ${range}`);
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 17, 14, 0, 0));

    const athletes = await getAthletesFromGoogleSheets({ weeklyResponseDays: 14 });

    expect(athletes[0]?.weeklyFormResponse).toMatchObject({
      competitionParticipation: "Oui",
      competition: "Coupe suisse",
      result: "Win avec un bon apport défensif",
      appointment: "Match de championnat vs Sarine",
      mediaLink: "https://example.com/resultats",
      firstAppointmentDate: "18/10/2026",
    });
  });
});
