import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { evaluateBusinessAccessMock, getPartnerAccessStateMock, invitePartnerToKliqueMock, getPartnersMock } = vi.hoisted(() => ({
  evaluateBusinessAccessMock: vi.fn(),
  getPartnerAccessStateMock: vi.fn(),
  invitePartnerToKliqueMock: vi.fn(),
  getPartnersMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  evaluateBusinessAccess: evaluateBusinessAccessMock,
  getPartnerAccessState: getPartnerAccessStateMock,
  invitePartnerToKlique: invitePartnerToKliqueMock,
}));

vi.mock("@/lib/google-sheets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/google-sheets")>();
  return { ...actual, getEcosystemPartnersFrom06Partenaires: getPartnersMock };
});

import { GET, POST } from "@/app/api/partners/invite/route";

const partnerId = "3d216a5b-4594-4c5a-b66b-1338b982a95f";
const partner = { id: partnerId, row: 7, name: "Studio Alpha", email: "alpha@example.com" };

describe("partner invitation UUID identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evaluateBusinessAccessMock.mockResolvedValue({ allowed: true });
    getPartnersMock.mockResolvedValue([partner]);
    getPartnerAccessStateMock.mockResolvedValue({ state: "active", email: "alpha@example.com" });
    invitePartnerToKliqueMock.mockResolvedValue({ ok: true, partnerId, email: "alpha@example.com", clerkInvitationId: "inv_1" });
  });

  it("resolves a legacy row-N lookup to the canonical UUID", async () => {
    const response = await GET(new NextRequest("http://localhost/api/partners/invite?partnerId=row-7"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ partnerId, state: "active" });
    expect(getPartnerAccessStateMock).toHaveBeenCalledWith({
      partnerId,
      email: "alpha@example.com",
      legacyPartnerIds: ["row-7", "7", "Studio Alpha"],
    });
  });

  it("creates new invitations with the UUID when called with a legacy reference", async () => {
    const response = await POST(new NextRequest("http://localhost/api/partners/invite", {
      method: "POST",
      body: JSON.stringify({ partnerId: "row-7" }),
    }));

    expect(response.status).toBe(201);
    expect(invitePartnerToKliqueMock).toHaveBeenCalledWith(expect.any(Request), {
      partnerId,
      email: "alpha@example.com",
      legacyPartnerIds: ["row-7", "7", "Studio Alpha"],
    }, { resend: false });
  });

  it("refuses a new invitation for a legacy row without Partner ID", async () => {
    getPartnersMock.mockResolvedValue([{ ...partner, id: "Studio Alpha" }]);

    const response = await POST(new NextRequest("http://localhost/api/partners/invite", {
      method: "POST",
      body: JSON.stringify({ partnerId: "row-7" }),
    }));

    expect(response.status).toBe(409);
    expect(invitePartnerToKliqueMock).not.toHaveBeenCalled();
  });
});