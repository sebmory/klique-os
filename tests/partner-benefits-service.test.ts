import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserAccessProfileMock,
  getDefaultWorkspaceIdMock,
  getEcosystemPartnersFrom06PartenairesMock,
} = vi.hoisted(() => ({
  getCurrentUserAccessProfileMock: vi.fn(),
  getDefaultWorkspaceIdMock: vi.fn(),
  getEcosystemPartnersFrom06PartenairesMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  getDefaultWorkspaceId: getDefaultWorkspaceIdMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getEcosystemPartnersFrom06Partenaires: getEcosystemPartnersFrom06PartenairesMock,
}));

import { loadPartnerBenefits } from "@/lib/partner-benefits/service";

const request = new Request("http://localhost/api/partner/benefits");

const asActivePartner = (workspaceId = "workspace-a") => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "user_partner" },
    userAccess: {
      role: "partner_expert",
      status: "active",
      workspaceId,
    },
  });
};

describe("partner benefits service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDefaultWorkspaceIdMock.mockReturnValue("workspace-a");
    asActivePartner();
    getEcosystemPartnersFrom06PartenairesMock.mockResolvedValue([
      {
        id: "partner-1",
        name: "Studio Alpha",
        category: "Bien-être",
        memberOffer: "20% pour les membres",
        benefitDetails: "Sur présentation du pass",
        description: "Récupération sportive",
        logoUrl: "https://cdn.example.com/alpha.png",
        website: "https://alpha.example.com",
        status: "Actif",
        contact: "Contact privé",
        contactName: "Camille Privée",
        email: "private@example.com",
        phone: "+41 00 000 00 00",
        notes: "Note CRM confidentielle",
        lastContact: "2026-09-01",
        nextFollowUp: "2026-10-01",
        nextAction: "Relancer",
      },
      {
        id: "partner-2",
        name: "Partenaire inactif",
        category: "Conseil",
        status: "Inactif",
        email: "inactive@example.com",
      },
    ]);
  });

  it("returns active workspace partners through the exact public projection", async () => {
    const benefits = await loadPartnerBenefits(request);

    expect(benefits).toEqual([{
      id: "partner-1",
      name: "Studio Alpha",
      category: "Bien-être",
      memberOffer: "20% pour les membres",
      benefitDetails: "Sur présentation du pass",
      description: "Récupération sportive",
      logoUrl: "https://cdn.example.com/alpha.png",
      website: "https://alpha.example.com",
    }]);
    expect(Object.keys(benefits[0])).toEqual([
      "id",
      "name",
      "category",
      "memberOffer",
      "benefitDetails",
      "description",
      "logoUrl",
      "website",
    ]);
    expect(getEcosystemPartnersFrom06PartenairesMock).toHaveBeenCalledOnce();
  });

  it.each([
    { role: "athlete", status: "active", workspaceId: "workspace-a" },
    { role: "partner_expert", status: "disabled", workspaceId: "workspace-a" },
    { role: "partner_expert", status: "active", workspaceId: "" },
    { role: "partner_expert", status: "active", workspaceId: "workspace-b" },
  ])("refuses access outside the active partner source workspace: %o", async (userAccess) => {
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_partner" },
      userAccess,
    });

    await expect(loadPartnerBenefits(request)).rejects.toThrow("Forbidden");
    expect(getEcosystemPartnersFrom06PartenairesMock).not.toHaveBeenCalled();
  });

  it("returns Unauthorized without an authenticated Clerk user", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(null);

    await expect(loadPartnerBenefits(request)).rejects.toThrow("Unauthorized");
    expect(getEcosystemPartnersFrom06PartenairesMock).not.toHaveBeenCalled();
  });
});