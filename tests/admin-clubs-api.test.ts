import { describe, expect, it, vi } from "vitest";
import { createAdminClubHandlers } from "@/app/api/admin/clubs/route";
import {
  ClubAdminConflictError,
  ClubAdminForbiddenError,
  ClubAdminValidationError,
  type ProvisionedClub,
  type ProvisionedClubWithInitialTeam,
} from "@/lib/clubs/admin-service";

const provisionedClub: ProvisionedClub = {
  workspaceId: "elfic-fribourg",
  name: "Elfic Fribourg",
  status: "active",
  createdAt: "2026-09-15T08:00:00.000Z",
  updatedAt: "2026-09-15T08:00:00.000Z",
  teamCount: 1,
};

const createdClub: ProvisionedClubWithInitialTeam = {
  ...provisionedClub,
  profileCreatedAt: "2026-09-15T08:00:00.000Z",
  team: {
    id: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
    name: "Equipe premiere",
    season: "2026-2027",
    status: "active",
    createdAt: "2026-09-15T08:00:00.000Z",
    updatedAt: "2026-09-15T08:00:00.000Z",
  },
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  listClubs: vi.fn().mockResolvedValue([provisionedClub]),
  createClub: vi.fn().mockResolvedValue(createdClub),
  ...overrides,
});

const request = (method: "GET" | "POST", body?: unknown) => new Request(
  "http://localhost/api/admin/clubs?workspaceId=forged-admin-workspace",
  {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  },
);

const validBody = {
  id: "elfic-fribourg",
  name: "Elfic Fribourg",
  teamName: "Equipe premiere",
  season: "2026-2027",
};

describe("Admin Club API", () => {
  it("lists provisioned clubs and passes the original request to session-based authorization", async () => {
    const mocks = dependencies();
    const incomingRequest = request("GET");

    const response = await createAdminClubHandlers(mocks).GET(incomingRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ clubs: [provisionedClub] });
    expect(mocks.listClubs).toHaveBeenCalledWith(incomingRequest);
  });

  it("creates a club from exactly id, name, teamName and season", async () => {
    const mocks = dependencies();
    const incomingRequest = request("POST", validBody);

    const response = await createAdminClubHandlers(mocks).POST(incomingRequest);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ club: createdClub });
    expect(mocks.createClub).toHaveBeenCalledWith(incomingRequest, {
      workspaceId: validBody.id,
      clubName: validBody.name,
      teamName: validBody.teamName,
      season: validBody.season,
    });
  });

  it.each([
    "workspaceId",
    "adminWorkspaceId",
    "clerkUserId",
    "role",
    "status",
    "createdAt",
    "unexpected",
  ])("rejects the additional field %s", async (field) => {
    const mocks = dependencies();

    const response = await createAdminClubHandlers(mocks).POST(request("POST", {
      ...validBody,
      [field]: "client-controlled",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Les champs id, name, teamName et season sont requis exclusivement.",
      code: "validation",
    });
    expect(mocks.createClub).not.toHaveBeenCalled();
  });

  it.each(["id", "name", "teamName", "season"])("rejects a payload missing %s", async (field) => {
    const mocks = dependencies();
    const body = { ...validBody } as Record<string, unknown>;
    delete body[field];

    const response = await createAdminClubHandlers(mocks).POST(request("POST", body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "validation" });
    expect(mocks.createClub).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON as validation", async () => {
    const mocks = dependencies();
    const malformedRequest = new Request("http://localhost/api/admin/clubs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await createAdminClubHandlers(mocks).POST(malformedRequest);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "validation" });
    expect(mocks.createClub).not.toHaveBeenCalled();
  });

  it.each(["GET", "POST"] as const)("maps access refusal to 403 for %s", async (method) => {
    const mocks = dependencies({
      ...(method === "GET"
        ? { listClubs: vi.fn().mockRejectedValue(new ClubAdminForbiddenError()) }
        : { createClub: vi.fn().mockRejectedValue(new ClubAdminForbiddenError()) }),
    });
    const handler = createAdminClubHandlers(mocks)[method];

    const response = await handler(request(method, method === "POST" ? validBody : undefined));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Un acces Admin actif est requis.",
      code: "forbidden",
    });
  });

  it("maps service validation to 400", async () => {
    const mocks = dependencies({
      createClub: vi.fn().mockRejectedValue(new ClubAdminValidationError("workspaceId est invalide.")),
    });

    const response = await createAdminClubHandlers(mocks).POST(request("POST", validBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "workspaceId est invalide.",
      code: "validation",
    });
  });

  it("maps identifier or name conflicts to 409", async () => {
    const mocks = dependencies({
      createClub: vi.fn().mockRejectedValue(new ClubAdminConflictError()),
    });

    const response = await createAdminClubHandlers(mocks).POST(request("POST", validBody));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "conflict" });
  });

  it.each(["GET", "POST"] as const)("maps unexpected %s errors to 500", async (method) => {
    const mocks = dependencies({
      ...(method === "GET"
        ? { listClubs: vi.fn().mockRejectedValue(new Error("database unavailable")) }
        : { createClub: vi.fn().mockRejectedValue(new Error("database unavailable")) }),
    });
    const handler = createAdminClubHandlers(mocks)[method];

    const response = await handler(request(method, method === "POST" ? validBody : undefined));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Impossible de gérer les clubs." });
  });
});