import { NextRequest, NextResponse } from "next/server";
import { evaluateBusinessAccess, getAthleteAccessState, inviteAthleteToKlique } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const athleteId = request.nextUrl.searchParams.get("athleteId")?.trim();
    if (!athleteId) {
      return NextResponse.json({ error: "athleteId est obligatoire." }, { status: 400 });
    }

    const state = await getAthleteAccessState(athleteId);
    return NextResponse.json({ ok: true, ...state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de récupérer l'état d'invitation." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("[api/athletes/invite][POST] start");
    const body = (await request.json()) as { athleteId?: string; resend?: boolean | string | number | null };
    const athleteId = body.athleteId?.trim();
    const resend = body.resend === true || body.resend === "true" || body.resend === 1;
    console.log("[api/athletes/invite][POST] resend-debug", {
      payload: body,
      resend,
      resendType: typeof body.resend,
    });
    console.log("[api/athletes/invite][POST] athleteId", { athleteId });
    if (!athleteId) {
      return NextResponse.json({ error: "athleteId est obligatoire." }, { status: 400 });
    }

    const result = resend
      ? await inviteAthleteToKlique(request, athleteId, { resend: true })
      : await inviteAthleteToKlique(request, athleteId);
    console.log("[api/athletes/invite][POST] inviteAthleteToKlique result", result);

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

      console.log("[api/athletes/invite][POST] error mapping", {
        reason: result.reason,
        status: statusByReason[result.reason] ?? 400,
        error: messageByReason[result.reason],
      });

      return NextResponse.json(
        { ok: false, reason: result.reason, error: messageByReason[result.reason] },
        { status: statusByReason[result.reason] ?? 400 }
      );
    }

    return NextResponse.json({ ok: true, invitation: result.invitation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible d'envoyer l'invitation." },
      { status: 500 }
    );
  }
}
