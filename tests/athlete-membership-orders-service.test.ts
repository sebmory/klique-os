import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUserAccessProfileMock, createContentStorageClientMock, getAthletesFromGoogleSheetsMock, sqlMock, transactionMock } = vi.hoisted(() => {
  const transaction = vi.fn();
  const sql = Object.assign(vi.fn(), {
    transaction,
    unsafe: vi.fn((text: string) => ({ text })),
  });
  return {
    getCurrentUserAccessProfileMock: vi.fn(),
    createContentStorageClientMock: vi.fn(() => sql),
    getAthletesFromGoogleSheetsMock: vi.fn(),
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
  getAthletesFromGoogleSheets: getAthletesFromGoogleSheetsMock,
}));

import {
  AthleteMembershipOrderError,
  cancelAthleteMembershipOrder,
  confirmAthleteMembershipOrder,
  createAthleteMembershipOrder,
  generateAthleteMembershipOrderReference,
  getCurrentAthleteMembershipOrder,
  listAdminAthleteMembershipOrders,
  resolveTwintBusinessPaymentUrl,
  type AthleteMembershipOrderDependencies,
  type AthleteMembershipOrderRepository,
} from "@/lib/athlete-membership-orders";

const request = new Request("http://localhost/api/orders");
const now = new Date("2026-09-22T12:00:00.000Z");
type OrderRowFixture = NonNullable<Awaited<ReturnType<AthleteMembershipOrderRepository["readCurrentAtomic"]>>>;
const orderRow = (overrides: Partial<OrderRowFixture> = {}): OrderRowFixture => ({
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "klique-os",
  athlete_id: "athlete-1",
  public_reference: "KQ-ABCDEF123456",
  plan_code: "essential" as const,
  plan_name_snapshot: "Essentiel",
  annual_price_chf_snapshot: "249.00",
  duration_months_snapshot: 12,
  production_credits_snapshot: 1,
  custom_content_credits_snapshot: 2,
  video_allowed_snapshot: false,
  payment_method: "twint_business",
  status: "pending",
  membership_id: null,
  expires_at: "2026-09-29T12:00:00.000Z",
  paid_at: null,
  cancelled_at: null,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
  ...overrides,
});

const athleteProfile = {
  clerkUser: { id: "user-athlete", email: "athlete@example.test" },
  userAccess: { role: "athlete", status: "active", workspaceId: "klique-os", athleteId: "athlete-1" },
};
const adminProfile = {
  clerkUser: { id: "user-admin", email: "admin@example.test" },
  userAccess: { role: "admin", status: "active", workspaceId: "klique-os", athleteId: null },
};

const repository = (overrides: Partial<AthleteMembershipOrderRepository> = {}): AthleteMembershipOrderRepository => ({
  createAtomic: vi.fn().mockResolvedValue({ outcome: "created", order: orderRow() }),
  readCurrentAtomic: vi.fn().mockResolvedValue(orderRow()),
  cancelAtomic: vi.fn().mockResolvedValue(orderRow({ status: "cancelled", cancelled_at: now.toISOString() })),
  list: vi.fn().mockResolvedValue([orderRow()]),
  confirmAtomic: vi.fn().mockResolvedValue({
    outcome: "paid",
    order: orderRow({ status: "paid", membership_id: "membership-1", paid_at: now.toISOString() }),
    membershipId: "membership-1",
  }),
  ...overrides,
});

const dependencies = (
  repositoryValue = repository(),
  profile: typeof athleteProfile | typeof adminProfile | null = athleteProfile,
  overrides: Partial<AthleteMembershipOrderDependencies> = {},
): AthleteMembershipOrderDependencies => ({
  repository: repositoryValue,
  getAccessProfile: vi.fn().mockResolvedValue(profile) as AthleteMembershipOrderDependencies["getAccessProfile"],
  getAthleteNames: vi.fn().mockResolvedValue(new Map([["athlete-1", "Athlète Un"]])),
  createId: vi.fn()
    .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
    .mockReturnValueOnce("22222222-2222-4222-8222-222222222222")
    .mockReturnValueOnce("33333333-3333-4333-8333-333333333333"),
  createReference: vi.fn().mockReturnValue("KQ-ABCDEF123456"),
  now: () => now,
  getTwintPaymentUrl: () => "https://pay.example.test/twint",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserAccessProfileMock.mockResolvedValue(athleteProfile);
  getAthletesFromGoogleSheetsMock.mockResolvedValue([]);
});

afterEach(() => {
  delete process.env.TWINT_BUSINESS_PAYMENT_URL;
});

describe("Athlete membership order creation", () => {
  it("uses catalog snapshots returned by the atomic repository", async () => {
    const result = await createAthleteMembershipOrder(request, { planCode: "essential" }, dependencies());

    expect(result).toMatchObject({
      planCode: "essential",
      planName: "Essentiel",
      annualPriceChf: 249,
      durationMonths: 12,
      productionCredits: 1,
      customContentCredits: 2,
      videoAllowed: false,
    });
  });

  it("expires old pending rows and snapshots only an active commercial catalog plan in one transaction", async () => {
    process.env.TWINT_BUSINESS_PAYMENT_URL = "https://pay.example.test/twint";
    sqlMock.mockImplementation((strings: TemplateStringsArray) => ({ text: strings.join("?") }));
    transactionMock.mockResolvedValue([[{ outcome: "created", order: orderRow() }]]);

    await createAthleteMembershipOrder(request, { planCode: "essential" });

    const [queries, options] = transactionMock.mock.calls[0];
    expect(options).toEqual({ isolationLevel: "Serializable" });
    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain("SET status = 'expired'");
    expect(queries[0].text).toContain("FROM membership_plans");
    expect(queries[0].text).toContain("active = TRUE");
    expect(queries[0].text).toContain("plan.annual_price_chf");
    expect(queries[0].text).toContain("plan.production_credits");
    expect(queries[0].text).toContain("plan.custom_content_credits");
    expect(queries[0].text).toContain("INTERVAL '7 days'");
  });

  it("rejects Founder and an existing active membership", async () => {
    for (const outcome of ["founder", "membership_conflict"] as const) {
      const repo = repository({ createAtomic: vi.fn().mockResolvedValue({ outcome, order: null }) });
      await expect(createAthleteMembershipOrder(request, { planCode: "essential" }, dependencies(repo)))
        .rejects.toMatchObject({ code: "conflict" });
    }
  });

  it("reuses an identical pending order", async () => {
    const repo = repository({ createAtomic: vi.fn().mockResolvedValue({ outcome: "reused", order: orderRow() }) });
    const result = await createAthleteMembershipOrder(request, { planCode: "essential" }, dependencies(repo));

    expect(result.id).toBe(orderRow().id);
    expect(repo.createAtomic).toHaveBeenCalledOnce();
  });

  it("requires cancellation before changing a pending plan", async () => {
    const repo = repository({ createAtomic: vi.fn().mockResolvedValue({ outcome: "plan_conflict", order: orderRow() }) });
    await expect(createAthleteMembershipOrder(request, { planCode: "impact" }, dependencies(repo)))
      .rejects.toThrow("Annulez la commande pending");
  });

  it("allows creation after the repository expires the previous pending order", async () => {
    const createAtomic = vi.fn().mockResolvedValue({ outcome: "created", order: orderRow({ plan_code: "impact", plan_name_snapshot: "Impact" }) });
    const result = await createAthleteMembershipOrder(request, { planCode: "impact" }, dependencies(repository({ createAtomic })));

    expect(result.planCode).toBe("impact");
    expect(createAtomic).toHaveBeenCalledWith(expect.objectContaining({ now: now.toISOString() }));
  });

  it("generates the required public reference format", () => {
    expect(generateAthleteMembershipOrderReference()).toMatch(/^KQ-[A-Z0-9]{12}$/);
  });

  it("retries only a named public-reference 23505 collision", async () => {
    const collision = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "athlete_membership_orders_public_reference_idx",
    });
    const createAtomic = vi.fn()
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ outcome: "created", order: orderRow() });
    const createReference = vi.fn().mockReturnValueOnce("KQ-AAAAAAAAAAAA").mockReturnValueOnce("KQ-BBBBBBBBBBBB");

    await createAthleteMembershipOrder(request, { planCode: "essential" }, dependencies(repository({ createAtomic }), athleteProfile, { createReference }));

    expect(createAtomic).toHaveBeenCalledTimes(2);
    expect(createReference).toHaveBeenCalledTimes(2);
  });
});

describe("Athlete membership order read and cancellation", () => {
  it("scopes reads to session workspace and athlete and hides Admin identifiers", async () => {
    const repo = repository();
    const result = await getCurrentAthleteMembershipOrder(request, dependencies(repo));

    expect(repo.readCurrentAtomic).toHaveBeenCalledWith("klique-os", "athlete-1", now.toISOString());
    expect(result).not.toHaveProperty("confirmedByClerkUserId");
    expect(result).not.toHaveProperty("createdByClerkUserId");
  });

  it("scopes cancellation to the session athlete and only accepts pending", async () => {
    const repo = repository();
    await cancelAthleteMembershipOrder(request, orderRow().id, dependencies(repo));
    expect(repo.cancelAtomic).toHaveBeenCalledWith(orderRow().id, "klique-os", "athlete-1", now.toISOString());

    const terminalRepo = repository({ cancelAtomic: vi.fn().mockResolvedValue(null) });
    await expect(cancelAthleteMembershipOrder(request, orderRow().id, dependencies(terminalRepo)))
      .rejects.toMatchObject({ code: "conflict" });
  });

  it("rejects forged identity by deriving scope exclusively from Clerk", async () => {
    const repo = repository();
    await getCurrentAthleteMembershipOrder(new Request("http://localhost?workspaceId=forged&athleteId=forged"), dependencies(repo));
    expect(repo.readCurrentAtomic).toHaveBeenCalledWith("klique-os", "athlete-1", expect.any(String));
  });

  it("rejects a missing, non-HTTPS or malformed TWINT URL without exposing it", () => {
    expect(() => resolveTwintBusinessPaymentUrl()).toThrow(AthleteMembershipOrderError);
    process.env.TWINT_BUSINESS_PAYMENT_URL = "http://secret.example.test/pay";
    expect(() => resolveTwintBusinessPaymentUrl()).toThrow("temporairement indisponible");
    process.env.TWINT_BUSINESS_PAYMENT_URL = "not-a-secret-url";
    expect(() => resolveTwintBusinessPaymentUrl()).toThrow("temporairement indisponible");
  });

  it("returns a valid HTTPS TWINT URL", () => {
    process.env.TWINT_BUSINESS_PAYMENT_URL = "https://pay.example.test/twint";
    expect(resolveTwintBusinessPaymentUrl()).toBe("https://pay.example.test/twint");
  });
});

describe("Admin membership orders", () => {
  it("lists only the session workspace with filters and athlete names", async () => {
    const repo = repository();
    const result = await listAdminAthleteMembershipOrders(request, {
      status: "pending",
      athleteId: "athlete-1",
      planCode: "essential",
    }, dependencies(repo, adminProfile));

    expect(repo.list).toHaveBeenCalledWith("klique-os", {
      status: "pending",
      athleteId: "athlete-1",
      planCode: "essential",
    });
    expect(result[0]).toMatchObject({ athleteName: "Athlète Un", publicReference: "KQ-ABCDEF123456" });
  });

  it("confirms into a membership and exactly two snapshot credit movements in one serializable transaction", async () => {
    getCurrentUserAccessProfileMock.mockResolvedValue(adminProfile);
    sqlMock.mockImplementation((strings: TemplateStringsArray) => ({ text: strings.join("?") }));
    transactionMock.mockResolvedValue([[{ outcome: "paid", order: orderRow({
      status: "paid",
      membership_id: "22222222-2222-4222-8222-222222222222",
      paid_at: now.toISOString(),
    }), membershipId: "22222222-2222-4222-8222-222222222222" }]]);

    const result = await confirmAthleteMembershipOrder(request, orderRow().id);

    expect(result.alreadyPaid).toBe(false);
    expect(transactionMock).toHaveBeenCalledOnce();
    const [queries, options] = transactionMock.mock.calls[0];
    expect(options).toEqual({ isolationLevel: "Serializable" });
    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain("FOR UPDATE");
    expect(queries[0].text).toContain("INSERT INTO athlete_memberships");
    expect(queries[0].text).toContain("'twint_manual_order'");
    expect(queries[0].text).toContain("INSERT INTO athlete_credit_movements");
    expect(queries[0].text).toContain("locked.production_credits_snapshot");
    expect(queries[0].text).toContain("locked.custom_content_credits_snapshot");
    expect(queries[0].text).toContain("COUNT(*) = 2");
  });

  it("returns an already-paid order idempotently", async () => {
    const repo = repository({ confirmAtomic: vi.fn().mockResolvedValue({
      outcome: "already_paid",
      order: orderRow({ status: "paid", membership_id: "membership-1", paid_at: now.toISOString() }),
      membershipId: "membership-1",
    }) });
    const result = await confirmAthleteMembershipOrder(request, orderRow().id, dependencies(repo, adminProfile));
    expect(result).toMatchObject({ membershipId: "membership-1", alreadyPaid: true });
  });

  it("persists expiration and rejects confirmation", async () => {
    const repo = repository({ confirmAtomic: vi.fn().mockResolvedValue({
      outcome: "expired",
      order: orderRow({ status: "expired" }),
      membershipId: null,
    }) });
    await expect(confirmAthleteMembershipOrder(request, orderRow().id, dependencies(repo, adminProfile)))
      .rejects.toMatchObject({ code: "expired" });
  });

  it("does not convert unique or concurrency conflicts into a second credit grant", async () => {
    for (const code of ["23505", "40001"]) {
      const confirmAtomic = vi.fn().mockRejectedValue(Object.assign(new Error("database conflict"), { code }));
      await expect(confirmAthleteMembershipOrder(request, orderRow().id, dependencies(repository({ confirmAtomic }), adminProfile)))
        .rejects.toMatchObject({ code });
      expect(confirmAtomic).toHaveBeenCalledOnce();
    }
  });

  it("rolls the complete confirmation back when the repository transaction fails", async () => {
    const state = { memberships: 0, credits: 0, status: "pending" };
    const confirmAtomic = vi.fn(async () => {
      const transactionState = { memberships: 1, credits: 1, status: "pending" };
      if (transactionState.credits !== 2) throw new Error("incomplete credit grant");
      return { outcome: "paid" as const, order: orderRow({ status: "paid" }), membershipId: "membership-1" };
    });

    await expect(confirmAthleteMembershipOrder(request, orderRow().id, dependencies(repository({ confirmAtomic }), adminProfile)))
      .rejects.toThrow("incomplete credit grant");
    expect(state).toEqual({ memberships: 0, credits: 0, status: "pending" });
  });
});
