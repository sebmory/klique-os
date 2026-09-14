import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assignAthleteSubscription,
  AthleteSubscriptionConflictError,
  AthleteSubscriptionNotFoundError,
  AthleteSubscriptionValidationError,
  bulkAssignFounderSubscriptions,
  cancelAthleteSubscription,
  getActiveAthleteSubscription,
  listAthleteSubscriptions,
  type AthleteSubscriptionRepository,
} from "@/lib/athlete-subscriptions/service";

const neonRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
  workspace_id: "workspace-1",
  athlete_id: "athlete-1",
  plan_code: "essentiel",
  status: "active",
  starts_on: "2026-09-14",
  ends_on: "2027-09-14",
  is_founder: false,
  is_complimentary: false,
  price_chf: "249.00",
  discount_percent: "10.00",
  photo_sessions_included: "1",
  media_days_included: "0",
  competition_sessions_included: "0",
  custom_contents_included: "2",
  created_by_clerk_user_id: "user-1",
  created_at: new Date("2026-09-14T08:00:00.000Z"),
  updated_at: "2026-09-14T08:00:00.000Z",
  ...overrides,
});

const repository = (overrides: Partial<AthleteSubscriptionRepository> = {}) => {
  const createdRecords: Array<Parameters<AthleteSubscriptionRepository["create"]>[0]> = [];
  const bulkCreatedRecords: Array<Parameters<AthleteSubscriptionRepository["bulkCreateFounder"]>[0]> = [];
  const value: AthleteSubscriptionRepository = {
    list: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue(null),
    create: vi.fn(async (record) => {
      createdRecords.push(record);
      return neonRow({
        id: record.id,
        workspace_id: record.workspaceId,
        athlete_id: record.athleteId,
        plan_code: record.databasePlanCode,
        starts_on: record.startsOn,
        ends_on: record.endsOn,
        is_founder: record.isFounder,
        is_complimentary: record.isComplimentary,
        price_chf: String(record.priceChf),
        discount_percent: String(record.discountPercent),
        photo_sessions_included: String(record.photoSessionsIncluded),
        media_days_included: String(record.mediaDaysIncluded),
        competition_sessions_included: String(record.competitionSessionsIncluded),
        custom_contents_included: String(record.customContentsIncluded),
        created_by_clerk_user_id: record.createdByClerkUserId,
      });
    }),
    bulkCreateFounder: vi.fn(async (records) => {
      bulkCreatedRecords.push(records);
      return records.map((record: Parameters<AthleteSubscriptionRepository["bulkCreateFounder"]>[0][number]) => neonRow({
        id: record.id,
        workspace_id: record.workspaceId,
        athlete_id: record.athleteId,
        plan_code: "founder",
        starts_on: record.startsOn,
        ends_on: record.endsOn,
        is_founder: true,
        is_complimentary: true,
        price_chf: "0",
        discount_percent: "0",
        photo_sessions_included: "0",
        media_days_included: "0",
        competition_sessions_included: "0",
        custom_contents_included: "0",
        created_by_clerk_user_id: record.createdByClerkUserId,
      }));
    }),
    cancel: vi.fn().mockResolvedValue({ outcome: "not_found", row: null }),
    ...overrides,
  };
  return { value, createdRecords, bulkCreatedRecords };
};

const assign = (
  serviceRepository: AthleteSubscriptionRepository,
  overrides: Record<string, unknown> = {},
) => assignAthleteSubscription({
  workspaceId: " workspace-1 ",
  athleteId: " athlete-1 ",
  planCode: "essential",
  startsOn: "2026-09-14",
  endsOn: "2027-09-14",
  createdByClerkUserId: " user-1 ",
  ...overrides,
} as Parameters<typeof assignAthleteSubscription>[0], serviceRepository);

describe("Athlete subscriptions service", () => {
  it("normalizes Neon dates and numeric values", async () => {
    const serviceRepository = repository({
      list: vi.fn().mockResolvedValue([neonRow()]),
    }).value;

    const [subscription] = await listAthleteSubscriptions(" workspace-1 ", serviceRepository);

    expect(subscription).toMatchObject({
      planCode: "essential",
      startsOn: "2026-09-14",
      endsOn: "2027-09-14",
      priceChf: 249,
      discountPercent: 10,
      photoSessionsIncluded: 1,
      customContentsIncluded: 2,
      createdAt: "2026-09-14T08:00:00.000Z",
    });
    expect(serviceRepository.list).toHaveBeenCalledWith("workspace-1");
  });

  it("normalizes the internal Founder plan from Neon", async () => {
    const serviceRepository = repository({
      list: vi.fn().mockResolvedValue([neonRow({
        plan_code: "founder",
        is_founder: true,
        is_complimentary: true,
        price_chf: "0.00",
        discount_percent: "0.00",
        photo_sessions_included: "0",
        media_days_included: "0",
        competition_sessions_included: "0",
        custom_contents_included: "0",
      })]),
    }).value;

    const [result] = await listAthleteSubscriptions("workspace-1", serviceRepository);

    expect(result).toMatchObject({
      planCode: "founder",
      isFounder: true,
      isComplimentary: true,
      priceChf: 0,
      discountPercent: 0,
      photoSessionsIncluded: 0,
      mediaDaysIncluded: 0,
      competitionSessionsIncluded: 0,
      customContentsIncluded: 0,
    });
  });

  it("scopes the active lookup to the normalized workspace and athlete", async () => {
    const serviceRepository = repository({
      getActive: vi.fn().mockResolvedValue(neonRow()),
    }).value;

    const result = await getActiveAthleteSubscription(
      " workspace-1 ",
      " athlete-1 ",
      serviceRepository,
    );

    expect(result?.id).toBe("49c345aa-fb6e-46e8-83ef-1e07d7b69192");
    expect(serviceRepository.getActive).toHaveBeenCalledWith("workspace-1", "athlete-1");
  });

  it.each([
    ["essential", "essentiel", 249, 10, 1, 0, 0, 2],
    ["impact", "impact", 549, 20, 1, 1, 0, 4],
    ["signature", "signature", 999, 30, 1, 1, 1, 6],
  ] as const)(
    "derives all commercial values for %s exclusively from the catalog",
    async (planCode, databasePlanCode, price, discount, photos, mediaDays, competitions, contents) => {
      const { value, createdRecords } = repository();

      await assign(value, {
        planCode,
        priceChf: 0,
        discountPercent: 100,
        photoSessionsIncluded: 99,
        mediaDaysIncluded: 99,
        competitionSessionsIncluded: 99,
        customContentsIncluded: 99,
      });

      expect(createdRecords[0]).toMatchObject({
        databasePlanCode,
        priceChf: price,
        discountPercent: discount,
        photoSessionsIncluded: photos,
        mediaDaysIncluded: mediaDays,
        competitionSessionsIncluded: competitions,
        customContentsIncluded: contents,
      });
    },
  );

  it("keeps the catalog price for a complimentary subscription", async () => {
    const { value, createdRecords } = repository();

    const result = await assign(value, { isComplimentary: true, priceChf: 0 });

    expect(createdRecords[0]).toMatchObject({ isComplimentary: true, priceChf: 249 });
    expect(result).toMatchObject({ isComplimentary: true, priceChf: 249 });
  });

  it("forces all Founder flags and commercial snapshots from the internal catalog", async () => {
    const { value, createdRecords } = repository();

    const result = await assign(value, {
      planCode: "founder",
      isFounder: false,
      isComplimentary: false,
      priceChf: 999,
      discountPercent: 50,
      photoSessionsIncluded: 10,
      mediaDaysIncluded: 10,
      competitionSessionsIncluded: 10,
      customContentsIncluded: 10,
    });

    expect(createdRecords[0]).toMatchObject({
      databasePlanCode: "founder",
      isFounder: true,
      isComplimentary: true,
      priceChf: 0,
      discountPercent: 0,
      photoSessionsIncluded: 0,
      mediaDaysIncluded: 0,
      competitionSessionsIncluded: 0,
      customContentsIncluded: 0,
    });
    expect(result).toMatchObject({
      planCode: "founder",
      isFounder: true,
      isComplimentary: true,
      priceChf: 0,
      discountPercent: 0,
      photoSessionsIncluded: 0,
      mediaDaysIncluded: 0,
      competitionSessionsIncluded: 0,
      customContentsIncluded: 0,
    });
  });

  it.each(["essential", "impact", "signature"] as const)(
    "keeps the Founder badge on a future paid %s subscription",
    async (planCode) => {
      const { value, createdRecords } = repository();

      await assign(value, {
        planCode,
        isFounder: true,
        isComplimentary: false,
      });

      expect(createdRecords[0]).toMatchObject({
        isFounder: true,
        isComplimentary: false,
      });
      expect(createdRecords[0].priceChf).toBeGreaterThan(0);
    },
  );

  it("creates a Founder batch with normalized dates and forced zero terms", async () => {
    const { value, bulkCreatedRecords } = repository();

    const result = await bulkAssignFounderSubscriptions({
      workspaceId: " workspace-1 ",
      createdByClerkUserId: " admin-1 ",
      assignments: [
        { athleteId: " athlete-1 ", startsOn: "2026-09-14", endsOn: "2027-09-14" },
        { athleteId: " athlete-2 ", startsOn: "2026-02-28", endsOn: "2027-02-28" },
      ],
    }, value);

    expect(bulkCreatedRecords).toHaveLength(1);
    expect(bulkCreatedRecords[0]).toHaveLength(2);
    expect(bulkCreatedRecords[0][0]).toMatchObject({
      workspaceId: "workspace-1",
      athleteId: "athlete-1",
      databasePlanCode: "founder",
      isFounder: true,
      isComplimentary: true,
      priceChf: 0,
      discountPercent: 0,
      photoSessionsIncluded: 0,
      mediaDaysIncluded: 0,
      competitionSessionsIncluded: 0,
      customContentsIncluded: 0,
      createdByClerkUserId: "admin-1",
    });
    expect(result).toMatchObject({
      created: [{ athleteId: "athlete-1", planCode: "founder" }, { athleteId: "athlete-2", planCode: "founder" }],
      skipped: [],
      errors: [],
    });
  });

  it("returns skipped conflicts and per-athlete errors without duplicate insert attempts", async () => {
    const serviceRepository = repository({
      bulkCreateFounder: vi.fn(async (records) => [
        neonRow({
          id: records[0].id,
          athlete_id: records[0].athleteId,
          plan_code: "founder",
          starts_on: records[0].startsOn,
          ends_on: records[0].endsOn,
          is_founder: true,
          is_complimentary: true,
          price_chf: "0",
          discount_percent: "0",
          photo_sessions_included: "0",
          media_days_included: "0",
          competition_sessions_included: "0",
          custom_contents_included: "0",
        }),
        null,
      ]),
    }).value;

    const result = await bulkAssignFounderSubscriptions({
      workspaceId: "workspace-1",
      createdByClerkUserId: "admin-1",
      assignments: [
        { athleteId: "athlete-1", startsOn: "2026-09-14", endsOn: "2027-09-14" },
        { athleteId: "athlete-1", startsOn: "2026-09-14", endsOn: "2027-09-14" },
        { athleteId: "athlete-2", startsOn: "", endsOn: "" },
        { athleteId: "athlete-3", startsOn: "2026-09-14", endsOn: "2027-09-14" },
      ],
    }, serviceRepository);

    expect(serviceRepository.bulkCreateFounder).toHaveBeenCalledWith([
      expect.objectContaining({ athleteId: "athlete-1" }),
      expect.objectContaining({ athleteId: "athlete-3" }),
    ]);
    expect(result.created).toHaveLength(1);
    expect(result.skipped).toEqual([{ athleteId: "athlete-3", reason: "active_subscription" }]);
    expect(result.errors).toEqual([
      { athleteId: "athlete-1", message: "Cet athlète est présent plusieurs fois dans le lot." },
      { athleteId: "athlete-2", message: "startsOn est requis." },
    ]);
  });

  it("implements bulk Founder persistence as one conflict-safe transaction", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "lib/athlete-subscriptions/service.ts"),
      "utf8",
    );

    expect(source).toContain("const results = await sql.transaction(queries)");
    expect(source).toContain("ON CONFLICT (workspace_id, athlete_id) WHERE status = 'active' DO NOTHING");
  });

  it("rejects invalid identity, plan, dates, and flags with validation errors", async () => {
    const serviceRepository = repository().value;

    await expect(assign(serviceRepository, { workspaceId: "" })).rejects.toBeInstanceOf(
      AthleteSubscriptionValidationError,
    );
    await expect(assign(serviceRepository, { planCode: "unknown" })).rejects.toMatchObject({ code: "validation" });
    await expect(assign(serviceRepository, { endsOn: "2026-09-14" })).rejects.toMatchObject({ code: "validation" });
    await expect(assign(serviceRepository, { isFounder: "yes" })).rejects.toMatchObject({ code: "validation" });
  });

  it("translates a Neon unique violation into a typed conflict", async () => {
    const serviceRepository = repository({
      create: vi.fn().mockRejectedValue({ code: "23505" }),
    }).value;

    await expect(assign(serviceRepository)).rejects.toBeInstanceOf(AthleteSubscriptionConflictError);
  });

  it("cancels within the workspace and returns the normalized row", async () => {
    const cancelledRow = neonRow({ status: "cancelled", updated_at: "2026-09-15T09:00:00.000Z" });
    const serviceRepository = repository({
      cancel: vi.fn().mockResolvedValue({ outcome: "cancelled", row: cancelledRow }),
    }).value;

    const result = await cancelAthleteSubscription({
      workspaceId: " workspace-1 ",
      subscriptionId: " 49c345aa-fb6e-46e8-83ef-1e07d7b69192 ",
    }, serviceRepository);

    expect(serviceRepository.cancel).toHaveBeenCalledWith(
      "workspace-1",
      "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
    );
    expect(result).toMatchObject({ status: "cancelled", updatedAt: "2026-09-15T09:00:00.000Z" });
  });

  it("exposes typed not-found and state-conflict cancellation errors", async () => {
    const missingRepository = repository().value;
    const conflictRepository = repository({
      cancel: vi.fn().mockResolvedValue({ outcome: "conflict", row: neonRow({ status: "expired" }) }),
    }).value;

    await expect(cancelAthleteSubscription({
      workspaceId: "workspace-1",
      subscriptionId: "49c345aa-fb6e-46e8-83ef-1e07d7b69193",
    }, missingRepository)).rejects.toBeInstanceOf(AthleteSubscriptionNotFoundError);
    await expect(cancelAthleteSubscription({
      workspaceId: "workspace-1",
      subscriptionId: "49c345aa-fb6e-46e8-83ef-1e07d7b69194",
    }, conflictRepository)).rejects.toMatchObject({ code: "conflict" });
  });
});