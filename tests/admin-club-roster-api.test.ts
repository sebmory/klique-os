import { describe, expect, it, vi } from "vitest";
import { createAdminClubRosterHandlers } from "@/app/api/admin/clubs/roster/route";
import {
  ClubRosterConflictError,
  ClubRosterForbiddenError,
  ClubRosterNotFoundError,
  ClubRosterValidationError,
  type AvailableKliqueAthlete,
  type ClubRosterMember,
  type ClubTeam,
} from "@/lib/clubs/roster-service";

const teamId = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";

const team: ClubTeam = {
  id: teamId,
  workspaceId: "elfic-fribourg",
  name: "Equipe premiere",
  season: "2026-2027",
  status: "active",
};

const member: ClubRosterMember = {
  id: "927f53ef-6d5e-46cc-8891-411bd904f4fc",
  workspaceId: "elfic-fribourg",
  teamId,
  athleteId: "athlete-1",
  athleteName: "Mila Benjak",
  sport: "Basketball",
  joinedOn: "2026-09-15",
};

const availableAthlete: AvailableKliqueAthlete = {
  athleteId: "athlete-2",
  name: "Zoé Dupont",
  sport: "Basketball",
  status: "Actif",
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  listTeams: vi.fn().mockResolvedValue([team]),
  listRoster: vi.fn().mockResolvedValue([member]),
  listAvailableAthletes: vi.fn().mockResolvedValue([availableAthlete]),
  addAthlete: vi.fn().mockResolvedValue(member),
  removeAthlete: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const getRequest = (query = `workspaceId=elfic-fribourg&teamId=${teamId}`) =>
  new Request(`http://localhost/api/admin/clubs/roster?${query}`);

const mutationBody = {
  workspaceId: "elfic-fribourg",
  teamId,
  athleteId: "athlete-1",
};

const mutationRequest = (method: "POST" | "DELETE", body: unknown = mutationBody) =>
  new Request("http://localhost/api/admin/clubs/roster", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Admin Club roster API", () => {
  it("returns teams, active roster and available canonical Athletes", async () => {
    const mocks = dependencies();
    const request = getRequest();

    const response = await createAdminClubRosterHandlers(mocks).GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      teams: [team],
      roster: [member],
      availableAthletes: [availableAthlete],
    });
    expect(mocks.listTeams).toHaveBeenCalledWith(request, "elfic-fribourg");
    expect(mocks.listRoster).toHaveBeenCalledWith(request, "elfic-fribourg", teamId);
    expect(mocks.listAvailableAthletes).toHaveBeenCalledWith(request, "elfic-fribourg", teamId);
  });

  it("returns teams only when no team is selected yet", async () => {
    const mocks = dependencies();
    const request = getRequest("workspaceId=elfic-fribourg");

    const response = await createAdminClubRosterHandlers(mocks).GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      teams: [team],
      roster: [],
      availableAthletes: [],
    });
    expect(mocks.listTeams).toHaveBeenCalledWith(request, "elfic-fribourg");
    expect(mocks.listRoster).not.toHaveBeenCalled();
    expect(mocks.listAvailableAthletes).not.toHaveBeenCalled();
  });

  it.each([
    "",
    `teamId=${teamId}`,
    `workspaceId=elfic-fribourg&teamId=${teamId}&role=admin`,
    `workspaceId=elfic-fribourg&workspaceId=other&teamId=${teamId}`,
  ])("rejects a non-exact GET query: %s", async (query) => {
    const mocks = dependencies();

    const response = await createAdminClubRosterHandlers(mocks).GET(getRequest(query));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "validation" });
    expect(mocks.listTeams).not.toHaveBeenCalled();
  });

  it("adds an athlete with only the strict business payload", async () => {
    const mocks = dependencies();
    const request = mutationRequest("POST");

    const response = await createAdminClubRosterHandlers(mocks).POST(request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ member });
    expect(mocks.addAthlete).toHaveBeenCalledWith(request, mutationBody);
  });

  it("retires an athlete without requesting deletion of history", async () => {
    const mocks = dependencies();
    const request = mutationRequest("DELETE");

    const response = await createAdminClubRosterHandlers(mocks).DELETE(request);

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(mocks.removeAthlete).toHaveBeenCalledWith(request, mutationBody);
  });

  it.each(["POST", "DELETE"] as const)("rejects extra identity and date fields for %s", async (method) => {
    const mocks = dependencies();
    const handler = createAdminClubRosterHandlers(mocks)[method];

    const response = await handler(mutationRequest(method, {
      ...mutationBody,
      adminWorkspaceId: "forged-workspace",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "validation" });
    expect(method === "POST" ? mocks.addAthlete : mocks.removeAthlete).not.toHaveBeenCalled();
  });

  it.each(["workspaceId", "teamId", "athleteId"])("rejects a mutation missing %s", async (field) => {
    const mocks = dependencies();
    const body = { ...mutationBody } as Record<string, unknown>;
    delete body[field];

    const response = await createAdminClubRosterHandlers(mocks).POST(mutationRequest("POST", body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "validation" });
    expect(mocks.addAthlete).not.toHaveBeenCalled();
  });

  it.each(["POST", "DELETE"] as const)("rejects malformed JSON for %s", async (method) => {
    const mocks = dependencies();
    const request = new Request("http://localhost/api/admin/clubs/roster", {
      method,
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await createAdminClubRosterHandlers(mocks)[method](request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "validation" });
  });

  it.each([
    ["validation", new ClubRosterValidationError("teamId est invalide."), 400],
    ["forbidden", new ClubRosterForbiddenError(), 403],
    ["not found", new ClubRosterNotFoundError("Equipe Club introuvable."), 404],
    ["conflict", new ClubRosterConflictError(), 409],
  ])("maps %s service errors", async (_label, error, status) => {
    const mocks = dependencies({ addAthlete: vi.fn().mockRejectedValue(error) });

    const response = await createAdminClubRosterHandlers(mocks).POST(mutationRequest("POST"));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code: error.code, error: error.message });
  });

  it.each(["GET", "POST", "DELETE"] as const)("maps unexpected %s errors to 500", async (method) => {
    const mocks = dependencies({
      ...(method === "GET"
        ? { listTeams: vi.fn().mockRejectedValue(new Error("database unavailable")) }
        : method === "POST"
          ? { addAthlete: vi.fn().mockRejectedValue(new Error("database unavailable")) }
          : { removeAthlete: vi.fn().mockRejectedValue(new Error("database unavailable")) }),
    });
    const handler = createAdminClubRosterHandlers(mocks)[method];
    const request = method === "GET" ? getRequest() : mutationRequest(method);

    const response = await handler(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Impossible de gérer le roster Club." });
  });
});