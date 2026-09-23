import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createContentStorageClientMock, sqlMock, transactionMock } = vi.hoisted(() => {
  const transaction = vi.fn();
  const sql = Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ text: strings.join("?"), values })),
    {
      transaction,
      unsafe: vi.fn((text: string) => ({ text })),
    },
  );
  return {
    createContentStorageClientMock: vi.fn(() => sql),
    sqlMock: sql,
    transactionMock: transaction,
  };
});

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
  getDefaultWorkspaceId: vi.fn(() => "klique-os"),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
}));

import {
  ATHLETE_MEMBERSHIP_PROSPECT_TERMS_VERSION,
  AthleteMembershipProspectOrderError,
  PAID_AWAITING_FORM_MESSAGE,
  cancelAthleteMembershipProspectOrder,
  confirmAthleteMembershipProspectOrderPayment,
  createAthleteMembershipProspectOrder,
  createAthleteMembershipProspectOrderRepository,
  generateAthleteMembershipProspectOrderReference,
  getCurrentAthleteMembershipProspectOrder,
  listAdminAthleteMembershipProspectOrders,
  type AthleteMembershipProspectOrderDependencies,
  type AthleteMembershipProspectOrderRepository,
  type ProspectClerkIdentity,
} from "@/lib/athlete-membership-prospect-orders";

const request = new Request("http://localhost/api/prospect-orders?email=forged@example.test&workspaceId=forged");
const now = new Date("2026-09-23T12:00:00.000Z");
const orderId = "11111111-1111-4111-8111-111111111111";
type OrderRow = NonNullable<Awaited<ReturnType<AthleteMembershipProspectOrderRepository["readCurrentAtomic"]>>>;

const orderRow = (overrides: Partial<OrderRow> = {}): OrderRow => ({
  id: orderId,
  public_reference: "KQ-ABCDEF123456",
  workspace_id: "klique-os",
  clerk_user_id: "user-prospect",
  verified_email: "prospect@example.test",
  full_name: "Lina Morel",
  phone: "+41790000000",
  plan_code: "essential",
  plan_name_snapshot: "Essentiel",
  annual_price_chf_snapshot: "249.00",
  duration_months_snapshot: 12,
  production_credits_snapshot: 1,
  custom_content_credits_snapshot: 2,
  video_allowed_snapshot: false,
  payment_method: "twint_business",
  status: "pending_payment",
  athlete_id: null,
  membership_id: null,
  created_by_clerk_user_id: "user-prospect",
  confirmed_by_clerk_user_id: null,
  activated_by_clerk_user_id: null,
  terms_version: ATHLETE_MEMBERSHIP_PROSPECT_TERMS_VERSION,
  terms_accepted_at: now.toISOString(),
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
  expires_at: "2026-09-30T12:00:00.000Z",
  paid_at: null,
  cancelled_at: null,
  activated_at: null,
  ...overrides,
});

const prospectIdentity: ProspectClerkIdentity = {
  clerkUserId: "user-prospect",
  verifiedEmail: " Prospect@Example.Test ",
};

const adminIdentity: ProspectClerkIdentity = {
  clerkUserId: "user-admin",
  verifiedEmail: "admin@example.test",
};

const repository = (
  overrides: Partial<AthleteMembershipProspectOrderRepository> = {},
): AthleteMembershipProspectOrderRepository => ({
  findActiveAccess: vi.fn().mockResolvedValue(null),
  createAtomic: vi.fn().mockResolvedValue({ outcome: "created", order: orderRow() }),
  readCurrentAtomic: vi.fn().mockResolvedValue(orderRow()),
  cancelAtomic: vi.fn().mockResolvedValue(orderRow({
    status: "cancelled",
    cancelled_at: now.toISOString(),
  })),
  list: vi.fn().mockResolvedValue([orderRow()]),
  confirmAtomic: vi.fn().mockResolvedValue({
    outcome: "confirmed",
    order: orderRow({
      status: "paid_awaiting_form",
      paid_at: now.toISOString(),
      confirmed_by_clerk_user_id: "user-admin",
    }),
  }),
  ...overrides,
});

const dependencies = (
  repositoryValue = repository(),
  identity: ProspectClerkIdentity | null = prospectIdentity,
  overrides: Partial<AthleteMembershipProspectOrderDependencies> = {},
): AthleteMembershipProspectOrderDependencies => ({
  repository: repositoryValue,
  getClerkIdentity: vi.fn().mockResolvedValue(identity),
  getPublicWorkspaceId: vi.fn(() => "klique-os"),
  createId: vi.fn(() => orderId),
  createReference: vi.fn(() => "KQ-ABCDEF123456"),
  now: vi.fn(() => now),
  getTwintPaymentUrl: vi.fn(() => "https://pay.example.test/twint"),
  termsVersion: ATHLETE_MEMBERSHIP_PROSPECT_TERMS_VERSION,
  ...overrides,
});

const validInput = {
  planCode: "essential",
  fullName: " Lina Morel ",
  phone: " +41790000000 ",
  termsAccepted: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.TWINT_BUSINESS_PAYMENT_URL;
});

describe("Prospect membership order identity and creation", () => {
  it("requires an authenticated Clerk account with a verified email", async () => {
    await expect(createAthleteMembershipProspectOrder(request, validInput, dependencies(repository(), null)))
      .rejects.toMatchObject({ code: "unauthorized" });
    await expect(createAthleteMembershipProspectOrder(
      request,
      validInput,
      dependencies(repository(), { clerkUserId: "user-prospect", verifiedEmail: null }),
    )).rejects.toMatchObject({ code: "forbidden" });
  });

  it("normalizes only the verified Clerk email and ignores injected client identity", async () => {
    const repo = repository();
    const forgedInput = {
      ...validInput,
      email: "forged@example.test",
      clerkUserId: "forged-user",
      workspaceId: "forged-workspace",
    };

    await createAthleteMembershipProspectOrder(request, forgedInput, dependencies(repo));

    expect(repo.createAtomic).toHaveBeenCalledWith(expect.objectContaining({
      clerkUserId: "user-prospect",
      verifiedEmail: "prospect@example.test",
      workspaceId: "klique-os",
    }));
  });

  it("allows a prospect without user_access and never creates one", async () => {
    const repo = repository();
    await createAthleteMembershipProspectOrder(request, validInput, dependencies(repo));

    expect(repo.findActiveAccess).toHaveBeenCalledWith("user-prospect");
    expect(repo.createAtomic).toHaveBeenCalledOnce();
  });

  it("refuses active Athlete access with the Athlete Pass direction", async () => {
    const repo = repository({
      findActiveAccess: vi.fn().mockResolvedValue({ role: "athlete", workspaceId: "klique-os" }),
    });

    await expect(createAthleteMembershipProspectOrder(request, validInput, dependencies(repo)))
      .rejects.toThrow("/athlete/pass");
    expect(repo.createAtomic).not.toHaveBeenCalled();
  });

  it.each(["admin", "partner_expert", "media"] as const)("refuses an active %s role", async (role) => {
    const repo = repository({
      findActiveAccess: vi.fn().mockResolvedValue({ role, workspaceId: "klique-os" }),
    });

    await expect(createAthleteMembershipProspectOrder(request, validInput, dependencies(repo)))
      .rejects.toMatchObject({ code: "forbidden" });
    expect(repo.createAtomic).not.toHaveBeenCalled();
  });

  it("requires explicit consent and records the server terms version and timestamp", async () => {
    const repo = repository();
    await expect(createAthleteMembershipProspectOrder(
      request,
      { ...validInput, termsAccepted: false },
      dependencies(repo),
    )).rejects.toMatchObject({ code: "validation" });

    await createAthleteMembershipProspectOrder(request, validInput, dependencies(repo));
    expect(repo.createAtomic).toHaveBeenCalledWith(expect.objectContaining({
      termsVersion: ATHLETE_MEMBERSHIP_PROSPECT_TERMS_VERSION,
      termsAcceptedAt: now.toISOString(),
    }));
  });

  it("returns catalog snapshots and normalized contact data", async () => {
    const result = await createAthleteMembershipProspectOrder(request, validInput, dependencies());

    expect(result).toMatchObject({
      creationOutcome: "created",
      verifiedEmail: "prospect@example.test",
      fullName: "Lina Morel",
      phone: "+41790000000",
      planCode: "essential",
      planName: "Essentiel",
      annualPriceChf: 249,
      durationMonths: 12,
      productionCredits: 1,
      customContentCredits: 2,
      videoAllowed: false,
    });
  });

  it("rejects Founder before querying the catalog", async () => {
    const repo = repository();
    await expect(createAthleteMembershipProspectOrder(
      request,
      { ...validInput, planCode: "founder" },
      dependencies(repo),
    )).rejects.toMatchObject({ code: "validation" });
    expect(repo.createAtomic).not.toHaveBeenCalled();
  });

  it("reuses the same live plan and blocks a plan change", async () => {
    const reusedRepo = repository({
      createAtomic: vi.fn().mockResolvedValue({ outcome: "reused", order: orderRow() }),
    });
    const reused = await createAthleteMembershipProspectOrder(request, validInput, dependencies(reusedRepo));
    expect(reused.creationOutcome).toBe("reused");

    const conflictRepo = repository({
      createAtomic: vi.fn().mockResolvedValue({ outcome: "plan_conflict", order: orderRow() }),
    });
    await expect(createAthleteMembershipProspectOrder(
      request,
      { ...validInput, planCode: "impact" },
      dependencies(conflictRepo),
    )).rejects.toMatchObject({ code: "conflict" });
  });

  it("generates a secure reference shape and retries a bounded named collision", async () => {
    expect(generateAthleteMembershipProspectOrderReference()).toMatch(/^KQ-[A-Z0-9]{12}$/);
    const collision = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "athlete_membership_prospect_orders_public_reference_key",
    });
    const createAtomic = vi.fn()
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ outcome: "created", order: orderRow() });
    const createReference = vi.fn()
      .mockReturnValueOnce("KQ-AAAAAAAAAAAA")
      .mockReturnValueOnce("KQ-BBBBBBBBBBBB");

    await createAthleteMembershipProspectOrder(
      request,
      validInput,
      dependencies(repository({ createAtomic }), prospectIdentity, { createReference }),
    );

    expect(createAtomic).toHaveBeenCalledTimes(2);
    expect(createReference).toHaveBeenCalledTimes(2);
  });
});

describe("Prospect membership order persistence", () => {
  it("expires stale pending orders and snapshots only an active commercial plan transactionally", async () => {
    transactionMock.mockResolvedValue([[], [{ outcome: "created", order: orderRow() }]]);
    const repo = createAthleteMembershipProspectOrderRepository();

    await repo.createAtomic({
      id: orderId,
      publicReference: "KQ-ABCDEF123456",
      workspaceId: "klique-os",
      clerkUserId: "user-prospect",
      verifiedEmail: "prospect@example.test",
      fullName: "Lina Morel",
      phone: null,
      planCode: "essential",
      termsVersion: ATHLETE_MEMBERSHIP_PROSPECT_TERMS_VERSION,
      termsAcceptedAt: now.toISOString(),
      now: now.toISOString(),
    });

    const [queries, options] = transactionMock.mock.calls[0];
    expect(options).toEqual({ isolationLevel: "Serializable" });
    expect(queries).toHaveLength(2);
    expect(queries[0].text).toContain("SET status = 'expired'");
    expect(queries[1].text).toContain("FROM membership_plans");
    expect(queries[1].text).toContain("active = TRUE");
    expect(queries[1].text).toContain("code IN ('essential', 'impact', 'signature')");
    expect(queries[1].text).toContain("plan.annual_price_chf");
    expect(queries[1].text).toContain("plan.production_credits");
    expect(queries[1].text).toContain("plan.custom_content_credits");
    expect(queries[1].text).toContain("plan.video_allowed");
    expect(queries[1].text).toContain("INTERVAL '7 days'");
    expect(queries[1].text).toContain("terms_version");
    expect(queries[1].text).not.toContain("'founder'");
  });
});

describe("Prospect membership order read and cancellation", () => {
  it("scopes reads to the connected Clerk owner and expires pending orders first", async () => {
    const repo = repository();
    const result = await getCurrentAthleteMembershipProspectOrder(request, dependencies(repo));

    expect(repo.readCurrentAtomic).toHaveBeenCalledWith("klique-os", "user-prospect", now.toISOString());
    expect(result).not.toHaveProperty("clerkUserId");
    expect(result).not.toHaveProperty("createdByClerkUserId");
    expect(result).not.toHaveProperty("confirmedByClerkUserId");
  });

  it("shows the manual follow-up after verified payment", async () => {
    const repo = repository({
      readCurrentAtomic: vi.fn().mockResolvedValue(orderRow({
        status: "paid_awaiting_form",
        paid_at: now.toISOString(),
        confirmed_by_clerk_user_id: "user-admin",
      })),
    });
    const result = await getCurrentAthleteMembershipProspectOrder(request, dependencies(repo));
    expect(result?.statusMessage).toBe(PAID_AWAITING_FORM_MESSAGE);
  });

  it("returns a valid TWINT URL and propagates invalid configuration", async () => {
    const valid = await getCurrentAthleteMembershipProspectOrder(request, dependencies());
    expect(valid?.twintPaymentUrl).toBe("https://pay.example.test/twint");

    await expect(getCurrentAthleteMembershipProspectOrder(
      request,
      dependencies(repository(), prospectIdentity, {
        getTwintPaymentUrl: () => { throw new AthleteMembershipProspectOrderError("configuration", "TWINT invalide"); },
      }),
    )).rejects.toMatchObject({ code: "configuration" });
  });

  it("cancels only the owner's pending order and treats all other states as terminal", async () => {
    const repo = repository();
    await cancelAthleteMembershipProspectOrder(request, orderId, dependencies(repo));
    expect(repo.cancelAtomic).toHaveBeenCalledWith(orderId, "klique-os", "user-prospect", now.toISOString());

    for (const status of ["paid_awaiting_form", "activated", "cancelled", "expired"] as const) {
      const terminalRepo = repository({ cancelAtomic: vi.fn().mockResolvedValue(null) });
      await expect(cancelAthleteMembershipProspectOrder(request, orderId, dependencies(terminalRepo)))
        .rejects.toMatchObject({ code: "conflict" });
      expect(terminalRepo.cancelAtomic).toHaveBeenCalledWith(orderId, "klique-os", "user-prospect", now.toISOString());
      expect(status).toBeTruthy();
    }
  });
});

describe("Admin prospect membership orders", () => {
  const adminRepository = (overrides: Partial<AthleteMembershipProspectOrderRepository> = {}) => repository({
    findActiveAccess: vi.fn().mockResolvedValue({ role: "admin", workspaceId: "admin-workspace" }),
    ...overrides,
  });

  it("lists only the Admin session workspace with normalized filters and no Clerk identifiers", async () => {
    const repo = adminRepository();
    const result = await listAdminAthleteMembershipProspectOrders(request, {
      status: "pending_payment",
      email: " Prospect@Example.Test ",
      planCode: "essential",
    }, dependencies(repo, adminIdentity));

    expect(repo.list).toHaveBeenCalledWith("admin-workspace", {
      status: "pending_payment",
      email: "prospect@example.test",
      planCode: "essential",
    });
    expect(result[0]).toMatchObject({ verifiedEmail: "prospect@example.test", fullName: "Lina Morel" });
    expect(result[0]).not.toHaveProperty("clerkUserId");
    expect(result[0]).not.toHaveProperty("confirmedByClerkUserId");
  });

  it("confirms payment to paid_awaiting_form and is idempotent on a second confirmation", async () => {
    const confirmedOrder = orderRow({
      status: "paid_awaiting_form",
      paid_at: now.toISOString(),
      confirmed_by_clerk_user_id: "user-admin",
    });
    const firstRepo = adminRepository({
      confirmAtomic: vi.fn().mockResolvedValue({ outcome: "confirmed", order: confirmedOrder }),
    });
    const first = await confirmAthleteMembershipProspectOrderPayment(
      request,
      orderId,
      dependencies(firstRepo, adminIdentity),
    );
    expect(first).toMatchObject({ alreadyConfirmed: false, order: { status: "paid_awaiting_form" } });
    expect(firstRepo.confirmAtomic).toHaveBeenCalledWith({
      orderId,
      workspaceId: "admin-workspace",
      adminClerkUserId: "user-admin",
      now: now.toISOString(),
    });

    const secondRepo = adminRepository({
      confirmAtomic: vi.fn().mockResolvedValue({ outcome: "already_confirmed", order: confirmedOrder }),
    });
    const second = await confirmAthleteMembershipProspectOrderPayment(
      request,
      orderId,
      dependencies(secondRepo, adminIdentity),
    );
    expect(second.alreadyConfirmed).toBe(true);
  });

  it("rejects expired and terminal orders", async () => {
    for (const [outcome, code] of [["expired", "expired"], ["not_pending", "conflict"]] as const) {
      const repo = adminRepository({
        confirmAtomic: vi.fn().mockResolvedValue({ outcome, order: orderRow({ status: "expired" }) }),
      });
      await expect(confirmAthleteMembershipProspectOrderPayment(request, orderId, dependencies(repo, adminIdentity)))
        .rejects.toMatchObject({ code });
    }
  });

  it("uses one serializable locking update without creating memberships, credits, or access", async () => {
    transactionMock.mockResolvedValue([[{
      outcome: "confirmed",
      order: orderRow({ status: "paid_awaiting_form", paid_at: now.toISOString() }),
    }]]);
    const repo = createAthleteMembershipProspectOrderRepository();

    await repo.confirmAtomic({
      orderId,
      workspaceId: "klique-os",
      adminClerkUserId: "user-admin",
      now: now.toISOString(),
    });

    const [queries, options] = transactionMock.mock.calls[0];
    expect(options).toEqual({ isolationLevel: "Serializable" });
    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain("FOR UPDATE");
    expect(queries[0].text).toContain("SET status = 'paid_awaiting_form'");
    expect(queries[0].text).toContain("confirmed_by_clerk_user_id");
    expect(queries[0].text).not.toContain("INSERT INTO athlete_memberships");
    expect(queries[0].text).not.toContain("INSERT INTO athlete_credit_movements");
    expect(queries[0].text).not.toContain("INSERT INTO user_access");
  });

  it("propagates a transaction failure so the complete confirmation rolls back", async () => {
    const failure = new Error("confirmation transaction failed");
    transactionMock.mockRejectedValue(failure);
    const repo = createAthleteMembershipProspectOrderRepository();

    await expect(repo.confirmAtomic({
      orderId,
      workspaceId: "klique-os",
      adminClerkUserId: "user-admin",
      now: now.toISOString(),
    })).rejects.toBe(failure);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(transactionMock.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
  });
});