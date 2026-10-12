import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  changeAthleteServiceCreativeAssignment,
  listActiveAssignmentCreatives,
  type AssignmentCreativeSummary,
  type AthleteServiceCreativeAssignment,
  type AthleteServiceCreativeAssignmentRepository,
} from "@/lib/athlete-service-creative-assignments";
import { createAdminAthleteServiceCreativeAssignmentHandlers } from "@/app/api/admin/athlete-service-creative-assignments/route";

const requestId = "11111111-1111-4111-8111-111111111111";
const creativeAId = "22222222-2222-4222-8222-222222222222";
const creativeBId = "33333333-3333-4333-8333-333333333333";
const keyA = "44444444-4444-4444-8444-444444444444";
const keyB = "55555555-5555-4555-8555-555555555555";
const keyC = "66666666-6666-4666-8666-666666666666";

const creative = (id: string, displayName: string): AssignmentCreativeSummary => ({
  id,
  displayName,
  creativeType: "photographer",
  area: "Vaud",
});

const createMemoryRepository = () => {
  const activeCreatives = new Map([
    [creativeAId, creative(creativeAId, "Alice Photo")],
    [creativeBId, creative(creativeBId, "Bruno Photo")],
  ]);
  const assignment: AthleteServiceCreativeAssignment = {
    requestId,
    athleteId: "athlete-1",
    productName: "Session photo",
    creative: null,
    history: [],
  };
  const idempotency = new Map<string, string | null>();
  const repository: AthleteServiceCreativeAssignmentRepository = {
    async listActiveCreatives(workspaceId) {
      return workspaceId === "workspace-a" ? [...activeCreatives.values()] : [];
    },
    async listAssignments(input) {
      return input.workspaceId === "workspace-a" && input.requestId === requestId
        ? [{ ...assignment, history: [...assignment.history] }]
        : [];
    },
    async change(input) {
      if (input.workspaceId !== "workspace-a" || input.requestId !== requestId) return "missing_request";
      const existing = idempotency.get(input.idempotencyKey);
      if (idempotency.has(input.idempotencyKey)) {
        return existing === input.creativeProfileId ? "unchanged" : "idempotency_conflict";
      }
      if (input.creativeProfileId && !activeCreatives.has(input.creativeProfileId)) {
        return "invalid_creative";
      }
      if ((assignment.creative?.id ?? null) === input.creativeProfileId) return "unchanged";
      const previousCreative = assignment.creative;
      assignment.creative = input.creativeProfileId
        ? activeCreatives.get(input.creativeProfileId)!
        : null;
      assignment.history.unshift({
        id: `event-${assignment.history.length + 1}`,
        action: previousCreative
          ? assignment.creative ? "replaced" : "unassigned"
          : "assigned",
        previousCreative,
        creative: assignment.creative,
        authoredByClerkUserId: input.authoredByClerkUserId,
        createdAt: new Date("2026-10-11T12:00:00.000Z").toISOString(),
      });
      idempotency.set(input.idempotencyKey, input.creativeProfileId);
      return "changed";
    },
  };
  return { repository, assignment, activeCreatives };
};

describe("Athlete service creative assignments", () => {
  it("returns assignments for a requestId with an active Admin+creative account after 6C", async () => {
    const assignment: AthleteServiceCreativeAssignment = {
      requestId,
      athleteId: "athlete-1",
      productName: "Session photo",
      creative: creative(creativeAId, "Alice Photo"),
      history: [],
    };
    const listCreatives = vi.fn().mockResolvedValue([creative(creativeAId, "Alice Photo")]);
    const listAssignments = vi.fn().mockResolvedValue([assignment]);
    const handlers = createAdminAthleteServiceCreativeAssignmentHandlers({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "admin-creative-1",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
      }),
      listCreatives,
      listAssignments,
      changeAssignment: vi.fn(),
    });

    const response = await handlers.GET(new Request(
      `http://localhost/api/admin/athlete-service-creative-assignments?requestId=${requestId}`,
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listCreatives).toHaveBeenCalledWith({ workspaceId: "workspace-a" });
    expect(listAssignments).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      requestId,
    });
    await expect(response.json()).resolves.toEqual({
      creatives: [creative(creativeAId, "Alice Photo")],
      assignments: [assignment],
    });
  });

  it("assigns, replaces and removes by canonical UUID with append-only Admin history", async () => {
    const { repository } = createMemoryRepository();

    const assigned = await changeAthleteServiceCreativeAssignment({
      workspaceId: "workspace-a",
      requestId,
      creativeProfileId: creativeAId,
      idempotencyKey: keyA,
      authoredByClerkUserId: "admin-1",
      repository,
    });
    const replaced = await changeAthleteServiceCreativeAssignment({
      workspaceId: "workspace-a",
      requestId,
      creativeProfileId: creativeBId,
      idempotencyKey: keyB,
      authoredByClerkUserId: "admin-1",
      repository,
    });
    const removed = await changeAthleteServiceCreativeAssignment({
      workspaceId: "workspace-a",
      requestId,
      creativeProfileId: null,
      idempotencyKey: keyC,
      authoredByClerkUserId: "admin-1",
      repository,
    });

    expect(assigned).toMatchObject({ outcome: "changed", assignment: { creative: { id: creativeAId } } });
    expect(replaced).toMatchObject({ outcome: "changed", assignment: { creative: { id: creativeBId } } });
    expect(removed).toMatchObject({
      outcome: "changed",
      assignment: {
        creative: null,
        history: [
          { action: "unassigned", authoredByClerkUserId: "admin-1" },
          { action: "replaced", previousCreative: { id: creativeAId }, creative: { id: creativeBId } },
          { action: "assigned", creative: { id: creativeAId } },
        ],
      },
    });
  });

  it("is idempotent and rejects reuse of a key for a different target", async () => {
    const { repository } = createMemoryRepository();
    const input = {
      workspaceId: "workspace-a",
      requestId,
      creativeProfileId: creativeAId,
      idempotencyKey: keyA,
      authoredByClerkUserId: "admin-1",
      repository,
    };

    expect((await changeAthleteServiceCreativeAssignment(input)).outcome).toBe("changed");
    expect((await changeAthleteServiceCreativeAssignment(input)).outcome).toBe("unchanged");
    expect((await changeAthleteServiceCreativeAssignment({
      ...input,
      creativeProfileId: creativeBId,
    })).outcome).toBe("idempotency_conflict");
  });

  it("rejects inactive, unknown or cross-workspace creatives and requests", async () => {
    const { repository } = createMemoryRepository();
    const inactiveId = "77777777-7777-4777-8777-777777777777";

    expect((await changeAthleteServiceCreativeAssignment({
      workspaceId: "workspace-a",
      requestId,
      creativeProfileId: inactiveId,
      idempotencyKey: keyA,
      authoredByClerkUserId: "admin-1",
      repository,
    })).outcome).toBe("invalid_creative");
    expect((await changeAthleteServiceCreativeAssignment({
      workspaceId: "workspace-b",
      requestId,
      creativeProfileId: creativeAId,
      idempotencyKey: keyB,
      authoredByClerkUserId: "admin-1",
      repository,
    })).outcome).toBe("missing_request");
    await expect(listActiveAssignmentCreatives({
      workspaceId: "workspace-b",
      repository,
    })).resolves.toEqual([]);
  });

  it("uses only the authenticated Admin workspace and author in the API", async () => {
    const changeAssignment = vi.fn().mockResolvedValue({
      outcome: "changed",
      assignment: {
        requestId,
        athleteId: "athlete-1",
        productName: "Session photo",
        creative: creative(creativeAId, "Alice Photo"),
        history: [],
      },
    });
    const handlers = createAdminAthleteServiceCreativeAssignmentHandlers({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: " admin-1 ",
        role: "admin",
        status: "active",
        workspaceId: " workspace-a ",
      }),
      listCreatives: vi.fn().mockResolvedValue([]),
      listAssignments: vi.fn().mockResolvedValue([]),
      changeAssignment,
    });
    const response = await handlers.PATCH(new Request(
      "http://localhost/api/admin/athlete-service-creative-assignments",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId,
          creativeProfileId: creativeAId,
          idempotencyKey: keyA,
        }),
      },
    ));

    expect(response.status).toBe(200);
    expect(changeAssignment).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      requestId,
      creativeProfileId: creativeAId,
      idempotencyKey: keyA,
      authoredByClerkUserId: "admin-1",
    });
  });

  it.each([
    [null, 401],
    [{ clerkUserId: "user-1", role: "athlete", status: "active", workspaceId: "workspace-a" }, 403],
    [{ clerkUserId: "user-1", role: "admin", status: "inactive", workspaceId: "workspace-a" }, 403],
  ] as const)("blocks missing or non-Admin access before reading data", async (access, status) => {
    const listAssignments = vi.fn();
    const handlers = createAdminAthleteServiceCreativeAssignmentHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      listCreatives: vi.fn(),
      listAssignments,
      changeAssignment: vi.fn(),
    });
    const response = await handlers.GET(new Request(
      `http://localhost/api/admin/athlete-service-creative-assignments?requestId=${requestId}`,
    ));

    expect(response.status).toBe(status);
    expect(listAssignments).not.toHaveBeenCalled();
  });

  it("defines an additive workspace-scoped current relation and immutable history", () => {
    const sql = readFileSync(join(
      process.cwd(),
      "db",
      "migrations",
      "20261016_athlete_service_request_creative_assignments_v1.sql",
    ), "utf8");

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS assigned_creative_profile_id UUID NULL");
    expect(sql).toContain("FOREIGN KEY (workspace_id, assigned_creative_profile_id)");
    expect(sql).toContain("REFERENCES creative_profiles (workspace_id, id)");
    expect(sql).toContain("athlete_service_request_creative_assignment_events");
    expect(sql).toContain("idempotency_key UUID NOT NULL");
    expect(sql).toContain("authored_by_clerk_user_id TEXT NOT NULL");
    expect(sql).toContain("BEFORE UPDATE OR DELETE");
    expect(sql).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b/);
    expect(sql).not.toMatch(/\bUPDATE\s+athlete_service_requests\s+SET\s+(status|fulfillment_mode|snapshot_)/i);
  });
});
