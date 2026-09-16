import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getCurrentUserPermissionContextMock,
  getPublicAthleteDirectoryMock,
  getPublicAthleteProfileMock,
} = vi.hoisted(() => ({
  getCurrentUserPermissionContextMock: vi.fn(),
  getPublicAthleteDirectoryMock: vi.fn(),
  getPublicAthleteProfileMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserPermissionContext: getCurrentUserPermissionContextMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getPublicAthleteDirectoryFromGoogleSheets: getPublicAthleteDirectoryMock,
  getPublicAthleteProfileFromGoogleSheets: getPublicAthleteProfileMock,
}));

vi.mock("@/lib/athlete-distinctions/service", () => ({
  listAthleteDistinctions: vi.fn(),
}));

vi.mock("@/lib/contact-requests/service", () => ({
  hasPendingPartnerAthleteIntroduction: vi.fn(),
}));

import { GET as getDirectory } from "@/app/api/partner/athletes/route";
import { GET as getProfile } from "@/app/api/partner/athletes/[athleteId]/route";

describe("partner athletes seb-mory visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserPermissionContextMock.mockResolvedValue({
      isPartnerExpert: true,
      isActive: true,
      partnerId: "partner-1",
      workspaceId: "workspace-1",
    });
  });

  it("excludes seb-mory from the partner directory", async () => {
    getPublicAthleteDirectoryMock.mockResolvedValue([
      { athleteId: "seb-mory", name: "Séb Mory" },
      { athleteId: "athlete-1", name: "Mila Martin" },
    ]);

    const response = await getDirectory(new NextRequest("http://localhost/api/partner/athletes"));
    const payload = await response.json();

    expect(payload.athletes).toEqual([{ athleteId: "athlete-1", name: "Mila Martin" }]);
  });

  it("returns 404 before loading a direct seb-mory profile", async () => {
    const response = await getProfile(
      new NextRequest("http://localhost/api/partner/athletes/seb-mory"),
      { params: Promise.resolve({ athleteId: "seb-mory" }) },
    );

    expect(response.status).toBe(404);
    expect(getPublicAthleteProfileMock).not.toHaveBeenCalled();
  });
});