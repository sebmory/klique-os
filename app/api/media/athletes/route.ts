import { NextResponse } from "next/server";
import { getCurrentUserPermissionContext } from "@/lib/clerk-access/service";
import { getPublicAthleteDirectoryFromGoogleSheets } from "@/lib/google-sheets";
import { isAthleteVisibleToExternalRoles } from "@/lib/public-athletes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MediaAthleteDirectoryAccess = {
  isMedia?: boolean;
  isActive?: boolean;
  workspaceId?: string | null;
  mediaId?: string | null;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<MediaAthleteDirectoryAccess>;
  listAthletes: typeof getPublicAthleteDirectoryFromGoogleSheets;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getCurrentUserPermissionContext,
  listAthletes: getPublicAthleteDirectoryFromGoogleSheets,
};

export const createMediaAthleteDirectoryHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request) {
    try {
      const access = await dependencies.getAccess(request);
      if (!access.isMedia || !access.isActive || !access.workspaceId?.trim() || !access.mediaId?.trim()) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      const athletes = (await dependencies.listAthletes())
        .filter((athlete) => isAthleteVisibleToExternalRoles(athlete.athleteId))
        .map((athlete) => ({
          athleteId: athlete.athleteId,
          name: athlete.name,
          sport: athlete.sport,
          club: athlete.club,
          portraitUrl: athlete.portraitUrl,
        }));

      return NextResponse.json({ athletes, source: "google-sheets" });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Impossible de charger l’annuaire des athlètes." },
        { status: 500 },
      );
    }
  },
});

const handlers = createMediaAthleteDirectoryHandlers();
export const GET = handlers.GET;