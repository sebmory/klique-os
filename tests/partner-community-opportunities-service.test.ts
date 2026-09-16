import { beforeEach, describe, expect, it, vi } from "vitest";

const { createContentStorageClientMock, getCurrentUserAccessProfileMock, sqlMock } = vi.hoisted(() => ({
  createContentStorageClientMock: vi.fn(),
  getCurrentUserAccessProfileMock: vi.fn(),
  sqlMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: () => "klique-os",
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

import { loadPartnerCommunityOpportunities } from "@/lib/hub-opportunities/service";

const opportunityRow = {
  id: "opportunity-1",
  workspace_id: "workspace-a",
  title: "Collaboration partenaire",
  type: "Partenariat",
  organization: "KLIQUE",
  target_audience: "partner_expert",
  sport_or_domain: "Communication",
  location: "Lausanne",
  date: "2026-10-10",
  deadline: "2026-10-01",
  description: "Description publique",
  requirements: "Prérequis publics",
  practical_info: "Informations pratiques",
  status: "Ouverte",
  author_clerk_user_id: "user_admin_secret",
  interest_count: 12,
  created_at: "2026-09-16T10:00:00.000Z",
  updated_at: "2026-09-16T11:00:00.000Z",
};

const sqlText = (call: unknown[]): string => (call[0] as TemplateStringsArray).join(" ").toLowerCase();

const asPartner = (overrides: Record<string, unknown> = {}) => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "user_partner" },
    userAccess: {
      role: "partner_expert",
      status: "active",
      workspaceId: "workspace-a",
      ...overrides,
    },
  });
};

describe("partner community opportunities service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createContentStorageClientMock.mockReturnValue(sqlMock);
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join(" ").toLowerCase();
      if (text.includes("from hub_opportunities") && text.includes("target_audience")) {
        return [opportunityRow];
      }
      return [];
    });
  });

  it("filters by session workspace, published statuses and exact partner_expert audience", async () => {
    asPartner();

    await loadPartnerCommunityOpportunities(new Request("http://localhost/api/partner/opportunities"));

    const selectCall = sqlMock.mock.calls.find((call) =>
      sqlText(call).includes("from hub_opportunities") && sqlText(call).includes("target_audience"),
    );
    expect(selectCall?.[1]).toBe("workspace-a");
    expect(selectCall?.[2]).toEqual(["Ouverte", "Bientôt", "Fermée"]);
    expect(selectCall?.[3]).toBe("partner_expert");
    expect(sqlText(selectCall ?? [])).toContain("o.target_audience =");
    expect(sqlText(selectCall ?? [])).not.toMatch(/lower\s*\(|\blike\b|\bilike\b/);
  });

  it("returns only consultation fields", async () => {
    asPartner();

    const opportunities = await loadPartnerCommunityOpportunities(
      new Request("http://localhost/api/partner/opportunities"),
    );

    expect(opportunities).toEqual([{
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
    }]);
    expect(Object.keys(opportunities[0])).toEqual([
      "id",
      "title",
      "type",
      "organization",
      "sportOrDomain",
      "location",
      "date",
      "deadline",
      "description",
      "requirements",
      "practicalInfo",
      "status",
    ]);
  });

  it.each([
    { role: "athlete", status: "active", workspaceId: "workspace-a" },
    { role: "partner_expert", status: "disabled", workspaceId: "workspace-a" },
    { role: "partner_expert", status: "active", workspaceId: "" },
  ])("refuses access without an active partner workspace: %o", async (userAccess) => {
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_partner" },
      userAccess,
    });

    await expect(loadPartnerCommunityOpportunities(
      new Request("http://localhost/api/partner/opportunities"),
    )).rejects.toThrow("Forbidden");
    expect(sqlMock).not.toHaveBeenCalled();
  });
});