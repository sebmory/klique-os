import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createContentStorageClientMock,
  getAthletesFromGoogleSheetsMock,
  getCurrentUserAccessProfileMock,
  getEcosystemPartnersFrom06PartenairesMock,
  sqlMock,
} = vi.hoisted(() => ({
  createContentStorageClientMock: vi.fn(),
  getAthletesFromGoogleSheetsMock: vi.fn(),
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
  getAthletesFromGoogleSheets: getAthletesFromGoogleSheetsMock,
  getEcosystemPartnersFrom06Partenaires: getEcosystemPartnersFrom06PartenairesMock,
}));

import {
  listAdminPartnerBenefitReservationAudit,
  type PartnerBenefitReservationAuditDependencies,
} from "@/lib/partner-benefits/admin-reservation-audit-service";

const request = new Request("http://localhost/api/admin/partner-benefit-reservations");
const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";
const benefitId = "a4ed0d44-36d6-48e3-b399-28f6ac9e2538";
const reservationId = "34526bf7-ca5a-43c3-a379-29153678e987";

const reservationRow = () => ({
  id: reservationId,
  workspace_id: "workspace-session",
  partner_id: partnerId,
  athlete_id: "athlete-session",
  benefit_id: benefitId,
  benefit_title: "Bilan personnalisé",
  benefit_details: "Une séance individuelle.",
  usage_policy: "once_per_membership",
  status: "used",
  reserved_at: "2026-09-22T10:00:00.000Z",
  used_at: "2026-09-23T11:00:00.000Z",
  cancelled_at: null,
  expires_at: "2027-09-22T10:00:00.000Z",
  athlete_email: "private@example.com",
  notes: "private notes",
  history: [
    {
      id: "6f3f632b-4a86-4862-a87f-ff767e2f2a26",
      actorClerkUserId: "user_athlete",
      actorRole: "athlete",
      previousStatus: null,
      newStatus: "reserved",
      occurredAt: "2026-09-22T10:00:00.000Z",
      privateMetadata: "hidden",
    },
    {
      id: "f7963501-9e89-4e50-9e2b-a004bb131d22",
      actorClerkUserId: "user_partner",
      actorRole: "partner_expert",
      previousStatus: "reserved",
      newStatus: "used",
      occurredAt: "2026-09-23T11:00:00.000Z",
    },
  ],
});

const createDependencies = (): PartnerBenefitReservationAuditDependencies => ({
  repository: { list: vi.fn().mockResolvedValue([reservationRow()]) },
  getPartners: vi.fn().mockResolvedValue([{ id: partnerId, name: "Studio Horizon" }]),
  getAthletes: vi.fn().mockResolvedValue([{
    athleteId: "athlete-session",
    key: "athlete-session",
    name: "Lina Morel",
  }]),
});

describe("Admin partner benefit reservation audit service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserAccessProfileMock.mockResolvedValue({
      clerkUser: { id: "user_admin" },
      userAccess: { role: "admin", status: "active", workspaceId: "workspace-session" },
    });
    createContentStorageClientMock.mockReturnValue(sqlMock);
    getEcosystemPartnersFrom06PartenairesMock.mockResolvedValue([{ id: partnerId, name: "Studio Horizon" }]);
    getAthletesFromGoogleSheetsMock.mockResolvedValue([{
      athleteId: "athlete-session",
      key: "athlete-session",
      name: "Lina Morel",
    }]);
  });

  it.each([
    null,
    { clerkUser: { id: "user_admin" }, userAccess: { role: "admin", status: "disabled", workspaceId: "workspace-session" } },
    { clerkUser: { id: "user_partner" }, userAccess: { role: "partner_expert", status: "active", workspaceId: "workspace-session" } },
    { clerkUser: { id: "user_admin" }, userAccess: { role: "admin", status: "active", workspaceId: "" } },
  ])("refuses callers without an active Admin workspace", async (profile) => {
    getCurrentUserAccessProfileMock.mockResolvedValue(profile);
    const dependencies = createDependencies();

    await expect(listAdminPartnerBenefitReservationAudit(request, {}, dependencies))
      .rejects.toMatchObject({ code: "forbidden" });
    expect(dependencies.repository.list).not.toHaveBeenCalled();
  });

  it("uses only the session workspace and combines every optional filter", async () => {
    const dependencies = createDependencies();

    await listAdminPartnerBenefitReservationAudit(request, {
      partnerId,
      athleteId: " athlete-session ",
      benefitId,
      status: "USED",
    }, dependencies);

    expect(dependencies.repository.list).toHaveBeenCalledWith("workspace-session", {
      partnerId,
      athleteId: "athlete-session",
      benefitId,
      status: "used",
    });
  });

  it.each([
    [{ partnerId: "partner-row" }],
    [{ athleteId: " " }],
    [{ benefitId: "benefit-row" }],
    [{ status: "pending" }],
  ])("rejects malformed filters before repository access", async (filters) => {
    const dependencies = createDependencies();

    await expect(listAdminPartnerBenefitReservationAudit(request, filters, dependencies))
      .rejects.toMatchObject({ code: "validation" });
    expect(dependencies.repository.list).not.toHaveBeenCalled();
  });

  it("projects ordered transition history without private or workspace fields", async () => {
    const [reservation] = await listAdminPartnerBenefitReservationAudit(request, {}, createDependencies());

    expect(reservation.history.map((event) => event.newStatus)).toEqual(["reserved", "used"]);
    expect(reservation).toEqual(expect.objectContaining({
      id: reservationId,
      partnerId,
      partnerName: "Studio Horizon",
      athleteId: "athlete-session",
      athleteName: "Lina Morel",
      status: "used",
    }));
    expect(reservation).not.toHaveProperty("workspaceId");
    expect(reservation).not.toHaveProperty("athlete_email");
    expect(reservation).not.toHaveProperty("notes");
    expect(reservation.history[0]).not.toHaveProperty("privateMetadata");
  });

  it("executes one read-only workspace-scoped SELECT with ordered events and all filters", async () => {
    const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
    sqlMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls.push({ text: strings.join(" ").toLowerCase(), values });
      return [reservationRow()];
    });

    await listAdminPartnerBenefitReservationAudit(request, {
      partnerId,
      athleteId: "athlete-session",
      benefitId,
      status: "used",
    });

    expect(sqlCalls).toHaveLength(1);
    expect(sqlCalls[0].text.trim().startsWith("select")).toBe(true);
    expect(sqlCalls[0].text).toContain("where reservation.workspace_id =");
    expect(sqlCalls[0].text).toContain("event.workspace_id = reservation.workspace_id");
    expect(sqlCalls[0].text).toContain("order by event.occurred_at asc, event.id asc");
    expect(sqlCalls[0].text).not.toMatch(/\b(insert|update|delete)\b/);
    expect(sqlCalls[0].values).toEqual(expect.arrayContaining([
      "workspace-session", partnerId, "athlete-session", benefitId, "used",
    ]));
  });
});