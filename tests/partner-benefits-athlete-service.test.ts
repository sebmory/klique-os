import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createContentStorageClientMock,
  getCurrentUserAccessProfileMock,
  getEcosystemPartnersFrom06PartenairesMock,
  sqlMock,
  transactionMock,
} = vi.hoisted(() => {
  const transaction = vi.fn();
  const sql = Object.assign(vi.fn(), { transaction });
  return {
    createContentStorageClientMock: vi.fn(() => sql),
    getCurrentUserAccessProfileMock: vi.fn(),
    getEcosystemPartnersFrom06PartenairesMock: vi.fn(),
    sqlMock: sql,
    transactionMock: transaction,
  };
});

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
  cancelAthletePartnerBenefitReservation,
  listAthletePartnerBenefits,
  reserveAthletePartnerBenefit,
  type AthletePartnerBenefitDependencies,
  type AthletePartnerBenefitRepository,
} from "@/lib/partner-benefits/athlete-service";

const request = new Request("http://localhost/api/athlete/partner-benefits");
const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";
const inactivePartnerId = "c54c63e1-9ad3-475b-a526-568c6f1fcbbc";
const benefitId = "a4ed0d44-36d6-48e3-b399-28f6ac9e2538";
const reservationId = "bc38cd69-3112-4273-9ba5-86d9ef6e91ba";

const membershipRow = {
  id: "membership-athlete-1",
  workspace_id: "workspace-session",
  athlete_id: "athlete-session",
  starts_at: "2026-01-01T00:00:00.000Z",
  ends_at: "2027-01-01T00:00:00.000Z",
};

const benefitRow = (overrides: Record<string, unknown> = {}) => ({
  id: benefitId,
  partner_id: partnerId,
  title: "Bilan personnalisé",
  details: "Une séance individuelle.",
  usage_policy: "once_per_membership",
  valid_from: "2026-01-01T00:00:00.000Z",
  expires_at: "2027-06-01T00:00:00.000Z",
  availability: "available",
  personal_status: "available",
  active_reservation_id: null,
  ...overrides,
});

const reservationRow = (overrides: Record<string, unknown> = {}) => ({
  id: reservationId,
  workspace_id: "workspace-session",
  benefit_id: benefitId,
  partner_id: partnerId,
  athlete_id: "athlete-session",
  membership_id: "membership-athlete-1",
  membership_starts_at: "2026-01-01T00:00:00.000Z",
  membership_ends_at: "2027-01-01T00:00:00.000Z",
  usage_policy: "once_per_membership",
  usage_scope_key: "membership-athlete-1",
  status: "reserved",
  reserved_at: "2026-09-22T10:00:00.000Z",
  cancelled_at: null,
  expires_at: "2027-01-01T00:00:00.000Z",
  ...overrides,
});

const createDependencies = (overrides: Partial<AthletePartnerBenefitRepository> = {}) => {
  const repository: AthletePartnerBenefitRepository = {
    findActiveMembership: vi.fn().mockResolvedValue(membershipRow),
    list: vi.fn().mockResolvedValue([benefitRow()]),
    reserve: vi.fn().mockResolvedValue(reservationRow()),
    cancel: vi.fn().mockResolvedValue(reservationRow({ status: "cancelled", cancelled_at: "2026-09-22T11:00:00.000Z" })),
    ...overrides,
  };
  const ids = [reservationId, "dde28b59-f093-42ab-9786-a7fd6b6e84fe"];
  const dependencies: AthletePartnerBenefitDependencies = {
    repository,
    getPartners: vi.fn().mockResolvedValue([
      { id: partnerId, name: "Test expert Klique", status: "Actif" },
      { id: inactivePartnerId, name: "Avec Rachel", status: "Inactif" },
    ]),
    createId: vi.fn(() => ids.shift() ?? "e20281ae-975b-44e8-9386-129ef33b7a25"),
  };
  return { dependencies, repository };
};

const asActiveAthlete = () => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "user-athlete", email: "athlete@example.test" },
    userAccess: {
      role: "athlete",
      status: "active",
      workspaceId: "workspace-session",
      athleteId: "athlete-session",
    },
  });
};

describe("Athlete partner benefits service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asActiveAthlete();
  });

  it.each([
    null,
    { clerkUser: { id: "user-athlete" }, userAccess: { role: "athlete", status: "disabled", workspaceId: "workspace-session", athleteId: "athlete-session" } },
    { clerkUser: { id: "user-admin" }, userAccess: { role: "admin", status: "active", workspaceId: "workspace-session", athleteId: null } },
    { clerkUser: { id: "user-athlete" }, userAccess: { role: "athlete", status: "active", workspaceId: "", athleteId: "athlete-session" } },
  ])("refuses access without an active Athlete identity", async (profile) => {
    getCurrentUserAccessProfileMock.mockResolvedValue(profile);
    const { dependencies, repository } = createDependencies();

    await expect(listAthletePartnerBenefits(request, dependencies)).rejects.toMatchObject({ code: "forbidden" });
    expect(repository.findActiveMembership).not.toHaveBeenCalled();
  });

  it("requires an active membership before listing or reserving", async () => {
    const { dependencies, repository } = createDependencies({ findActiveMembership: vi.fn().mockResolvedValue(null) });

    await expect(listAthletePartnerBenefits(request, dependencies)).rejects.toMatchObject({ code: "membership_required" });
    await expect(reserveAthletePartnerBenefit(request, { benefitId }, dependencies)).rejects.toMatchObject({ code: "membership_required" });
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.reserve).not.toHaveBeenCalled();
  });

  it("lists active-workspace benefits with personal policy availability", async () => {
    const rows = [
      benefitRow({ usage_policy: "once_lifetime", availability: "already_used_lifetime", personal_status: "used" }),
      benefitRow({ id: "dde28b59-f093-42ab-9786-a7fd6b6e84fe", usage_policy: "once_per_membership", availability: "already_used_membership", personal_status: "used" }),
      benefitRow({ id: "e20281ae-975b-44e8-9386-129ef33b7a25", usage_policy: "unlimited", availability: "available" }),
      benefitRow({ id: "3aaa67b0-a041-4268-9c19-747b9c4ed6ee", usage_policy: "unlimited", availability: "already_reserved", personal_status: "reserved", active_reservation_id: reservationId }),
    ];
    const { dependencies, repository } = createDependencies({ list: vi.fn().mockResolvedValue(rows) });

    const result = await listAthletePartnerBenefits(request, dependencies);

    expect(result.map((item) => [item.usagePolicy, item.availability, item.available])).toEqual([
      ["once_lifetime", "already_used_lifetime", false],
      ["once_per_membership", "already_used_membership", false],
      ["unlimited", "available", true],
      ["unlimited", "already_reserved", false],
    ]);
    expect(result.map((item) => item.personalStatus)).toEqual(["used", "used", "available", "reserved"]);
    expect(repository.list).toHaveBeenCalledWith(
      "workspace-session",
      "athlete-session",
      "membership-athlete-1",
      [partnerId],
    );
  });

  it("reserves with session identity and frozen membership data", async () => {
    const { dependencies, repository } = createDependencies();

    const reservation = await reserveAthletePartnerBenefit(request, { benefitId }, dependencies);

    expect(repository.reserve).toHaveBeenCalledWith(expect.objectContaining({
      reservationId,
      workspaceId: "workspace-session",
      athleteId: "athlete-session",
      actorClerkUserId: "user-athlete",
      benefitId,
      activePartnerIds: [partnerId],
      membership: {
        id: "membership-athlete-1",
        workspaceId: "workspace-session",
        athleteId: "athlete-session",
        startsAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2027-01-01T00:00:00.000Z",
      },
    }));
    expect(reservation.status).toBe("reserved");
  });

  it("derives active partner scope without accepting a client partner identity", async () => {
    const { dependencies, repository } = createDependencies({ reserve: vi.fn().mockResolvedValue(null) });
    await expect(reserveAthletePartnerBenefit(request, { benefitId }, dependencies))
      .rejects.toMatchObject({ code: "unavailable" });
    expect(repository.reserve).toHaveBeenCalledWith(expect.objectContaining({
      benefitId,
      activePartnerIds: [partnerId],
    }));
    expect(repository.reserve).not.toHaveBeenCalledWith(expect.objectContaining({ partnerId: expect.anything() }));
  });

  it.each(["40001", "23505"])("maps PostgreSQL race %s to a conflict", async (code) => {
    const { dependencies } = createDependencies({
      reserve: vi.fn().mockRejectedValue(Object.assign(new Error("concurrent reservation"), { code })),
    });

    await expect(reserveAthletePartnerBenefit(request, { benefitId }, dependencies))
      .rejects.toMatchObject({ code: "conflict" });
  });

  it("cancels only the current Athlete reserved entry in an active partner scope", async () => {
    const { dependencies, repository } = createDependencies();

    const reservation = await cancelAthletePartnerBenefitReservation(request, reservationId, dependencies);

    expect(repository.cancel).toHaveBeenCalledWith({
      eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      workspaceId: "workspace-session",
      athleteId: "athlete-session",
      actorClerkUserId: "user-athlete",
      reservationId,
      activePartnerIds: [partnerId],
    });
    expect(reservation.status).toBe("cancelled");
  });

  it("uses one SERIALIZABLE transaction for reservation, event and partner notifications", async () => {
    const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
    sqlMock.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = { text: strings.join(" ").toLowerCase(), values };
      sqlCalls.push(query);
      if (query.text.includes("from athlete_memberships") && !query.text.includes("for update")) {
        return Promise.resolve([membershipRow]);
      }
      return query;
    });
    transactionMock.mockResolvedValue([
      [{ id: membershipRow.id }],
      [{ id: benefitId }],
      [reservationRow()],
      [],
      [],
    ]);
    getEcosystemPartnersFrom06PartenairesMock.mockResolvedValue([
      { id: partnerId, name: "Test expert Klique", status: "Actif" },
    ]);

    await reserveAthletePartnerBenefit(request, { benefitId });

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(transactionMock.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
    const queries = transactionMock.mock.calls[0][0] as Array<{ text: string }>;
    const sql = queries.map((query) => query.text).join("\n");
    expect(sql).toContain("insert into partner_benefit_reservations");
    expect(sql).toContain("membership_starts_at");
    expect(sql).toContain("membership_ends_at");
    expect(sql).toContain("benefit.usage_policy");
    expect(sql).toContain("least(membership.ends_at, benefit.expires_at)");
    expect(sql).toContain("existing.status = 'reserved'");
    expect(sql).toContain("existing.status = 'used'");
    expect(sql).toContain("insert into partner_benefit_reservation_events");
    expect(sql).toContain("null, 'reserved'");
    expect(sql).toContain("insert into notifications");
    expect(sql).toContain("access.role = 'partner_expert'");
    expect(sql).toContain("access.status = 'active'");
    expect(sql).toContain("access.partner_id = reservation.partner_id::text");
    expect(sql).not.toContain("set status = 'used'");
  });
});