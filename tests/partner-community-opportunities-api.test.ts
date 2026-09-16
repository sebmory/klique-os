import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadPartnerCommunityOpportunitiesMock } = vi.hoisted(() => ({
  loadPartnerCommunityOpportunitiesMock: vi.fn(),
}));

vi.mock("@/lib/hub-opportunities/service", () => ({
  loadPartnerCommunityOpportunities: loadPartnerCommunityOpportunitiesMock,
}));

import { GET } from "@/app/api/partner/opportunities/route";

const request = new Request("http://localhost/api/partner/opportunities");

describe("GET /api/partner/opportunities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the consultation opportunities", async () => {
    const opportunity = {
      id: "opportunity-1",
      title: "Collaboration partenaire",
      type: "Partenariat",
      organization: "KLIQUE",
      sportOrDomain: "Communication",
      location: "Lausanne",
      date: "2026-10-10",
      deadline: "2026-10-01",
      description: "Description publique",
      requirements: "Prérequis publics",
      practicalInfo: "Informations pratiques",
      status: "Ouverte",
    };
    loadPartnerCommunityOpportunitiesMock.mockResolvedValue([opportunity]);

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ opportunities: [opportunity] });
  });

  it.each([
    ["Unauthorized", 401],
    ["Forbidden", 403],
  ])("maps %s to HTTP %i", async (message, status) => {
    loadPartnerCommunityOpportunitiesMock.mockRejectedValue(new Error(message));

    const response = await GET(request);

    expect(response.status).toBe(status);
  });
});