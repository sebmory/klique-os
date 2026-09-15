import { NextRequest, NextResponse } from "next/server";
import {
  evaluateBusinessAccess,
  getAthleteAccessState,
  getCurrentUserAccessProfile,
  inviteAthleteToKlique,
  type CurrentUserAccessProfile,
  type InviteAthleteResult,
} from "@/lib/clerk-access/service";
import { resolveActiveFounderAthleteId } from "@/lib/athlete-subscriptions/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AthleteInviteDependencies = {
  evaluateAccess: typeof evaluateBusinessAccess;
  getAccessProfile: (request: Request) => Promise<CurrentUserAccessProfile | null>;
  getAccessState: typeof getAthleteAccessState;
  resolveFounderAthleteId: (workspaceId: string, subscriptionId: string) => Promise<string | null>;
  inviteAthlete: (request: Request, athleteId: string, options?: { resend?: boolean }) => Promise<InviteAthleteResult>;
};

const defaultDependencies: AthleteInviteDependencies = {
  evaluateAccess: evaluateBusinessAccess,
  getAccessProfile: getCurrentUserAccessProfile,
  getAccessState: getAthleteAccessState,
  resolveFounderAthleteId: resolveActiveFounderAthleteId,
  inviteAthlete: inviteAthleteToKlique,
};

export const createAthleteInviteHandlers = (
  dependencies: AthleteInviteDependencies = defaultDependencies,
) => ({
  async GET(request: NextRequest) {
    try {
      const accessCheck = await dependencies.evaluateAccess(request, { action: "write:crm" });
      if (!accessCheck.allowed) {
        return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
      }

      const athleteId = request.nextUrl.searchParams.get("athleteId")?.trim();
      if (!athleteId) {
        return NextResponse.json({ error: "athleteId est obligatoire." }, { status: 400 });
      }

      const state = await dependencies.getAccessState(athleteId);
      return NextResponse.json({ ok: true, ...state });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Impossible de récupérer l'état d'invitation." },
        { status: 500 },
      );
    }
  },

  async POST(request: NextRequest) {
    try {
      const body = (await request.json()) as {
        athleteId?: string;
        subscriptionId?: string;
        resend?: boolean | string | number | null;
      };
      const subscriptionId = body.subscriptionId?.trim() ?? "";
      let athleteId = body.athleteId?.trim() ?? "";
      const resend = body.resend === true || body.resend === "true" || body.resend === 1;

      if (subscriptionId) {
        const profile = await dependencies.getAccessProfile(request);
        const access = profile?.userAccess;
        const workspaceId = access?.workspaceId?.trim() ?? "";
        if (access?.role !== "admin" || access.status !== "active" || !workspaceId) {
          return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
        }
        athleteId = await dependencies.resolveFounderAthleteId(workspaceId, subscriptionId) ?? "";
        if (!athleteId) {
          return NextResponse.json({ error: "Abonnement Founder actif introuvable." }, { status: 404 });
        }
      }

      if (!athleteId) {
        return NextResponse.json({ error: "athleteId ou subscriptionId est obligatoire." }, { status: 400 });
      }

      const result = resend
        ? await dependencies.inviteAthlete(request, athleteId, { resend: true })
        : await dependencies.inviteAthlete(request, athleteId);

      if (!result.ok) {
        const statusByReason: Record<string, number> = {
          forbidden: 403,
          athlete_not_found: 404,
          missing_email: 422,
          invalid_email: 422,
          already_active: 409,
          already_invited: 409,
          clerk_error: 502,
        };
        const messageByReason: Record<string, string> = {
          forbidden: "Accès refusé.",
          athlete_not_found: "Fiche athlète introuvable.",
          missing_email: "Aucune adresse email enregistrée sur cette fiche.",
          invalid_email: "L'adresse email enregistrée n'est pas valide.",
          already_active: "Cet athlète a déjà un accès actif.",
          already_invited: "Une invitation est déjà en attente pour cet athlète.",
          clerk_error: result.message ?? "Échec de l'invitation Clerk.",
        };

        return NextResponse.json(
          { ok: false, reason: result.reason, error: messageByReason[result.reason] },
          { status: statusByReason[result.reason] ?? 400 },
        );
      }

      return NextResponse.json({ ok: true, invitation: result.invitation });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Impossible d'envoyer l'invitation." },
        { status: 500 },
      );
    }
  },
});

const handlers = createAthleteInviteHandlers();

export async function GET(request: NextRequest) {
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  return handlers.POST(request);
}
