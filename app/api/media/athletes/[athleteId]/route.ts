import { NextResponse } from "next/server";
import { getCurrentUserPermissionContext } from "@/lib/clerk-access/service";
import { getPublicAthleteProfileFromGoogleSheets } from "@/lib/google-sheets";
import type { MediaAthletePublicProfile } from "@/types/athlete";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MediaAthleteProfileAccess = {
  isMedia?: boolean;
  isActive?: boolean;
  workspaceId?: string | null;
  mediaId?: string | null;
};

type HandlerDependencies = {
  getAccess: (request: Request) => Promise<MediaAthleteProfileAccess>;
  getAthlete: typeof getPublicAthleteProfileFromGoogleSheets;
};

const defaultDependencies: HandlerDependencies = {
  getAccess: getCurrentUserPermissionContext,
  getAthlete: getPublicAthleteProfileFromGoogleSheets,
};

export const createMediaAthleteProfileHandlers = (
  dependencies: HandlerDependencies = defaultDependencies,
) => ({
  async GET(request: Request, { params }: { params: Promise<{ athleteId: string }> }) {
    try {
      const access = await dependencies.getAccess(request);
      if (!access.isMedia || !access.isActive || !access.workspaceId?.trim() || !access.mediaId?.trim()) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      const { athleteId } = await params;
      const requestedAthleteId = athleteId.trim();
      if (!requestedAthleteId) {
        return NextResponse.json({ error: "Athlète introuvable." }, { status: 404 });
      }

      const publicProfile = await dependencies.getAthlete(requestedAthleteId);
      if (!publicProfile) {
        return NextResponse.json({ error: "Athlète public introuvable ou non visible." }, { status: 404 });
      }

      const instagram = publicProfile.socialLinks.find((link) => link.label === "Instagram")?.url.trim() || null;
      const athlete: MediaAthletePublicProfile = {
        name: publicProfile.name,
        sport: publicProfile.sport,
        club: publicProfile.club,
        age: publicProfile.age,
        nationality: publicProfile.nationality,
        position: publicProfile.position,
        palmares: publicProfile.palmares,
        shortTermGoals: publicProfile.shortTermGoals,
        longTermGoals: publicProfile.longTermGoals,
        portraitUrl: publicProfile.portraitUrl,
        journey: publicProfile.journey,
        goals: publicProfile.goals,
        instagram,
      };

      return NextResponse.json({ athlete, source: "google-sheets" });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Impossible de charger cette fiche publique." },
        { status: 500 },
      );
    }
  },
});

const handlers = createMediaAthleteProfileHandlers();
export const GET = handlers.GET;