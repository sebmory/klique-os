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

import { GET } from "@/app/api/media-bank/route";
import { isAthleteAllowedRoute, isMediaAllowedApi } from "@/proxy";
import type { MediaLot } from "@/types/media";

const lot = (overrides: Partial<MediaLot> = {}): MediaLot => ({
  row: 4,
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
  notes: "Note interne confidentielle",
  ...overrides,
});

const asRole = (role: string, status = "active", workspaceId = "klique-os") => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: `user_${role}`, email: `${role}@example.com` },
    userAccess: {
      clerkUserId: `user_${role}`,
      email: `${role}@example.com`,
      role,
      status,
      workspaceId,
      athleteId: role === "athlete" ? "athlete-1" : null,
      partnerId: role === "partner_expert" ? "partner-1" : null,
      mediaId: role === "media" ? "media-1" : null,
    },
  });
};

const bankRequest = () => new Request("http://localhost/api/media-bank");

describe("media bank API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMediaFromGoogleSheetsMock.mockResolvedValue([lot()]);
  });

  it("returns the lots to an active admin", async () => {
    asRole("admin");

    const response = await GET(bankRequest());
    const payload = (await response.json()) as { ok: boolean; lots: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.lots).toHaveLength(1);
    expect(payload.lots[0]).toMatchObject({
      id: "lot-4",
      athlete: "Loan Cueto",
      galleryUrl: "https://klique.photodeck.com/gallery/portrait-klique",
    });
    expect(Object.keys(payload.lots[0])).not.toContain("driveLink");
  });

  it("returns the lots to an active media user without internal fields", async () => {
    asRole("media");

    const response = await GET(bankRequest());
    const payload = (await response.json()) as { ok: boolean; lots: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(Object.keys(payload.lots[0])).not.toContain("notes");
    expect(Object.keys(payload.lots[0])).not.toContain("source");
    expect(Object.keys(payload.lots[0])).not.toContain("premiumRemaining");
    expect(JSON.stringify(payload)).not.toContain("Note interne confidentielle");
  });

  it("refuses an athlete, a partner and a disabled media user", async () => {
    asRole("athlete");
    expect((await GET(bankRequest())).status).toBe(403);

    asRole("partner_expert");
    expect((await GET(bankRequest())).status).toBe(403);

    asRole("media", "disabled");
    expect((await GET(bankRequest())).status).toBe(403);

    expect(getMediaFromGoogleSheetsMock).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(null);

    expect((await GET(bankRequest())).status).toBe(401);
  });

  it("returns an empty list outside the workspace of the Sheets source", async () => {
    asRole("admin", "active", "autre-workspace");

    const response = await GET(bankRequest());
    const payload = (await response.json()) as { ok: boolean; lots: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.lots).toEqual([]);
    expect(getMediaFromGoogleSheetsMock).not.toHaveBeenCalled();
  });

  it("hides the server details on an unexpected failure", async () => {
    asRole("admin");
    getMediaFromGoogleSheetsMock.mockRejectedValue(new Error("Sheets credentials missing at /secret/path"));

    const response = await GET(bankRequest());
    const payload = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(payload.message).toBe("Impossible de charger la banque medias.");
    expect(JSON.stringify(payload)).not.toContain("/secret/path");
  });
});

describe("media bank proxy access", () => {
  it("opens the media bank API to the media role in read only", () => {
    expect(isMediaAllowedApi("/api/media-bank", "GET")).toBe(true);

    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(isMediaAllowedApi("/api/media-bank", method)).toBe(false);
    }
  });

  it("keeps the media bank closed to the athlete role", () => {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      expect(isAthleteAllowedRoute("/api/media-bank", method)).toBe(false);
    }
  });

  it("leaves the other media API routes untouched", () => {
    expect(isMediaAllowedApi("/api/media-requests", "POST")).toBe(true);
    expect(isMediaAllowedApi("/api/media-subjects", "GET")).toBe(true);
    expect(isMediaAllowedApi("/api/media-subjects", "POST")).toBe(false);
    expect(isMediaAllowedApi("/api/media-bankoups", "POST")).toBe(true);
  });
});
