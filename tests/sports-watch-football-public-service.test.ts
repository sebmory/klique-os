import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAthletes: vi.fn(),
  discoverTeam: vi.fn(),
  saveBinding: vi.fn(),
}));

vi.mock("@/lib/partner-athlete-introductions/local-fixtures", () => ({
  localAdminFixtureAthletes: vi.fn(),
  localIntroductionFixturesEnabled: () => false,
}));

vi.mock("@/lib/sports-watch/athlete-directory", () => ({
  SportsWatchAthleteDirectory: {
    resolve: mocks.resolveAthletes,
  },
}));

vi.mock("@/lib/sports-watch/football-public-collector", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/sports-watch/football-public-collector")>(),
  discoverFootstatsFootballTeam: mocks.discoverTeam,
}));

vi.mock("@/lib/sports-watch/football-public-repository", () => ({
  FootballPublicRepository: {
    saveBinding: mocks.saveBinding,
  },
}));

import { FootballPublicService } from "@/lib/sports-watch/football-public-service";

const identity = {
  workspaceId: "workspace-a",
  clerkUserId: "admin-a",
};

const athletes = [
  {
    key: "matheus",
    athleteId: "matheus",
    name: "Matheus Monteiro",
    sport: "Football",
    club: "FC Richemond I",
  },
  {
    key: "aggee",
    athleteId: "aggee",
    name: "Aggee Wenzi",
    sport: "Football",
    club: "FC Breitenrain",
  },
  {
    key: "abdou",
    athleteId: "abdou",
    name: "Abdou Böbödi Camara",
    sport: "Football",
    club: "Vevey-Sports",
  },
  {
    key: "victor",
    athleteId: "victor",
    name: "Victor Perez",
    sport: "Football",
    club: "",
  },
];

const discovery = (teamId: string, playerId: string, playerName: string) => ({
  footstatsTeamId: teamId,
  teamName: "Équipe publique",
  competition: "Compétition",
  season: "2026/27",
  teamUrl: `https://www.footstats.ch/de/teams/${teamId}/`,
  rosterUrl: `https://www.footstats.ch/de/teams/${teamId}/players/`,
  players: [{
    id: playerId,
    name: playerName,
    shirtNumber: "10",
    position: "Milieu",
    profileUrl: `https://www.footstats.ch/de/players/${playerId}/`,
  }],
  warnings: [],
});

describe("football public binding allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAthletes.mockResolvedValue(athletes);
    mocks.discoverTeam.mockImplementation(async (teamId: string) => {
      if (teamId === "wjsj6p08") {
        return discovery(teamId, "1s5eh85j", "Wenzi Aggee Wenzi");
      }
      if (teamId === "ddcznrjs") {
        return discovery(teamId, "b1w0pfkt", "Abdoulaye Camara");
      }
      return discovery(teamId, "1e318qst", "Matheus Monteiro");
    });
  });

  it.each([
    ["matheus", "xh89ete5"],
    ["aggee", "wjsj6p08"],
    ["abdou", "ddcznrjs"],
  ])("allows the authorized team for %s", async (athleteId, teamId) => {
    await expect(FootballPublicService.discover(athleteId, teamId, identity))
      .resolves.toMatchObject({ footstatsTeamId: teamId });
    expect(mocks.discoverTeam).toHaveBeenCalledWith(teamId);
  });

  it("rejects an authorized team assigned to a different athlete", async () => {
    await expect(FootballPublicService.discover("aggee", "ddcznrjs", identity))
      .rejects.toThrow("L’équipe Footstats ne correspond pas");
    expect(mocks.discoverTeam).not.toHaveBeenCalled();
  });

  it("rejects every football athlete outside the explicit allowlist", async () => {
    await expect(FootballPublicService.discover("victor", "wjsj6p08", identity))
      .rejects.toThrow("ne fait pas partie des rattachements football autorisés");
    expect(mocks.discoverTeam).not.toHaveBeenCalled();
  });

  it("persists the selected public player only after explicit identity confirmation", async () => {
    mocks.saveBinding.mockImplementation(async (input) => ({
      id: "00000000-0000-4000-8000-000000000001",
      athleteId: input.athleteId,
      footstatsTeamId: input.discovery.footstatsTeamId,
      status: input.status,
    }));

    await expect(FootballPublicService.saveBinding({
      athleteId: "abdou",
      teamId: "ddcznrjs",
      selectedPlayerId: "b1w0pfkt",
      affTeamId: null,
      affPlayerId: null,
      status: "verified",
      identityMatchConfirmed: true,
      expectedVersion: 0,
    }, identity)).resolves.toMatchObject({
      athleteId: "abdou",
      footstatsTeamId: "ddcznrjs",
      status: "verified",
    });
    expect(mocks.saveBinding).toHaveBeenCalledWith(expect.objectContaining({
      athleteId: "abdou",
      selectedPlayerId: "b1w0pfkt",
      status: "verified",
      evidence: expect.arrayContaining([
        "Joueur choisi explicitement dans l’effectif : Abdoulaye Camara (b1w0pfkt).",
        "Correspondance confirmée explicitement par l’Admin avec Abdou Böbödi Camara.",
      ]),
    }));
  });
});
