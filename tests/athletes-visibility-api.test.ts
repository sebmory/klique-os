import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Athlete } from "@/types/athlete";

const {
  evaluateBusinessAccessMock,
  getCurrentUserAccessProfileMock,
  getAthletesFromGoogleSheetsMock,
} = vi.hoisted(() => ({
  evaluateBusinessAccessMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
  getAthletesFromGoogleSheetsMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  evaluateBusinessAccess: evaluateBusinessAccessMock,
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getAthletesFromGoogleSheets: getAthletesFromGoogleSheetsMock,
  updateAthleteInGoogleSheets: vi.fn(),
  addAthleteToGoogleSheets: vi.fn(),
  rejectFormEntry: vi.fn(),
}));

import { GET } from "@/app/api/athletes/route";

const athlete = (key: string, name: string): Athlete => ({ key, athleteId: key, name } as Athlete);
const athletes = [athlete("seb-mory", "Séb Mory"), athlete("athlete-1", "Mila Martin")];

const asRole = (role: string, athleteId: string | null = null) => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    userAccess: { role, athleteId },
  });
  evaluateBusinessAccessMock.mockResolvedValue({ allowed: true, reason: "allowed" });
};

describe("GET /api/athletes seb-mory visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAthletesFromGoogleSheetsMock.mockResolvedValue(athletes);
  });

  it("keeps seb-mory visible to an Admin", async () => {
    asRole("admin");

    const response = await GET(new NextRequest("http://localhost/api/athletes"));
    const payload = await response.json();

    expect(payload.athletes.map((item: Athlete) => item.key)).toEqual(["seb-mory", "athlete-1"]);
  });

  it("keeps seb-mory visible to its own Athlete account", async () => {
    asRole("athlete", "seb-mory");

    const response = await GET(new NextRequest("http://localhost/api/athletes"));
    const payload = await response.json();

    expect(payload.athletes.map((item: Athlete) => item.key)).toEqual(["seb-mory"]);
  });

  it("does not expose seb-mory to another Athlete account", async () => {
    asRole("athlete", "athlete-1");

    const response = await GET(new NextRequest("http://localhost/api/athletes"));
    const payload = await response.json();

    expect(payload.athletes.map((item: Athlete) => item.key)).toEqual(["athlete-1"]);
  });
});