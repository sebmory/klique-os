import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createContentStorageClientMock,
  getCurrentUserAccessProfileMock,
  sqlMock,
  transactionMock,
} = vi.hoisted(() => {
  const transaction = vi.fn();
  const sql = Object.assign(vi.fn(), { transaction });
  return {
    createContentStorageClientMock: vi.fn(() => sql),
    getCurrentUserAccessProfileMock: vi.fn(),
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

import {
  cancelPartnerBenefitReservation,
  listPartnerBenefitReservations,
  markPartnerBenefitReservationUsed,
  type PartnerBenefitReservationDependencies,
  type PartnerBenefitReservationRepository,
  type PartnerBenefitReservationStatus,
} from "@/lib/partner-benefits/partner-reservation-service";

const request = new Request("http://localhost/api/partner/benefit-reservations");
const workspaceId = "workspace-session";
const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";
const reservationId = "bc38cd69-3112-4273-9ba5-86d9ef6e91ba";
const benefitId = "a4ed0d44-36d6-48e3-b399-28f6ac9e2538";

const reservationRow = (
  status: PartnerBenefitReservationStatus = "reserved",
  overrides: Record<string, unknown> = {},
) => ({
  id: reservationId,
  benefit_id: benefitId,
  partner_id: partnerId,
  athlete_id: "athlete-session",
  membership_id: "membership-session",
  benefit_title: "Bilan personnalisé",
  benefit_details: "Une séance individuelle.",
  usage_policy: "once_per_membership",
  status,
  reserved_at: "2026-09-20T10:00:00.000Z",
  used_at: status === "used" ? "2026-09-22T10:00:00.000Z" : null,
  cancelled_at: status === "cancelled" ? "2026-09-22T10:00:00.000Z" : null,
  expires_at: "2027-01-01T00:00:00.000Z",
  ...overrides,
});

const asActivePartner = (overrides: Record<string, unknown> = {}) => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "clerk-partner-session" },
    userAccess: {
      role: "partner_expert",
      status: "active",
      workspaceId,
      partnerId,
      ...overrides,
    },
  });
};

const createDependencies = (overrides: Partial<PartnerBenefitReservationRepository> = {}) => {
  const repository: PartnerBenefitReservationRepository = {
    list: vi.fn().mockResolvedValue([]),
    transition: vi.fn().mockResolvedValue({ row: reservationRow("used"), currentStatus: "used" }),
    ...overrides,
  };
  const dependencies: PartnerBenefitReservationDependencies = { repository };
  return { dependencies, repository };
};

describe("Partner benefit reservation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asActivePartner();
  });

  it.each([
    null,
    { clerkUser: { id: "clerk-partner" }, userAccess: { role: "athlete", status: "active", workspaceId, partnerId } },
    { clerkUser: { id: "clerk-partner" }, userAccess: { role: "partner_expert", status: "disabled", workspaceId, partnerId } },
    { clerkUser: { id: "clerk-partner" }, userAccess: { role: "partner_expert", status: "active", workspaceId: "", partnerId } },
    { clerkUser: { id: "clerk-partner" }, userAccess: { role: "partner_expert", status: "active", workspaceId, partnerId: "legacy-partner-id" } },
  ])("requires active partner_expert access with a UUID partnerId", async (profile) => {
    getCurrentUserAccessProfileMock.mockResolvedValue(profile);
    const { dependencies, repository } = createDependencies();

    await expect(listPartnerBenefitReservations(request, dependencies)).rejects.toMatchObject({ code: "forbidden" });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("lists only the workspace and partner identity derived from the session", async () => {
    const { dependencies, repository } = createDependencies({
      list: vi.fn().mockResolvedValue([
        reservationRow("reserved"),
        reservationRow("used", { id: "dde28b59-f093-42ab-9786-a7fd6b6e84fe" }),
        reservationRow("cancelled", { id: "e20281ae-975b-44e8-9386-129ef33b7a25" }),
        reservationRow("expired", { id: "3aaa67b0-a041-4268-9c19-747b9c4ed6ee" }),
      ]),
    });

    const groups = await listPartnerBenefitReservations(request, dependencies);

    expect(repository.list).toHaveBeenCalledWith({
      workspaceId,
      partnerId,
      actorClerkUserId: "clerk-partner-session",
    });
    expect(groups.reserved).toHaveLength(1);
    expect(groups.used).toHaveLength(1);
    expect(groups.cancelled).toHaveLength(1);
    expect(groups.expired).toHaveLength(1);
    expect(Object.keys(groups)).toEqual(["reserved", "used", "cancelled", "expired"]);
  });

  it("marks an owned reserved reservation as definitively used", async () => {
    const { dependencies, repository } = createDependencies();

    const result = await markPartnerBenefitReservationUsed(request, reservationId, dependencies);

    expect(repository.transition).toHaveBeenCalledWith(
      { workspaceId, partnerId, actorClerkUserId: "clerk-partner-session" },
      reservationId,
      "used",
    );
    expect(result.status).toBe("used");
    expect(result.usedAt).toBe("2026-09-22T10:00:00.000Z");
  });

  it("cancels an owned reserved reservation after refusal or cancellation", async () => {
    const { dependencies, repository } = createDependencies({
      transition: vi.fn().mockResolvedValue({ row: reservationRow("cancelled"), currentStatus: "cancelled" }),
    });

    const result = await cancelPartnerBenefitReservation(request, reservationId, dependencies);

    expect(repository.transition).toHaveBeenCalledWith(
      { workspaceId, partnerId, actorClerkUserId: "clerk-partner-session" },
      reservationId,
      "cancelled",
    );
    expect(result.status).toBe("cancelled");
  });

  it.each(["used", "cancelled", "expired"] as const)(
    "refuses every transition from terminal status %s",
    async (status) => {
      const { dependencies } = createDependencies({
        transition: vi.fn().mockResolvedValue({ row: null, currentStatus: status }),
      });

      await expect(markPartnerBenefitReservationUsed(request, reservationId, dependencies))
        .rejects.toMatchObject({ code: "terminal" });
      await expect(cancelPartnerBenefitReservation(request, reservationId, dependencies))
        .rejects.toMatchObject({ code: "terminal" });
    },
  );

  it("does not reveal reservations outside the session partner scope", async () => {
    const { dependencies } = createDependencies({
      transition: vi.fn().mockResolvedValue({ row: null, currentStatus: null }),
    });

    await expect(markPartnerBenefitReservationUsed(request, reservationId, dependencies))
      .rejects.toMatchObject({ code: "not_found" });
  });

  it.each(["40001", "23505"])("maps PostgreSQL conflict %s", async (code) => {
    const { dependencies } = createDependencies({
      transition: vi.fn().mockRejectedValue(Object.assign(new Error("race"), { code })),
    });

    await expect(markPartnerBenefitReservationUsed(request, reservationId, dependencies))
      .rejects.toMatchObject({ code: "conflict" });
  });

  it("validates the reservation UUID before reaching the repository", async () => {
    const { dependencies, repository } = createDependencies();

    await expect(markPartnerBenefitReservationUsed(request, "other-partner-reservation", dependencies))
      .rejects.toMatchObject({ code: "validation" });
    expect(repository.transition).not.toHaveBeenCalled();
  });
});

describe("Partner benefit reservation SQL repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asActivePartner();
    sqlMock.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => ({
      text: strings.join(" ").toLowerCase(),
      values,
    }));
  });

  it("expires owned overdue reservations before listing and records event plus Athlete notification", async () => {
    transactionMock.mockResolvedValue([[], [reservationRow("expired")]]);

    const groups = await listPartnerBenefitReservations(request);

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(transactionMock.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
    const queries = transactionMock.mock.calls[0][0] as Array<{ text: string; values: unknown[] }>;
    expect(queries).toHaveLength(2);
    expect(queries[0].text).toContain("set status = 'expired'");
    expect(queries[0].text).toContain("reservation.status = 'reserved'");
    expect(queries[0].text).toContain("reservation.expires_at <= now()");
    expect(queries[0].text).toContain("insert into partner_benefit_reservation_events");
    expect(queries[0].text).toContain("'partner_expert', 'reserved', 'expired'");
    expect(queries[0].text).toContain("insert into notifications");
    expect(queries[0].text).toContain("access.role = 'athlete'");
    expect(queries[0].text).toContain("access.athlete_id = expired.athlete_id");
    expect(queries[0].values).toContain(workspaceId);
    expect(queries[0].values).toContain(partnerId);
    expect(queries[0].values).toContain("clerk-partner-session");
    expect(queries[1].text).toContain("reservation.workspace_id =");
    expect(queries[1].text).toContain("reservation.partner_id =");
    expect(groups.expired).toHaveLength(1);
  });

  it.each(["used", "cancelled"] as const)(
    "expires first then atomically transitions reserved to %s with journal and Athlete notification",
    async (targetStatus) => {
      transactionMock.mockResolvedValue([
        [],
        [reservationRow(targetStatus)],
        [{ status: targetStatus }],
      ]);

      if (targetStatus === "used") {
        await markPartnerBenefitReservationUsed(request, reservationId);
      } else {
        await cancelPartnerBenefitReservation(request, reservationId);
      }

      const queries = transactionMock.mock.calls[0][0] as Array<{ text: string; values: unknown[] }>;
      expect(queries).toHaveLength(3);
      expect(queries[0].text).toContain("set status = 'expired'");
      expect(queries[1].text).toContain("reservation.status = 'reserved'");
      expect(queries[1].text).toContain("reservation.workspace_id =");
      expect(queries[1].text).toContain("reservation.partner_id =");
      expect(queries[1].text).toContain("insert into partner_benefit_reservation_events");
      expect(queries[1].text).toContain("'partner_expert', 'reserved'");
      expect(queries[1].text).toContain("insert into notifications");
      expect(queries[1].text).toContain("access.role = 'athlete'");
      expect(queries[1].text).toContain("access.athlete_id = updated.athlete_id");
      expect(queries[1].values).toContain(targetStatus);
      expect(queries[1].values).toContain("clerk-partner-session");
      expect(queries[2].text).toContain("workspace_id =");
      expect(queries[2].text).toContain("partner_id =");
    },
  );
});