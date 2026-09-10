import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMediaFromGoogleSheetsMock } = vi.hoisted(() => ({
  getMediaFromGoogleSheetsMock: vi.fn(),
}));

vi.mock("@/lib/google-sheets", () => ({
  getMediaFromGoogleSheets: getMediaFromGoogleSheetsMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: vi.fn(),
  getDefaultWorkspaceId: () => "klique-os",
}));

import {
  MediaBankForbiddenError,
  hasMediaUsageRights,
  listMediaBankLots,
  type MediaBankAccessContext,
} from "@/lib/media-bank/service";
import type { MediaLot } from "@/types/media";

const adminAccess: MediaBankAccessContext = { workspaceId: "klique-os", role: "admin", isAdmin: true };
const mediaAccess: MediaBankAccessContext = { workspaceId: "klique-os", role: "media", isAdmin: false };
const otherWorkspaceAccess: MediaBankAccessContext = { workspaceId: "autre-workspace", role: "admin", isAdmin: true };

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
  driveLink: "https://drive.google.com/drive/folders/abc",
  lastUse: "22.07.2026",
  associatedContent: "Portrait",
  rights: "KLIQUE + athlète + médias",
  notes: "Note interne confidentielle",
  ...overrides,
});

describe("media bank rights", () => {
  it("keeps only rights explicitly mentioning media or press", () => {
    expect(hasMediaUsageRights("KLIQUE + athlète + médias")).toBe(true);
    expect(hasMediaUsageRights("Cession presse")).toBe(true);
    expect(hasMediaUsageRights("MEDIA")).toBe(true);
    expect(hasMediaUsageRights("Usage media autorisé")).toBe(true);

    expect(hasMediaUsageRights("KLIQUE + athlète")).toBe(false);
    expect(hasMediaUsageRights("Interne uniquement")).toBe(false);
    expect(hasMediaUsageRights("mediateur")).toBe(false);
    expect(hasMediaUsageRights("")).toBe(false);
    expect(hasMediaUsageRights(null)).toBe(false);
  });
});

describe("listMediaBankLots access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMediaFromGoogleSheetsMock.mockResolvedValue([lot()]);
  });

  it("accepts an admin and an active media user", async () => {
    expect(await listMediaBankLots(adminAccess)).toHaveLength(1);
    expect(await listMediaBankLots(mediaAccess)).toHaveLength(1);
  });

  it("refuses any other role", async () => {
    for (const role of ["athlete", "partner_expert", ""]) {
      await expect(
        listMediaBankLots({ ...mediaAccess, role } as unknown as MediaBankAccessContext),
      ).rejects.toBeInstanceOf(MediaBankForbiddenError);
    }
    expect(getMediaFromGoogleSheetsMock).not.toHaveBeenCalled();
  });

  it("returns nothing outside the workspace of the Sheets source", async () => {
    expect(await listMediaBankLots(otherWorkspaceAccess)).toEqual([]);
    expect(getMediaFromGoogleSheetsMock).not.toHaveBeenCalled();
  });
});

describe("listMediaBankLots filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps only lots with a valid https drive link", async () => {
    getMediaFromGoogleSheetsMock.mockResolvedValue([
      lot({ row: 4 }),
      lot({ row: 5, driveLink: "" }),
      lot({ row: 6, driveLink: "http://drive.google.com/folders/abc" }),
      lot({ row: 7, driveLink: "javascript:alert(1)" }),
      lot({ row: 8, driveLink: "   " }),
    ]);

    const lots = await listMediaBankLots(mediaAccess);

    expect(lots.map((entry) => entry.row)).toEqual([4]);
    expect(lots[0].driveLink).toBe("https://drive.google.com/drive/folders/abc");
  });

  it("keeps only lots whose rights mention media or press", async () => {
    getMediaFromGoogleSheetsMock.mockResolvedValue([
      lot({ row: 4, rights: "KLIQUE + athlète + médias" }),
      lot({ row: 5, rights: "Presse suisse" }),
      lot({ row: 6, rights: "KLIQUE + athlète" }),
      lot({ row: 7, rights: "" }),
    ]);

    const lots = await listMediaBankLots(mediaAccess);
    expect(lots.map((entry) => entry.row)).toEqual([4, 5]);
  });
});

describe("listMediaBankLots projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMediaFromGoogleSheetsMock.mockResolvedValue([lot()]);
  });

  it("exposes the public fields only", async () => {
    const [entry] = await listMediaBankLots(mediaAccess);

    expect(entry).toEqual({
      id: "lot-4",
      row: 4,
      date: "18.03.2026",
      athlete: "Loan Cueto",
      sport: "Tennis",
      mediaType: "Photos",
      event: "Portrait KLIQUE",
      place: "Bulle",
      totalFiles: 286,
      orientations: { vertical: 154, horizontal: 132, square: 0 },
      videos: 3,
      rights: "KLIQUE + athlète + médias",
      driveLink: "https://drive.google.com/drive/folders/abc",
    });
  });

  it("never exposes notes, source or internal premium counters", async () => {
    const lots = await listMediaBankLots(adminAccess);
    const serialized = JSON.stringify(lots);

    expect(serialized).not.toContain("Note interne confidentielle");
    expect(serialized).not.toContain("Sébastien Mory");
    expect(Object.keys(lots[0])).not.toContain("notes");
    expect(Object.keys(lots[0])).not.toContain("source");
    expect(Object.keys(lots[0])).not.toContain("premiumTotal");
    expect(Object.keys(lots[0])).not.toContain("premiumUsed");
    expect(Object.keys(lots[0])).not.toContain("premiumRemaining");
    expect(Object.keys(lots[0])).not.toContain("filesUsed");
    expect(Object.keys(lots[0])).not.toContain("filesRemaining");
    expect(Object.keys(lots[0])).not.toContain("favorites");
    expect(Object.keys(lots[0])).not.toContain("lastUse");
    expect(Object.keys(lots[0])).not.toContain("associatedContent");
  });

  it("normalizes texts and negative or invalid counters", async () => {
    getMediaFromGoogleSheetsMock.mockResolvedValue([
      lot({
        row: undefined,
        athlete: "  Mila Benjak  ",
        totalFiles: -5,
        vertical: Number.NaN,
        horizontal: 2.7,
        square: 0,
        videos: -1,
      }),
    ]);

    const [entry] = await listMediaBankLots(mediaAccess);

    expect(entry.id).toBe("lot-index-0");
    expect(entry.row).toBeNull();
    expect(entry.athlete).toBe("Mila Benjak");
    expect(entry.totalFiles).toBe(0);
    expect(entry.orientations).toEqual({ vertical: 0, horizontal: 2, square: 0 });
    expect(entry.videos).toBe(0);
  });

  it("returns an empty list when the sheet has no eligible lot", async () => {
    getMediaFromGoogleSheetsMock.mockResolvedValue([lot({ rights: "KLIQUE + athlète" })]);

    expect(await listMediaBankLots(mediaAccess)).toEqual([]);
  });
});
