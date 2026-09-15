import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getAccessMock, listRequestsMock, listAthletesMock } = vi.hoisted(() => ({
  getAccessMock: vi.fn(),
  listRequestsMock: vi.fn(),
  listAthletesMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getAccessMock,
}));

vi.mock("@/lib/contact-requests/service", () => ({
  contactRequestMessageMaxLength: 3000,
  contactRequestSubjectMaxLength: 150,
  createPartnerAthleteIntroduction: vi.fn(),
  listPartnerAthleteIntroductions: listRequestsMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getEcosystemPartnersFrom06Partenaires: vi.fn(),
  getPublicAthleteDirectoryFromGoogleSheets: listAthletesMock,
  getPublicAthleteProfileFromGoogleSheets: vi.fn(),
}));

import { GET } from "@/app/api/partner/contact-requests/route";

const request = () => new NextRequest("http://localhost/api/partner/contact-requests");

describe("GET /api/partner/contact-requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccessMock.mockResolvedValue({
      userAccess: {
        role: "partner_expert",
        status: "active",
        workspaceId: " workspace-1 ",
        partnerId: " partner-1 ",
      },
    });
    listRequestsMock.mockResolvedValue([{
      id: "request-1",
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      partnerId: "partner-1",
      requestKind: "partner_athlete_introduction",
      category: "other",
      subject: "Sponsoring",
      message: "Échange autour du projet.",
      status: "pending",
      createdAt: "2026-09-15T10:00:00.000Z",
      updatedAt: "2026-09-15T10:00:00.000Z",
    }]);
    listAthletesMock.mockResolvedValue([{ athleteId: "athlete-1", name: "Mila Martin" }]);
  });

  it("returns only the session partner requests without tenant identifiers", async () => {
    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listRequestsMock).toHaveBeenCalledWith("workspace-1", "partner-1");
    expect(payload.contactRequests).toEqual([{
      id: "request-1",
      athleteId: "athlete-1",
      athleteName: "Mila Martin",
      subject: "Sponsoring",
      message: "Échange autour du projet.",
      status: "pending",
      createdAt: "2026-09-15T10:00:00.000Z",
    }]);
    expect(payload.contactRequests[0]).not.toHaveProperty("workspaceId");
    expect(payload.contactRequests[0]).not.toHaveProperty("partnerId");
  });

  it("rejects access outside an active partner session", async () => {
    getAccessMock.mockResolvedValue({
      userAccess: { role: "admin", status: "active", workspaceId: "workspace-1", partnerId: null },
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(listRequestsMock).not.toHaveBeenCalled();
    expect(listAthletesMock).not.toHaveBeenCalled();
  });
});