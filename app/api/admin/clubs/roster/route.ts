import { NextResponse } from "next/server";
import {
  ClubRosterError,
  ClubRosterValidationError,
  addAthleteToTeam,
  listActiveTeamRoster,
  listAvailableKliqueAthletes,
  listClubTeams,
  removeAthleteFromTeam,
  type AvailableKliqueAthlete,
  type ClubRosterMember,
  type ClubTeam,
} from "@/lib/clubs/roster-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  listTeams: (request: Request, workspaceId: unknown) => Promise<ClubTeam[]>;
  listRoster: (request: Request, workspaceId: unknown, teamId: unknown) => Promise<ClubRosterMember[]>;
  listAvailableAthletes: (
    request: Request,
    workspaceId: unknown,
    teamId: unknown,
  ) => Promise<AvailableKliqueAthlete[]>;
  addAthlete: (
    request: Request,
    input: { workspaceId?: unknown; teamId?: unknown; athleteId?: unknown },
  ) => Promise<ClubRosterMember>;
  removeAthlete: (
    request: Request,
    input: { workspaceId?: unknown; teamId?: unknown; athleteId?: unknown },
  ) => Promise<void>;
};

const defaultDependencies: HandlerDependencies = {
  listTeams: listClubTeams,
  listRoster: listActiveTeamRoster,
  listAvailableAthletes: listAvailableKliqueAthletes,
  addAthlete: addAthleteToTeam,
  removeAthlete: removeAthleteFromTeam,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const mutationFields = new Set(["workspaceId", "teamId", "athleteId"]);

const parseMutationBody = (value: unknown) => {
  if (
    !isRecord(value)
    || Object.keys(value).length !== mutationFields.size
    || !Object.keys(value).every((key) => mutationFields.has(key))
  ) {
    throw new ClubRosterValidationError(
      "Les champs workspaceId, teamId et athleteId sont requis exclusivement.",
    );
  }

  return {
    workspaceId: value.workspaceId,
    teamId: value.teamId,
    athleteId: value.athleteId,
  };
};

const parseListQuery = (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  const keys = [...searchParams.keys()];
  if (
    (keys.length !== 1 && keys.length !== 2)
    || !keys.every((key) => key === "workspaceId" || key === "teamId")
    || searchParams.getAll("workspaceId").length !== 1
    || searchParams.getAll("teamId").length > 1
  ) {
    throw new ClubRosterValidationError(
      "workspaceId est requis et teamId est le seul paramètre optionnel.",
    );
  }

  return {
    workspaceId: searchParams.get("workspaceId"),
    teamId: searchParams.get("teamId"),
  };
};

const respondWithError = (error: unknown): NextResponse => {
  if (error instanceof ClubRosterError) {
    const status = error.code === "forbidden"
      ? 403
      : error.code === "not_found"
        ? 404
        : error.code === "conflict"
          ? 409
          : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }

  return NextResponse.json(
    { error: "Impossible de gérer le roster Club." },
    { status: 500 },
  );
};

export const createAdminClubRosterHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const { workspaceId, teamId } = parseListQuery(request);
      const teams = await dependencies.listTeams(request, workspaceId);
      if (teamId === null) {
        return NextResponse.json({ teams, roster: [], availableAthletes: [] });
      }
      const roster = await dependencies.listRoster(request, workspaceId, teamId);
      const availableAthletes = await dependencies.listAvailableAthletes(request, workspaceId, teamId);
      return NextResponse.json({ teams, roster, availableAthletes });
    } catch (error) {
      return respondWithError(error);
    }
  },

  async POST(request: Request) {
    try {
      const body = await request.json().catch(() => null);
      const member = await dependencies.addAthlete(request, parseMutationBody(body));
      return NextResponse.json({ member }, { status: 201 });
    } catch (error) {
      return respondWithError(error);
    }
  },

  async DELETE(request: Request) {
    try {
      const body = await request.json().catch(() => null);
      await dependencies.removeAthlete(request, parseMutationBody(body));
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      return respondWithError(error);
    }
  },
});

const handlers = createAdminClubRosterHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;