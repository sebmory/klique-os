import { beforeEach, describe, expect, it, vi } from "vitest";

const { valuesGetMock, valuesAppendMock, valuesUpdateMock } = vi.hoisted(() => ({
  valuesGetMock: vi.fn(),
  valuesAppendMock: vi.fn(),
  valuesUpdateMock: vi.fn(),
}));

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
          append: valuesAppendMock,
          update: valuesUpdateMock,
        },
      },
    })),
  },
}));

import { syncAthleteAdhesionsToGoogleSheets } from "@/lib/google-sheets";

const ATHLETES_RANGE = "'02_Athlètes'!A3:AI200";
const ATHLETES_APPEND_RANGE = "'02_Athlètes'!A:AI";
const ADHESIONS_RANGE = "'Forms_Adhesion_Responses'!A1:Z500";

const athleteHeaders = [
  "Nom",
  "Sport",
  "Club",
  "Instagram",
  "Téléphone",
  "E-mail",
  "Statut",
  "Notes CRM",
  "Prochaine action CRM",
];

const adhesionHeaders = [
  "Horodateur",
  "Prénom et Nom",
  "Adresse e-mail",
  "Numéro de téléphone",
  "Compte instagram",
  "Sport pratiqué",
  "Position / Spécialité (si applicable)",
  "Club actuel",
];

const adhesionRow = ({
  name,
  email,
  phone = "",
  instagram = "",
  sport = "",
  club = "",
}: {
  name: string;
  email: string;
  phone?: string;
  instagram?: string;
  sport?: string;
  club?: string;
}) => ["2026-09-14 10:00:00", name, email, phone, instagram, sport, "", club];

let athleteRows: string[][];
let formRows: string[][];

const installSheetMocks = () => {
  valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
    if (range === ATHLETES_RANGE) return { data: { values: [athleteHeaders, ...athleteRows] } };
    if (range === ADHESIONS_RANGE) return { data: { values: [adhesionHeaders, ...formRows] } };
    throw new Error(`Unexpected range: ${range}`);
  });
  valuesAppendMock.mockImplementation(async ({ requestBody }: { requestBody: { values: string[][] } }) => {
    athleteRows.push(requestBody.values[0]);
    return { data: {} };
  });
};

describe("syncAthleteAdhesionsToGoogleSheets", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";
    athleteRows = [
      ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif", "Suivi à préserver"],
      ["Mila Benjak", "Natation", "Club B", "@mila", "222", "", "Actif", "Autre suivi"],
    ];
    formRows = [];
    installSheetMocks();
  });

  it("matches by email then normalized name and appends only new athletes", async () => {
    formRows = [
      adhesionRow({ name: "Nina Laurent", email: "NINA@EXAMPLE.COM", phone: "333", instagram: "@nina", sport: "Football", club: "FC Lausanne" }),
      adhesionRow({ name: "Autre Alpha", email: " alpha@example.com " }),
      adhesionRow({ name: "Benjak Mila", email: "mila-new@example.com" }),
      adhesionRow({ name: "Laurent Nina", email: "nina@example.com" }),
    ];

    const result = await syncAthleteAdhesionsToGoogleSheets();

    expect(result).toEqual({ created: 1, skipped: 3, errors: [] });
    expect(valuesAppendMock).toHaveBeenCalledOnce();
    expect(valuesAppendMock).toHaveBeenCalledWith(expect.objectContaining({
      range: ATHLETES_APPEND_RANGE,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
    }));
    const appendedRow = valuesAppendMock.mock.calls[0][0].requestBody.values[0] as string[];
    expect(appendedRow.slice(0, 7)).toEqual([
      "Nina Laurent",
      "Football",
      "FC Lausanne",
      "@nina",
      "333",
      "NINA@EXAMPLE.COM",
      "Actif",
    ]);
    expect(appendedRow.slice(7).every((value) => value === "")).toBe(true);
    expect(valuesUpdateMock).not.toHaveBeenCalled();
    expect(athleteRows[0][7]).toBe("Suivi à préserver");
    expect(athleteRows[1][7]).toBe("Autre suivi");
  });

  it("is idempotent across repeated executions", async () => {
    formRows = [adhesionRow({ name: "Nina Laurent", email: "nina@example.com" })];

    const firstResult = await syncAthleteAdhesionsToGoogleSheets();
    const secondResult = await syncAthleteAdhesionsToGoogleSheets();

    expect(firstResult).toEqual({ created: 1, skipped: 0, errors: [] });
    expect(secondResult).toEqual({ created: 0, skipped: 1, errors: [] });
    expect(valuesAppendMock).toHaveBeenCalledOnce();
    expect(valuesUpdateMock).not.toHaveBeenCalled();
  });

  it("isolates invalid rows and append failures without stopping later imports", async () => {
    formRows = [
      adhesionRow({ name: "", email: "missing-name@example.com" }),
      adhesionRow({ name: "Append Failure", email: "failure@example.com" }),
      adhesionRow({ name: "Valid Athlete", email: "valid@example.com", sport: "Cyclisme" }),
    ];
    valuesAppendMock.mockImplementation(async ({ requestBody }: { requestBody: { values: string[][] } }) => {
      const row = requestBody.values[0];
      if (row[0] === "Append Failure") throw new Error("Google append failed");
      athleteRows.push(row);
      return { data: {} };
    });

    const result = await syncAthleteAdhesionsToGoogleSheets();

    expect(result).toEqual({
      created: 1,
      skipped: 0,
      errors: [
        { sourceRow: 2, message: "Nom athlète manquant." },
        { sourceRow: 3, message: "Google append failed" },
      ],
    });
    expect(valuesAppendMock).toHaveBeenCalledTimes(2);
    expect(athleteRows.some((row) => row[0] === "Valid Athlete")).toBe(true);
    expect(valuesUpdateMock).not.toHaveBeenCalled();
  });
});