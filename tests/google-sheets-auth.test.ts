import { beforeEach, describe, expect, it, vi } from "vitest";

const { valuesGetMock, googleAuthCtorMock } = vi.hoisted(() => ({
  valuesGetMock: vi.fn(),
  googleAuthCtorMock: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: googleAuthCtorMock,
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
const FORMS_RANGE = "'Forms_Adhesion'!A1:Z500";

const setupSuccessfulReads = () => {
  valuesGetMock.mockImplementation(async ({ range }: { range: string }) => {
    if (range === ATHLETES_RANGE) {
      return {
        data: {
          values: [
            ["Nom", "Sport", "Club", "Instagram", "Telephone", "Email", "Statut"],
            ["Alpha Martin", "Tennis", "Club A", "@alpha", "111", "alpha@example.com", "Actif"],
          ],
        },
      };
    }

    if (range === FORMS_RANGE) {
      return {
        data: {
          values: [["Horodateur", "Email"]],
        },
      };
    }

    throw new Error(`Unexpected range: ${range}`);
  });
};

describe("Google Sheets auth configuration", () => {
  beforeEach(() => {
    valuesGetMock.mockReset();
    googleAuthCtorMock.mockReset();
    googleAuthCtorMock.mockImplementation(function GoogleAuth(this: unknown, config: unknown) {
      return { config };
    });

    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    process.env.GOOGLE_SHEET_ID = "test-sheet";

    setupSuccessfulReads();
  });

  it("uses GOOGLE_SERVICE_ACCOUNT_JSON credentials when provided", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "service-account@example.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nline\\n-----END PRIVATE KEY-----\\n",
      project_id: "project-id",
    });

    await getAthletesFromGoogleSheets();

    expect(googleAuthCtorMock).toHaveBeenCalledTimes(1);
    const authConfig = googleAuthCtorMock.mock.calls[0][0] as {
      credentials?: { client_email: string; private_key: string; project_id?: string };
      keyFile?: string;
      scopes?: string[];
    };

    expect(authConfig.keyFile).toBeUndefined();
    expect(authConfig.credentials?.client_email).toBe("service-account@example.iam.gserviceaccount.com");
    expect(authConfig.credentials?.private_key).toContain("\nline\n");
    expect(authConfig.scopes).toEqual(["https://www.googleapis.com/auth/spreadsheets"]);
  });

  it("falls back to GOOGLE_APPLICATION_CREDENTIALS keyFile when JSON config is absent", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";

    await getAthletesFromGoogleSheets();

    expect(googleAuthCtorMock).toHaveBeenCalledTimes(1);
    const authConfig = googleAuthCtorMock.mock.calls[0][0] as {
      keyFile?: string;
      credentials?: unknown;
    };

    expect(authConfig.credentials).toBeUndefined();
    expect(authConfig.keyFile).toBeTruthy();
    expect(authConfig.keyFile).toMatch(/credentials[\\/]test\.json$/);
  });

  it("throws a clear error when configuration is missing", async () => {
    await expect(getAthletesFromGoogleSheets()).rejects.toThrow(
      "Configuration Google Sheets manquante: definir GOOGLE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS."
    );
  });

  it("throws a clear error when GOOGLE_SERVICE_ACCOUNT_JSON is invalid", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{not-json}";

    await expect(getAthletesFromGoogleSheets()).rejects.toThrow(
      "GOOGLE_SERVICE_ACCOUNT_JSON invalide: JSON non parsable."
    );
  });
});
