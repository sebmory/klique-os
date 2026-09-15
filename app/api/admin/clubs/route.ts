import { NextResponse } from "next/server";
import {
  ClubAdminError,
  ClubAdminValidationError,
  listProvisionedClubs,
  provisionClub,
  type ProvisionedClub,
  type ProvisionedClubWithInitialTeam,
  type ProvisionClubInput,
} from "@/lib/clubs/admin-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HandlerDependencies = {
  listClubs: (request: Request) => Promise<ProvisionedClub[]>;
  createClub: (
    request: Request,
    input: ProvisionClubInput,
  ) => Promise<ProvisionedClubWithInitialTeam>;
};

const defaultDependencies: HandlerDependencies = {
  listClubs: listProvisionedClubs,
  createClub: provisionClub,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const allowedPostFields = new Set(["id", "name", "teamName", "season"]);

const parseCreateBody = (value: unknown): ProvisionClubInput => {
  if (
    !isRecord(value)
    || Object.keys(value).length !== allowedPostFields.size
    || !Object.keys(value).every((key) => allowedPostFields.has(key))
  ) {
    throw new ClubAdminValidationError("Les champs id, name, teamName et season sont requis exclusivement.");
  }

  return {
    workspaceId: value.id,
    clubName: value.name,
    teamName: value.teamName,
    season: value.season,
  };
};

const respondWithError = (error: unknown): NextResponse => {
  if (error instanceof ClubAdminError) {
    const status = error.code === "forbidden"
      ? 403
      : error.code === "conflict"
        ? 409
        : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }

  return NextResponse.json(
    { error: "Impossible de gérer les clubs." },
    { status: 500 },
  );
};

export const createAdminClubHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const clubs = await dependencies.listClubs(request);
      return NextResponse.json({ clubs });
    } catch (error) {
      return respondWithError(error);
    }
  },

  async POST(request: Request) {
    try {
      const body = await request.json().catch(() => null);
      const input = parseCreateBody(body);
      const club = await dependencies.createClub(request, input);
      return NextResponse.json({ club }, { status: 201 });
    } catch (error) {
      return respondWithError(error);
    }
  },
});

const handlers = createAdminClubHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;