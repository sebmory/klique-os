import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createContentStorageClientMock,
  getCurrentUserAccessProfileMock,
  getEcosystemPartnersFrom06PartenairesMock,
  sqlMock,
} = vi.hoisted(() => ({
  createContentStorageClientMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
  getEcosystemPartnersFrom06PartenairesMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

vi.mock("@/lib/google-sheets", () => ({
  getEcosystemPartnersFrom06Partenaires: getEcosystemPartnersFrom06PartenairesMock,
}));

import {
  PartnerBenefitAdminError,
  createAdminPartnerBenefit,
  deactivateAdminPartnerBenefit,
  listAdminPartnerBenefits,
  normalizePartnerBenefitDate,
  normalizePartnerBenefitUsagePolicy,
  updateAdminPartnerBenefit,
  type PartnerBenefitAdminDependencies,
  type PartnerBenefitAdminRepository,
} from "@/lib/partner-benefits/admin-service";

const request = new Request("http://localhost/admin/partner-benefits");
const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";
const inactivePartnerId = "c54c63e1-9ad3-475b-a526-568c6f1fcbbc";
const benefitId = "a4ed0d44-36d6-48e3-b399-28f6ac9e2538";

const benefitRow = (overrides: Record<string, unknown> = {}) => ({
  id: benefitId,
  workspace_id: "workspace-session",
  partner_id: partnerId,
  title: "Bilan personnalisé",
  details: "Une séance individuelle.",
  usage_policy: "once_per_membership",
  valid_from: "2026-10-01T00:00:00.000Z",
  expires_at: "2027-10-01T00:00:00.000Z",
  status: "active",
  created_at: "2026-09-22T10:00:00.000Z",
  updated_at: "2026-09-22T10:00:00.000Z",
  ...overrides,
});

const createRepository = (): PartnerBenefitAdminRepository => ({
  list: vi.fn().mockResolvedValue([benefitRow()]),
  create: vi.fn().mockResolvedValue(benefitRow()),
  update: vi.fn().mockResolvedValue(benefitRow()),
  deactivate: vi.fn().mockResolvedValue(benefitRow({ status: "inactive" })),
});

const createDependencies = (repository = createRepository()): PartnerBenefitAdminDependencies => ({
  repository,
  getPartners: vi.fn().mockResolvedValue([
    { id: partnerId, name: "Test expert Klique", status: "Actif" },
    { id: inactivePartnerId, name: "Avec Rachel", status: "Inactif" },
  ]),
});

describe("partner benefits Admin service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_admin" },
      userAccess: {
        role: "admin",
        status: "active",
        workspaceId: "workspace-session",
      },
    });
    createContentStorageClientMock.mockReturnValue(sqlMock);
  });

  it.each([
    null,
    { clerkUser: { id: "user_admin" }, userAccess: { role: "admin", status: "disabled", workspaceId: "workspace-session" } },
    { clerkUser: { id: "user_partner" }, userAccess: { role: "partner_expert", status: "active", workspaceId: "workspace-session" } },
    { clerkUser: { id: "user_admin" }, userAccess: { role: "admin", status: "active", workspaceId: "" } },
  ])("refuses every caller without an active Admin workspace", async (profile) => {
    getCurrentUserAccessProfileMock.mockResolvedValue(profile);
    const dependencies = createDependencies();

    await expect(listAdminPartnerBenefits(request, undefined, dependencies)).rejects.toMatchObject({ code: "forbidden" });
    expect(dependencies.repository.list).not.toHaveBeenCalled();
  });

  it("lists the session workspace and applies the optional partner UUID filter", async () => {
    const dependencies = createDependencies();

    const all = await listAdminPartnerBenefits(request, undefined, dependencies);
    const filtered = await listAdminPartnerBenefits(request, partnerId, dependencies);

    expect(all).toHaveLength(1);
    expect(dependencies.repository.list).toHaveBeenNthCalledWith(1, "workspace-session", undefined);
    expect(dependencies.repository.list).toHaveBeenNthCalledWith(2, "workspace-session", partnerId);
    expect(dependencies.getPartners).toHaveBeenCalledOnce();
  });

  it("creates an advantage for an active UUID partner using only the session workspace", async () => {
    const repository = createRepository();
    const dependencies = createDependencies(repository);

    await createAdminPartnerBenefit(request, {
      partnerId,
      title: "  Bilan personnalisé  ",
      details: " Une séance individuelle. ",
      usagePolicy: "once_per_membership",
      validFrom: "2026-10-01T00:00:00Z",
      expiresAt: "2027-10-01T00:00:00Z",
    }, dependencies);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-session",
      partnerId,
      title: "Bilan personnalisé",
      details: "Une séance individuelle.",
      usagePolicy: "once_per_membership",
      validFrom: "2026-10-01T00:00:00.000Z",
      expiresAt: "2027-10-01T00:00:00.000Z",
      status: "active",
    }));
  });

  it.each([
    ["row-7", "validation"],
    [inactivePartnerId, "partner_not_found"],
    ["4aad304e-fa7b-4fe7-86e4-d1280b3e911a", "partner_not_found"],
  ])("rejects a non-canonical, inactive or unknown partner: %s", async (candidate, code) => {
    const dependencies = createDependencies();

    await expect(createAdminPartnerBenefit(request, {
      partnerId: candidate,
      title: "Offre",
      details: "Détails",
      usagePolicy: "unlimited",
      validFrom: "2026-10-01T00:00:00Z",
    }, dependencies)).rejects.toMatchObject({ code });
    expect(dependencies.repository.create).not.toHaveBeenCalled();
  });

  it("strictly validates policies and chronological ISO dates", async () => {
    expect(() => normalizePartnerBenefitUsagePolicy("once")).toThrow(PartnerBenefitAdminError);
    expect(() => normalizePartnerBenefitDate("2026-10-01", "validFrom")).toThrow(PartnerBenefitAdminError);
    const dependencies = createDependencies();

    await expect(createAdminPartnerBenefit(request, {
      partnerId,
      title: "Offre",
      details: "Détails",
      usagePolicy: "once_lifetime",
      validFrom: "2027-10-01T00:00:00Z",
      expiresAt: "2026-10-01T00:00:00Z",
    }, dependencies)).rejects.toMatchObject({ code: "validation" });
    expect(dependencies.repository.create).not.toHaveBeenCalled();
  });

  it("updates only editable fields with workspace and partner bounds", async () => {
    const repository = createRepository();
    const dependencies = createDependencies(repository);

    await updateAdminPartnerBenefit(request, partnerId, benefitId, {
      title: "Nouvelle offre",
      usagePolicy: "unlimited",
      validFrom: "2026-11-01T00:00:00Z",
      expiresAt: null,
      status: "inactive",
    }, dependencies);

    expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-session",
      partnerId,
      benefitId,
      title: { set: true, value: "Nouvelle offre" },
      usagePolicy: { set: true, value: "unlimited" },
      expiresAt: { set: true, value: null },
      status: { set: true, value: "inactive" },
    }));
  });

  it("deactivates through an UPDATE scoped by workspace, partner and benefit", async () => {
    const repository = createRepository();
    const dependencies = createDependencies(repository);

    const result = await deactivateAdminPartnerBenefit(request, partnerId, benefitId, dependencies);

    expect(result.status).toBe("inactive");
    expect(repository.deactivate).toHaveBeenCalledWith("workspace-session", partnerId, benefitId);
  });

  it("contains no SQL deletion and scopes concrete update queries by workspace and partner", async () => {
    const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
    sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join(" ").toLowerCase();
      sqlCalls.push({ text, values });
      if (text.includes("update partner_benefits")) return [benefitRow({ status: "inactive" })];
      return [benefitRow()];
    });
    getEcosystemPartnersFrom06PartenairesMock.mockResolvedValue([
      { id: partnerId, name: "Test expert Klique", status: "Actif" },
    ]);

    await listAdminPartnerBenefits(request, partnerId);
    await deactivateAdminPartnerBenefit(request, partnerId, benefitId);

    expect(sqlCalls.every((call) => !call.text.includes("delete from partner_benefits"))).toBe(true);
    for (const call of sqlCalls) {
      expect(call.text).toContain("workspace_id =");
      expect(call.text).toContain("partner_id =");
      expect(call.values).toContain("workspace-session");
      expect(call.values).toContain(partnerId);
    }
  });
});