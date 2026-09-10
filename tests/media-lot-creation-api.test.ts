import { beforeEach, describe, expect, it, vi } from "vitest";

const { evaluateBusinessAccessMock, valuesAppendMock } = vi.hoisted(() => ({
  evaluateBusinessAccessMock: vi.fn(),
  valuesAppendMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  evaluateBusinessAccess: evaluateBusinessAccessMock,
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
          get: vi.fn(async () => ({ data: { values: [] } })),
          append: valuesAppendMock,
        },
      },
    })),
  },
}));

import { POST } from "@/app/api/media/route";
import { NextRequest } from "next/server";

const baseBody = {
  date: "18.03.2026",
  athlete: "Loan Cueto",
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
  premiumUsed: 8,
  favorites: 16,
  videos: 3,
  source: "Sébastien Mory",
  lastUse: "22.07.2026",
  associatedContent: "Portrait",
  rights: "KLIQUE + athlète + médias",
  notes: "",
};

const postRequest = (payload: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

const appendedRow = () => valuesAppendMock.mock.calls[0][0].requestBody.values[0] as unknown[];

describe("POST /api/media gallery and athleteIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "./credentials/test.json";
    process.env.GOOGLE_SHEET_ID = "test-sheet";
    evaluateBusinessAccessMock.mockResolvedValue({ allowed: true });
    valuesAppendMock.mockResolvedValue({});
  });

  it("writes galleryUrl in column S and athleteIds in column X", async () => {
    const response = await POST(
      postRequest({
        ...baseBody,
        galleryUrl: "https://klique.photodeck.com/gallery/portrait-klique",
        athleteIds: ["athlete-1", " athlete-2 ", "athlete-1", ""],
      }),
    );

    expect(response.status).toBe(200);
    expect(valuesAppendMock.mock.calls[0][0].range).toBe("'13_Banque Médias'!A:X");

    const row = appendedRow();
    expect(row).toHaveLength(24);
    expect(row[18]).toBe("https://klique.photodeck.com/gallery/portrait-klique");
    expect(row[23]).toBe("athlete-1, athlete-2");
    expect(row[21]).toBe("KLIQUE + athlète + médias");
    expect(row[0]).toBe("18.03.2026");
  });

  it("writes the usage rights in column V without touching the other columns", async () => {
    await POST(postRequest({ ...baseBody, rights: "KLIQUE + athlète" }));

    const row = appendedRow();
    expect(row[21]).toBe("KLIQUE + athlète");
    expect(row[20]).toBe("Portrait");
    expect(row[22]).toBe("");
    expect(row[17]).toBe("Sébastien Mory");
  });

  it("still accepts the legacy driveLink field", async () => {
    await POST(postRequest({ ...baseBody, driveLink: "https://drive.google.com/drive/folders/abc" }));

    const row = appendedRow();
    expect(row[18]).toBe("https://drive.google.com/drive/folders/abc");
    expect(row[23]).toBe("");
  });

  it("prefers galleryUrl over driveLink when both are sent", async () => {
    await POST(
      postRequest({
        ...baseBody,
        galleryUrl: "https://klique.photodeck.com/gallery/portrait-klique",
        driveLink: "https://drive.google.com/drive/folders/abc",
      }),
    );

    expect(appendedRow()[18]).toBe("https://klique.photodeck.com/gallery/portrait-klique");
  });

  it("accepts a lot without any link nor athleteIds", async () => {
    const response = await POST(postRequest(baseBody));

    expect(response.status).toBe(200);
    const row = appendedRow();
    expect(row[18]).toBe("");
    expect(row[23]).toBe("");
  });

  it("rejects a non https link without writing anything", async () => {
    for (const link of [
      "http://klique.photodeck.com/gallery/a",
      "javascript:alert(1)",
      "klique.photodeck.com/gallery/a",
    ]) {
      const response = await POST(postRequest({ ...baseBody, galleryUrl: link }));
      const payload = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(payload.error).toBe("Le lien de galerie doit être une URL https.");
    }

    expect(valuesAppendMock).not.toHaveBeenCalled();
  });

  it("keeps the admin permission and the required fields unchanged", async () => {
    evaluateBusinessAccessMock.mockResolvedValue({ allowed: false });
    expect((await POST(postRequest({ ...baseBody, galleryUrl: "https://klique.photodeck.com/g" }))).status).toBe(403);

    evaluateBusinessAccessMock.mockResolvedValue({ allowed: true });
    expect((await POST(postRequest({ ...baseBody, event: "" }))).status).toBe(400);

    expect(valuesAppendMock).not.toHaveBeenCalled();
    expect(evaluateBusinessAccessMock).toHaveBeenCalledWith(expect.anything(), { action: "write:crm" });
  });
});
