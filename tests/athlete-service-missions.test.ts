import { readFileSync } from "node:fs";
import { join } from "node:path";
import { auth } from "@clerk/nextjs/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  AthleteServiceMissionValidationError,
  buildMissionWhatsAppAnnouncement,
  formatMissionDateZurich,
  parseAthleteServiceMissionInput,
  type AthleteServiceMission,
  type AthleteServiceMissionInput,
  type AthleteServiceMissionRecord,
} from "@/lib/athlete-service-mission-domain";
import {
  cancelAthleteServiceMission,
  saveAthleteServiceMission,
  type AthleteServiceMissionRepository,
} from "@/lib/athlete-service-missions";
import { createAdminAthleteServiceMissionHandlers } from "@/app/api/admin/athlete-service-missions/route";
import { getDefaultCreativeAdminAccess, requireCreativeAdminContext } from "@/lib/creatives/admin-route";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/content-storage/db", () => ({ createContentStorageClient: vi.fn() }));

const requestId = "11111111-1111-4111-8111-111111111111";
const creativeId = "22222222-2222-4222-8222-222222222222";
const keyA = "33333333-3333-4333-8333-333333333333";
const keyB = "44444444-4444-4444-8444-444444444444";
const keyC = "55555555-5555-4555-8555-555555555555";

const missionInput = (overrides: Partial<AthleteServiceMissionInput> = {}): AthleteServiceMissionInput => ({
  title: "Couverture du match",
  brief: "Créer une sélection éditoriale dynamique.",
  sportDiscipline: "Football",
  missionType: "photo",
  missionContext: "match",
  locationName: "Stade de la Tuilière",
  locationDetails: "Entrée média, porte B",
  missionDate: "2026-10-25",
  startTime: "14:30",
  endTime: "17:00",
  deliveryDueDate: "2026-10-27",
  deliverables: "30 photos retouchées",
  compensationType: "paid_mandate",
  compensationAmountChfCents: 25000,
  expenseDetails: "Train remboursé sur justificatif",
  internalAdminNotes: "Athlète: Alice Martin. Contrat confidentiel.",
  status: "draft",
  ...overrides,
});

const toMission = (
  input: AthleteServiceMissionInput,
  overrides: Partial<AthleteServiceMission> = {},
): AthleteServiceMission => ({
  ...input,
  id: "66666666-6666-4666-8666-666666666666",
  requestId,
  referenceCode: "KLIQUE-A1B2C3D4",
  status: input.status,
  createdByClerkUserId: "admin-1",
  updatedByClerkUserId: "admin-1",
  createdAt: "2026-10-11T12:00:00.000Z",
  updatedAt: "2026-10-11T12:00:00.000Z",
  ...overrides,
});

const createMemoryRepository = () => {
  let record: AthleteServiceMissionRecord = {
    requestId,
    athleteId: "athlete-canonical-1",
    productName: "Session photo",
    assignedCreativeProfileId: creativeId,
    mission: null,
    history: [],
  };
  const idempotency = new Map<string, string>();
  const repository: AthleteServiceMissionRepository = {
    async list(input) {
      return input.workspaceId === "workspace-a" && input.requestId === requestId ? [record] : [];
    },
    async save(input) {
      if (input.workspaceId !== "workspace-a" || input.requestId !== requestId) return "missing_request";
      const existing = idempotency.get(input.idempotencyKey);
      if (existing) return existing === input.requestFingerprint ? "unchanged" : "idempotency_conflict";
      if (record.mission?.status === "cancelled") return "cancelled";
      const action = record.mission ? "updated" : "created";
      const previous = record.mission;
      const mission = toMission(input.mission, {
        id: previous?.id ?? input.missionId,
        referenceCode: previous?.referenceCode ?? input.referenceCode,
        createdAt: previous?.createdAt ?? "2026-10-11T12:00:00.000Z",
        updatedAt: "2026-10-11T12:05:00.000Z",
        createdByClerkUserId: previous?.createdByClerkUserId ?? input.authoredByClerkUserId,
        updatedByClerkUserId: input.authoredByClerkUserId,
      });
      const changedFields = previous
        ? Object.keys(input.mission).filter((field) => (
            previous[field as keyof AthleteServiceMission] !== input.mission[field as keyof AthleteServiceMissionInput]
          ))
        : Object.keys(input.mission);
      record = {
        ...record,
        mission,
        history: [{
          id: `event-${record.history.length + 1}`,
          action,
          changedFields,
          snapshot: { ...input.mission },
          authoredByClerkUserId: input.authoredByClerkUserId,
          createdAt: "2026-10-11T12:05:00.000Z",
        }, ...record.history],
      };
      idempotency.set(input.idempotencyKey, input.requestFingerprint);
      return "changed";
    },
    async cancel(input) {
      if (input.workspaceId !== "workspace-a" || input.requestId !== requestId) return "missing_request";
      const existing = idempotency.get(input.idempotencyKey);
      if (existing) return existing === input.requestFingerprint ? "unchanged" : "idempotency_conflict";
      if (!record.mission) return "missing_mission";
      if (record.mission.status === "cancelled") return "unchanged";
      record = {
        ...record,
        mission: { ...record.mission, status: "cancelled" },
        history: [{
          id: `event-${record.history.length + 1}`,
          action: "cancelled",
          changedFields: ["status"],
          snapshot: { status: "cancelled" },
          authoredByClerkUserId: input.authoredByClerkUserId,
          createdAt: "2026-10-11T12:10:00.000Z",
        }, ...record.history],
      };
      idempotency.set(input.idempotencyKey, input.requestFingerprint);
      return "changed";
    },
  };
  return { repository, getRecord: () => record };
};

describe("Creative admin access guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses auth() and user_access to authorize Admin without remote Clerk user lookup", async () => {
    const sql = vi.fn().mockResolvedValue([
      { clerk_user_id: "user_123", role: "admin", status: "active", workspace_id: "workspace-a" },
    ]);
    vi.mocked(auth).mockResolvedValue({ userId: "user_123" } as never);
    vi.mocked(createContentStorageClient).mockReturnValue(sql as never);

    const access = await getDefaultCreativeAdminAccess(new Request("http://localhost/api/admin/athlete-service-missions?requestId=11111111-1111-4111-8111-111111111111"));

    expect(access).toEqual({
      clerkUserId: "user_123",
      role: "admin",
      status: "active",
      workspaceId: "workspace-a",
    });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it.each([
    [null, 401],
    [{ clerkUserId: "user-1", role: "athlete", status: "active", workspaceId: "workspace-a" }, 403],
    [{ clerkUserId: "user-1", role: "admin", status: "inactive", workspaceId: "workspace-a" }, 403],
  ])("enforces auth and admin-only access %j", async (access, expectedStatus) => {
    const result = await requireCreativeAdminContext(new Request("http://localhost/api/admin/athlete-service-missions?requestId=11111111-1111-4111-8111-111111111111"), async () => access);
    if ("response" in result) {
      expect(result.response.status).toBe(expectedStatus);
      return;
    }
    throw new Error("Expected denial response");
  });
});

describe("Athlete service mission domain", () => {
  it("validates strict dates and local Europe/Zurich times without date-to-timestamp conversion", () => {
    const parsed = parseAthleteServiceMissionInput(missionInput({
      missionDate: "2026-10-11",
      deliveryDueDate: "2026-10-12",
    }));
    expect(parsed.missionDate).toBe("2026-10-11");
    expect(parsed.startTime).toBe("14:30");
    expect(formatMissionDateZurich(parsed.missionDate)).toBe("11.10.2026");
    expect(JSON.stringify(parsed)).not.toContain("02:00");

    expect(() => parseAthleteServiceMissionInput(missionInput({
      missionDate: "2026-02-30",
    }))).toThrow(AthleteServiceMissionValidationError);
    expect(() => parseAthleteServiceMissionInput(missionInput({
      startTime: "17:00",
      endTime: "14:30",
    }))).toThrow("endTime");
    expect(() => parseAthleteServiceMissionInput(missionInput({
      deliveryDueDate: "2026-10-24",
    }))).toThrow("deliveryDueDate");
  });

  it("formats civil dates identically near DST changes in every execution timezone", () => {
    const originalTimezone = process.env.TZ;
    try {
      for (const timezone of ["UTC", "Europe/Zurich", "Pacific/Honolulu", "Asia/Tokyo"]) {
        process.env.TZ = timezone;
        expect(formatMissionDateZurich("2026-10-25")).toBe("25.10.2026");
        expect(formatMissionDateZurich("2026-03-29")).toBe("29.03.2026");
      }
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("accepts integer cents only for paid mandates", () => {
    expect(parseAthleteServiceMissionInput(missionInput()).compensationAmountChfCents).toBe(25000);
    expect(() => parseAthleteServiceMissionInput(missionInput({
      compensationAmountChfCents: 250.5,
    }))).toThrow("centimes");
    expect(() => parseAthleteServiceMissionInput(missionInput({
      compensationType: "unpaid_collaboration",
      compensationAmountChfCents: 100,
    }))).toThrow("uniquement");
    expect(parseAthleteServiceMissionInput(missionInput({
      compensationType: "expenses_only",
      compensationAmountChfCents: null,
    }))).toMatchObject({ compensationType: "expenses_only", compensationAmountChfCents: null });
  });

  it("builds a WhatsApp announcement without Athlete PII, private notes or raw UUID", () => {
    const mission = toMission(missionInput(), {
      locationDetails: "Rendez-vous avec Alice Martin au vestiaire",
      expenseDetails: "IBAN CH00 confidentiel",
    });
    const text = buildMissionWhatsAppAnnouncement(mission);

    expect(text).toContain("Mission Photo");
    expect(text).toContain("Football");
    expect(text).toContain("25.10.2026 · 14:30–17:00");
    expect(text).toContain("Stade de la Tuilière");
    expect(text).toContain("30 photos retouchées");
    expect(text).toContain("Mandat rémunéré · CHF 250.00");
    expect(text).toContain("KLIQUE-A1B2C3D4");
    expect(text).not.toContain("Alice Martin");
    expect(text).not.toContain("IBAN");
    expect(text).not.toContain("Contrat");
    expect(text).not.toContain(requestId);
    expect(text).not.toContain(mission.id);
  });

  it("keeps the same opaque civil date through API serialization and WhatsApp formatting", async () => {
    const input = missionInput({
      missionDate: "2026-10-11",
      deliveryDueDate: "2026-10-12",
    });
    const apiMission = toMission(input);
    const handlers = createAdminAthleteServiceMissionHandlers({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
      }),
      listMissions: vi.fn().mockResolvedValue([{
        requestId,
        athleteId: "athlete-1",
        productName: "Session photo",
        assignedCreativeProfileId: creativeId,
        mission: apiMission,
        history: [],
      }]),
      saveMission: vi.fn(),
      cancelMission: vi.fn(),
    });
    const response = await handlers.GET(new Request(
      `http://localhost/api/admin/athlete-service-missions?requestId=${requestId}`,
    ));
    const payload = await response.json();

    expect(payload.records[0].mission.missionDate).toBe("2026-10-11");
    expect(payload.records[0].mission.deliveryDueDate).toBe("2026-10-12");
    expect(formatMissionDateZurich(payload.records[0].mission.missionDate)).toBe("11.10.2026");
    expect(buildMissionWhatsAppAnnouncement(payload.records[0].mission)).toContain(
      "Date : 11.10.2026",
    );
  });
});

describe("Athlete service mission lifecycle", () => {
  it("creates, updates, marks ready without creative, then cancels with append-only history", async () => {
    const { repository, getRecord } = createMemoryRepository();
    const created = await saveAthleteServiceMission({
      workspaceId: "workspace-a",
      requestId,
      mission: missionInput(),
      idempotencyKey: keyA,
      authoredByClerkUserId: "admin-1",
      repository,
    });
    const updated = await saveAthleteServiceMission({
      workspaceId: "workspace-a",
      requestId,
      mission: missionInput({ status: "ready", title: "Match prêt" }),
      idempotencyKey: keyB,
      authoredByClerkUserId: "admin-2",
      repository,
    });
    expect(updated).toMatchObject({
      outcome: "changed",
      record: { assignedCreativeProfileId: creativeId, mission: { status: "ready" } },
    });
    getRecord().assignedCreativeProfileId = null;
    const cancelled = await cancelAthleteServiceMission({
      workspaceId: "workspace-a",
      requestId,
      idempotencyKey: keyC,
      authoredByClerkUserId: "admin-2",
      repository,
    });

    expect(created).toMatchObject({ outcome: "changed", record: { mission: { status: "draft" } } });
    expect(cancelled).toMatchObject({
      outcome: "changed",
      record: {
        assignedCreativeProfileId: null,
        mission: { status: "cancelled" },
        history: [
          { action: "cancelled", changedFields: ["status"], authoredByClerkUserId: "admin-2" },
          { action: "updated", authoredByClerkUserId: "admin-2" },
          { action: "created", authoredByClerkUserId: "admin-1" },
        ],
      },
    });
  });

  it("is workspace-isolated, one-to-one and idempotent", async () => {
    const { repository, getRecord } = createMemoryRepository();
    const input = {
      workspaceId: "workspace-a",
      requestId,
      mission: missionInput(),
      idempotencyKey: keyA,
      authoredByClerkUserId: "admin-1",
      repository,
    };
    expect((await saveAthleteServiceMission(input)).outcome).toBe("changed");
    expect((await saveAthleteServiceMission(input)).outcome).toBe("unchanged");
    expect(getRecord().history).toHaveLength(1);
    expect((await saveAthleteServiceMission({
      ...input,
      workspaceId: "workspace-b",
      idempotencyKey: keyB,
    })).outcome).toBe("missing_request");
    expect(getRecord().mission?.requestId).toBe(requestId);
  });

  it("creates no quota, credit, purchase or request-status mutation surface", () => {
    const input = missionInput();
    expect(input).not.toHaveProperty("requestStatus");
    expect(input).not.toHaveProperty("quota");
    expect(input).not.toHaveProperty("credit");
    expect(input).not.toHaveProperty("purchase");
  });
});

describe("Admin athlete service mission API", () => {
  it("returns a mission with its creative response and history for a requestId after 6C", async () => {
    const record: AthleteServiceMissionRecord = {
      requestId,
      athleteId: "athlete-1",
      productName: "Session photo",
      assignedCreativeProfileId: creativeId,
      mission: toMission(missionInput({ status: "ready" })),
      history: [],
      creativeResponse: {
        state: "accepted",
        note: "Disponible pour cette mission.",
        respondedAt: "2026-10-12T08:05:52.406Z",
        history: [{
          action: "accepted",
          note: "Disponible pour cette mission.",
          authoredBy: "creative",
          createdAt: "2026-10-12T08:05:52.406Z",
        }],
      },
    };
    const listMissions = vi.fn().mockResolvedValue([record]);
    const handlers = createAdminAthleteServiceMissionHandlers({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-creative-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
      }),
      listMissions,
      saveMission: vi.fn(),
      cancelMission: vi.fn(),
    });

    const response = await handlers.GET(new Request(
      `http://localhost/api/admin/athlete-service-missions?requestId=${requestId}`,
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listMissions).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      requestId,
    });
    await expect(response.json()).resolves.toEqual({ records: [record] });
  });

  it("uses only the authenticated Admin workspace and author", async () => {
    const saveMission = vi.fn().mockResolvedValue({
      outcome: "changed",
      record: {
        requestId,
        athleteId: "athlete-1",
        productName: "Session photo",
        assignedCreativeProfileId: null,
        mission: toMission(missionInput()),
        history: [],
      },
    });
    const handlers = createAdminAthleteServiceMissionHandlers({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: " admin-1 ",
        role: "admin",
        status: "active",
        workspaceId: " workspace-a ",
      }),
      listMissions: vi.fn(),
      saveMission,
      cancelMission: vi.fn(),
    });
    const response = await handlers.PATCH(new Request(
      "http://localhost/api/admin/athlete-service-missions",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          requestId,
          idempotencyKey: keyA,
          mission: missionInput(),
        }),
      },
    ));

    expect(response.status).toBe(200);
    expect(saveMission).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      requestId,
      idempotencyKey: keyA,
      authoredByClerkUserId: "admin-1",
      mission: missionInput(),
    });
  });

  it.each([
    [null, 401],
    [{ clerkUserId: "user-1", role: "athlete", status: "active", workspaceId: "workspace-a" }, 403],
    [{ clerkUserId: "user-1", role: "admin", status: "inactive", workspaceId: "workspace-a" }, 403],
  ] as const)("blocks missing or non-Admin access with the expected status", async (access, status) => {
    const listMissions = vi.fn();
    const handlers = createAdminAthleteServiceMissionHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      listMissions,
      saveMission: vi.fn(),
      cancelMission: vi.fn(),
    });
    const response = await handlers.GET(new Request(
      `http://localhost/api/admin/athlete-service-missions?requestId=${requestId}`,
    ));
    expect(response.status).toBe(status);
    expect(listMissions).not.toHaveBeenCalled();
  });

  it("defines an additive 1:1 mission schema and immutable history", () => {
    const sql = readFileSync(join(
      process.cwd(),
      "db",
      "migrations",
      "20261017_athlete_service_request_missions_v1.sql",
    ), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS athlete_service_request_missions");
    expect(sql).toContain("ON athlete_service_request_missions (workspace_id, service_request_id)");
    expect(sql).toContain("FOREIGN KEY (workspace_id, service_request_id)");
    expect(sql).toContain("FOREIGN KEY (workspace_id, service_request_id, mission_id)");
    expect(sql).toContain("compensation_amount_chf_cents INTEGER NULL");
    expect(sql).toContain("mission_date DATE NOT NULL");
    expect(sql).toContain("TIME WITHOUT TIME ZONE");
    expect(sql).toContain("snapshot JSONB NOT NULL");
    expect(sql).toContain("BEFORE UPDATE OR DELETE");
    expect(sql).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b/);
    expect(sql).not.toMatch(/\bUPDATE\s+athlete_service_requests\b/i);
    expect(sql).not.toMatch(/athlete_credit|purchase|google/i);
    const repository = readFileSync(join(
      process.cwd(),
      "lib",
      "athlete-service-missions.ts",
    ), "utf8");
    expect(repository).toContain("mission.mission_date::text AS mission_date");
    expect(repository).toContain("mission.delivery_due_date::text AS delivery_due_date");
    expect(repository).not.toContain("value.getUTCDate()");
  });
});
