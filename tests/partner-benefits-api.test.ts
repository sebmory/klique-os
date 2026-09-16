import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadPartnerBenefitsMock } = vi.hoisted(() => ({
  loadPartnerBenefitsMock: vi.fn(),
}));

vi.mock("@/lib/partner-benefits/service", () => ({
  loadPartnerBenefits: loadPartnerBenefitsMock,
}));

import { GET } from "@/app/api/partner/benefits/route";

const request = new Request("http://localhost/api/partner/benefits");

describe("GET /api/partner/benefits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the public benefits projection", async () => {
    const benefit = {
      id: "partner-1",
      name: "Studio Alpha",
      category: "Bien-être",
      memberOffer: "20% pour les membres",
      benefitDetails: "Sur présentation du pass",
      description: "Récupération sportive",
      logoUrl: "https://cdn.example.com/alpha.png",
      website: "https://alpha.example.com",
    };
    loadPartnerBenefitsMock.mockResolvedValue([benefit]);

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ benefits: [benefit] });
  });

  it.each([
    ["Unauthorized", 401],
    ["Forbidden", 403],
  ])("maps %s to HTTP %i", async (message, status) => {
    loadPartnerBenefitsMock.mockRejectedValue(new Error(message));

    const response = await GET(request);

    expect(response.status).toBe(status);
  });
});