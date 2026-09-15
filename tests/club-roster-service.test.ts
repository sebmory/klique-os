import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Athlete } from "@/types/athlete";

const { getCurrentUserAccessProfileMock } = vi.hoisted(() => ({
  getCurrentUserAccessProfileMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

import {
  ClubRosterConflictError,
  ClubRosterForbiddenError,
  ClubRosterNotFoundError,
  ClubRosterValidationError,
  addAthleteToTeam,
  listActiveTeamRoster,
  listAvailableKliqueAthletes,
  listClubTeams,
  removeAthleteFromTeam,
  type ClubRosterDependencies,
  type ClubRosterRepository,
} from "@/lib/clubs/roster-service";

const request = new Request("http://localhost/admin/clubs/elfic-fribourg/roster");
const teamId = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";
const membershipId = "927f53ef-6d5e-46cc-8891-411bd904f4fc";

const athlete = (overrides: Partial<Athlete> = {}): Athlete => ({
  athleteId: "athlete-1",
  key: "athlete-1",
  name: "Mila Benjak",
  sport: "Basketball",
  status: "Actif",
  ...overrides,
} as Athlete);

const teamRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: teamId,
  workspace_id: "elfic-fribourg",
  name: "Equipe premiere",
  season: "2026-2027",
  status: "active",
  ...overrides,
});

const rosterRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: membershipId,
  workspace_id: "elfic-fribourg",
  team_id: teamId,
  athlete_id: "athlete-1",
  joined_on: "2026-09-15",
  ...overrides,
});

const createDependencies = (overrides: {
  repository?: Partial<ClubRosterRepository>;
  athletes?: Athlete[];
  today?: string;
} = {}) => {
  const repository: ClubRosterRepository = {
    getClub: vi.fn().mockResolvedValue({ workspace_id: "elfic-fribourg" }),
    listTeams: vi.fn().mockResolvedValue([teamRow()]),
    getTeam: vi.fn().mockResolvedValue(teamRow()),
    listActiveRoster: vi.fn().mockResolvedValue([rosterRow()]),
    listActiveAthleteIds: vi.fn().mockResolvedValue([]),
    addActive: vi.fn().mockResolvedValue(rosterRow()),
    removeActive: vi.fn().mockResolvedValue({ ...rosterRow(), status: "inactive", left_on: "2026-09-20" }),
    ...overrides.repository,
  };
  const dependencies: ClubRosterDependencies = {
    repository,
    listKliqueAthletes: vi.fn().mockResolvedValue(overrides.athletes ?? [athlete()]),
    today: () => overrides.today ?? "2026-09-20",
  };
  return { dependencies, repository };
};

const asActiveAdmin = () => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "user-admin", email: "admin@example.test" },
    userAccess: {
      clerkUserId: "user-admin",
      role: "admin",
      status: "active",
      workspaceId: "klique-os",
    },
  });
};

describe("Club roster Admin service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asActiveAdmin();
  });

  it("lists teams only after verifying the normalized Club workspace", async () => {
    const { dependencies, repository } = createDependencies();

    await expect(listClubTeams(request, " ELFIC-FRIBOURG ", dependencies)).resolves.toEqual([{
      id: teamId,
      workspaceId: "elfic-fribourg",
      name: "Equipe premiere",
      season: "2026-2027",
      status: "active",
    }]);
    expect(repository.getClub).toHaveBeenCalledWith("elfic-fribourg");
    expect(repository.listTeams).toHaveBeenCalledWith("elfic-fribourg");
  });

  it("lists the active roster with canonical KLIQUE Athlete data", async () => {
    const { dependencies, repository } = createDependencies({
      repository: {
        listActiveRoster: vi.fn().mockResolvedValue([
          rosterRow({ joined_on: new Date("2026-09-15T00:00:00.000Z") }),
        ]),
      },
    });

    await expect(listActiveTeamRoster(
      request,
      "elfic-fribourg",
      ` ${teamId.toUpperCase()} `,
      dependencies,
    )).resolves.toEqual([{
      id: membershipId,
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "athlete-1",
      athleteName: "Mila Benjak",
      sport: "Basketball",
      joinedOn: "2026-09-15",
    }]);
    expect(repository.getTeam).toHaveBeenCalledWith("elfic-fribourg", teamId);
    expect(repository.listActiveRoster).toHaveBeenCalledWith("elfic-fribourg", teamId);
  });

  it("lists canonical Athletes not already active in the team", async () => {
    const { dependencies } = createDependencies({
      athletes: [
        athlete(),
        athlete({ athleteId: "athlete-2", key: "athlete-2", name: "Zoé Dupont", sport: "Basketball" }),
      ],
      repository: {
        listActiveAthleteIds: vi.fn().mockResolvedValue([{ athlete_id: "athlete-1" }]),
      },
    });

    await expect(listAvailableKliqueAthletes(request, "elfic-fribourg", teamId, dependencies)).resolves.toEqual([{
      athleteId: "athlete-2",
      name: "Zoé Dupont",
      sport: "Basketball",
      status: "Actif",
    }]);
  });

  it("adds a canonical Athlete to the verified active team", async () => {
    const { dependencies, repository } = createDependencies({
      repository: {
        addActive: vi.fn().mockResolvedValue(
          rosterRow({ joined_on: "2026-09-15T00:00:00.000Z" }),
        ),
      },
    });

    const member = await addAthleteToTeam(request, {
      workspaceId: " ELFIC-FRIBOURG ",
      teamId: ` ${teamId.toUpperCase()} `,
      athleteId: " athlete-1 ",
      joinedOn: "2026-09-15",
    }, dependencies);

    expect(repository.addActive).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "athlete-1",
      joinedOn: "2026-09-15",
    });
    expect(member.athleteId).toBe("athlete-1");
    expect(member.joinedOn).toBe("2026-09-15");
  });

  it("uses the server date when entry and exit dates are omitted", async () => {
    const { dependencies, repository } = createDependencies({ today: "2026-09-20" });

    await addAthleteToTeam(request, {
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "athlete-1",
    }, dependencies);
    await removeAthleteFromTeam(request, {
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "athlete-1",
    }, dependencies);

    expect(repository.addActive).toHaveBeenCalledWith(expect.objectContaining({ joinedOn: "2026-09-20" }));
    expect(repository.removeActive).toHaveBeenCalledWith({
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "athlete-1",
      leftOn: "2026-09-20",
    });
  });

  it("retires an Athlete through repository history preservation instead of deletion", async () => {
    const { dependencies, repository } = createDependencies({
      repository: {
        removeActive: vi.fn().mockResolvedValue({
          ...rosterRow({ joined_on: new Date("2026-09-15T00:00:00.000Z") }),
          status: "inactive",
          left_on: new Date("2026-09-21T00:00:00.000Z"),
        }),
      },
    });

    await expect(removeAthleteFromTeam(request, {
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "athlete-1",
      leftOn: "2026-09-21",
    }, dependencies)).resolves.toBeUndefined();

    expect(repository.removeActive).toHaveBeenCalledWith({
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "athlete-1",
      leftOn: "2026-09-21",
    });
    expect(repository).not.toHaveProperty("delete");
  });

  it.each([
    ["missing identity", null],
    ["inactive Admin", { clerkUser: { id: "user-admin" }, userAccess: { role: "admin", status: "disabled", workspaceId: "klique-os" } }],
    ["non Admin", { clerkUser: { id: "user-media" }, userAccess: { role: "media", status: "active", workspaceId: "klique-os" } }],
  ])("rejects %s before roster access", async (_label, profile) => {
    getCurrentUserAccessProfileMock.mockResolvedValue(profile);
    const { dependencies, repository } = createDependencies();

    await expect(listClubTeams(request, "elfic-fribourg", dependencies))
      .rejects.toBeInstanceOf(ClubRosterForbiddenError);
    expect(repository.getClub).not.toHaveBeenCalled();
  });

  it("rejects an unknown Club workspace before team access", async () => {
    const { dependencies, repository } = createDependencies({
      repository: { getClub: vi.fn().mockResolvedValue(null) },
    });

    await expect(listClubTeams(request, "unknown-club", dependencies))
      .rejects.toBeInstanceOf(ClubRosterNotFoundError);
    expect(repository.listTeams).not.toHaveBeenCalled();
  });

  it("rejects a team outside the requested Club workspace", async () => {
    const { dependencies, repository } = createDependencies({
      repository: { getTeam: vi.fn().mockResolvedValue(null) },
    });

    await expect(listActiveTeamRoster(request, "elfic-fribourg", teamId, dependencies))
      .rejects.toMatchObject({ code: "not_found" });
    expect(repository.listActiveRoster).not.toHaveBeenCalled();
  });

  it("rejects an unknown canonical athleteId before insertion", async () => {
    const { dependencies, repository } = createDependencies();

    await expect(addAthleteToTeam(request, {
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "unknown-athlete",
    }, dependencies)).rejects.toMatchObject({ code: "not_found" });
    expect(repository.addActive).not.toHaveBeenCalled();
  });

  it.each([
    ["empty insert result", vi.fn().mockResolvedValue(null)],
    ["database unique violation", vi.fn().mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }))],
  ])("prevents active duplicates for %s", async (_label, addActive) => {
    const { dependencies } = createDependencies({ repository: { addActive } });

    await expect(addAthleteToTeam(request, {
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "athlete-1",
    }, dependencies)).rejects.toBeInstanceOf(ClubRosterConflictError);
  });

  it("rejects removal when no active historical row can be closed", async () => {
    const { dependencies } = createDependencies({
      repository: { removeActive: vi.fn().mockResolvedValue(null) },
    });

    await expect(removeAthleteFromTeam(request, {
      workspaceId: "elfic-fribourg",
      teamId,
      athleteId: "athlete-1",
      leftOn: "2026-09-20",
    }, dependencies)).rejects.toMatchObject({ code: "not_found" });
  });

  it.each([
    ["workspace", { workspaceId: "Club suisse", teamId, athleteId: "athlete-1" }],
    ["team", { workspaceId: "elfic-fribourg", teamId: "not-a-uuid", athleteId: "athlete-1" }],
    ["athlete", { workspaceId: "elfic-fribourg", teamId, athleteId: " " }],
    ["entry date", { workspaceId: "elfic-fribourg", teamId, athleteId: "athlete-1", joinedOn: "2026-02-30" }],
  ])("rejects invalid %s before mutation", async (_label, input) => {
    const { dependencies, repository } = createDependencies();

    await expect(addAthleteToTeam(request, input, dependencies))
      .rejects.toBeInstanceOf(ClubRosterValidationError);
    expect(repository.addActive).not.toHaveBeenCalled();
  });
});