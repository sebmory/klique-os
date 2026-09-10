import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserAccessProfileMock, getMediaFromGoogleSheetsMock } = vi.hoisted(() => ({
  getCurrentUserAccessProfileMock: vi.fn(),
  getMediaFromGoogleSheetsMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: vi.fn(),
  getDefaultWorkspaceId: () => "klique-os",
}));

vi.mock("@/lib/google-sheets", () => ({
  getMediaFromGoogleSheets: getMediaFromGoogleSheetsMock,
}));

import { GET } from "@/app/api/athlete-media-bank/route";
import { isAthleteAllowedRoute, isMediaAllowedApi } from "@/proxy";
import type { MediaLot } from "@/types/media";

const lot = (overrides: Partial<MediaLot> = {}): MediaLot => ({
  row: 4,
  date: "18.03.2026",
  athlete: "Loan Cueto",
  athleteIds: ["athlete-1", "athlete-2"],
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
  rights: "KLIQUE + athlète",
  notes: "Note interne confidentielle",
  ...overrides,
});

const asRole = (
  role: string,
  options: { status?: string; workspaceId?: string; athleteId?: string | null } = {},
) => {
  const { status = "active", workspaceId = "klique-os", athleteId = "athlete-1" } = options;
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: `user_${role}`, email: `${role}@example.com` },
    userAccess: {
      clerkUserId: `user_${role}`,
      email: `${role}@example.com`,
      role,
      status,
      workspaceId,
      athleteId: role === "athlete" ? athleteId : null,
      partnerId: role === "partner_expert" ? "partner-1" : null,
      mediaId: role === "media" ? "media-1" : null,
    },
  });
};

const bankRequest = (search = "") => new Request(`http://localhost/api/athlete-media-bank${search}`);

describe("athlete media bank API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMediaFromGoogleSheetsMock.mockResolvedValue([lot()]);
  });

  it("returns the lots linked to the signed-in athlete", async () => {
    asRole("athlete");

    const response = await GET(bankRequest());
    const payload = (await response.json()) as { ok: boolean; lots: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.lots).toEqual([
      {
        id: "lot-4",
        date: "18.03.2026",
        sport: "Tennis",
        mediaType: "Photos",
        event: "Portrait KLIQUE",
        place: "Bulle",
        totalFiles: 286,
        orientations: { vertical: 154, horizontal: 132, square: 0 },
        videos: 3,
        galleryUrl: "https://klique.photodeck.com/gallery/portrait-klique",
      },
    ]);
  });

  it("never exposes internal fields", async () => {
    asRole("athlete");

    const payload = (await (await GET(bankRequest())).json()) as { lots: Array<Record<string, unknown>> };
    const keys = Object.keys(payload.lots[0]);

    for (const forbidden of [
      "notes",
      "source",
      "row",
      "athlete",
      "athleteIds",
      "driveLink",
      "rights",
      "premiumTotal",
      "premiumUsed",
      "premiumRemaining",
      "filesUsed",
      "filesRemaining",
      "favorites",
      "lastUse",
      "associatedContent",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    expect(JSON.stringify(payload)).not.toContain("Note interne confidentielle");
    expect(JSON.stringify(payload)).not.toContain("Sébastien Mory");
  });

  it("keeps only the lots whose athleteIds contain the athlete", async () => {
    asRole("athlete");
    getMediaFromGoogleSheetsMock.mockResolvedValue([
      lot({ row: 4, athleteIds: ["athlete-1"] }),
      lot({ row: 5, athleteIds: ["athlete-2", "athlete-3"] }),
      lot({ row: 6, athleteIds: [] }),
      lot({ row: 7, athleteIds: undefined }),
      lot({ row: 8, athleteIds: ["  athlete-1  "] }),
    ]);

    const payload = (await (await GET(bankRequest())).json()) as { lots: Array<{ id: string }> };
    expect(payload.lots.map((entry) => entry.id)).toEqual(["lot-4", "lot-8"]);
  });

  it("keeps only the lots with an https gallery url", async () => {
    asRole("athlete");
    getMediaFromGoogleSheetsMock.mockResolvedValue([
      lot({ row: 4 }),
      lot({ row: 5, driveLink: "http://klique.photodeck.com/gallery/a" }),
      lot({ row: 6, driveLink: "javascript:alert(1)" }),
      lot({ row: 7, driveLink: "" }),
    ]);

    const payload = (await (await GET(bankRequest())).json()) as { lots: Array<{ id: string }> };
    expect(payload.lots.map((entry) => entry.id)).toEqual(["lot-4"]);
  });

  it("ignores any athleteId sent in the query string", async () => {
    asRole("athlete");
    getMediaFromGoogleSheetsMock.mockResolvedValue([
      lot({ row: 4, athleteIds: ["athlete-1"] }),
      lot({ row: 5, athleteIds: ["athlete-9"] }),
    ]);

    const payload = (await (await GET(bankRequest("?athleteId=athlete-9"))).json()) as {
      lots: Array<{ id: string }>;
    };
    expect(payload.lots.map((entry) => entry.id)).toEqual(["lot-4"]);
  });

  it("refuses an admin, a media user, a partner and an inactive athlete", async () => {
    asRole("admin");
    expect((await GET(bankRequest())).status).toBe(403);

    asRole("media");
    expect((await GET(bankRequest())).status).toBe(403);

    asRole("partner_expert");
    expect((await GET(bankRequest())).status).toBe(403);

    asRole("athlete", { status: "invited" });
    expect((await GET(bankRequest())).status).toBe(403);

    expect(getMediaFromGoogleSheetsMock).not.toHaveBeenCalled();
  });

  it("refuses an athlete without athleteId and an unauthenticated caller", async () => {
    asRole("athlete", { athleteId: "  " });
    expect((await GET(bankRequest())).status).toBe(403);

    getCurrentUserAccessProfileMock.mockResolvedValue(null);
    expect((await GET(bankRequest())).status).toBe(401);

    expect(getMediaFromGoogleSheetsMock).not.toHaveBeenCalled();
  });

  it("returns an empty list outside the workspace of the Sheets source", async () => {
    asRole("athlete", { workspaceId: "autre-workspace" });

    const response = await GET(bankRequest());
    const payload = (await response.json()) as { ok: boolean; lots: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.lots).toEqual([]);
    expect(getMediaFromGoogleSheetsMock).not.toHaveBeenCalled();
  });

  it("hides the server details on an unexpected failure", async () => {
    asRole("athlete");
    getMediaFromGoogleSheetsMock.mockRejectedValue(new Error("Sheets credentials missing at /secret/path"));

    const response = await GET(bankRequest());
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(500);
    expect(payload.message).toBe("Impossible de charger vos medias.");
    expect(JSON.stringify(payload)).not.toContain("/secret/path");
  });
});

describe("athlete media bank proxy access", () => {
  it("opens the route to the athlete in read only", () => {
    expect(isAthleteAllowedRoute("/api/athlete-media-bank", "GET")).toBe(true);

    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(isAthleteAllowedRoute("/api/athlete-media-bank", method)).toBe(false);
    }
  });

  it("keeps the admin and media bank rules unchanged", () => {
    expect(isAthleteAllowedRoute("/api/media-bank", "GET")).toBe(false);
    expect(isMediaAllowedApi("/api/media-bank", "GET")).toBe(true);
    expect(isMediaAllowedApi("/api/media-bank", "POST")).toBe(false);
  });
});
