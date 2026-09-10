import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { MediaBankForbiddenError, listAthleteMediaBankLots } from "@/lib/media-bank/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const profile = await getCurrentUserAccessProfile(request);
    const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";
    if (!clerkUserId) {
      return NextResponse.json({ ok: false, message: "Authentification requise." }, { status: 401 });
    }

    // L athleteId provient exclusivement de user_access : jamais du body ni de la query.
    const access = profile?.userAccess ?? null;
    const workspaceId = access?.workspaceId?.trim() ?? "";
    const athleteId = access?.athleteId?.trim() ?? "";

    if (access?.status !== "active" || access.role !== "athlete" || !workspaceId || !athleteId) {
      return NextResponse.json({ ok: false, message: "Acces refuse." }, { status: 403 });
    }

    const lots = await listAthleteMediaBankLots({ workspaceId, role: access.role, athleteId });
    return NextResponse.json({ ok: true, lots });
  } catch (error) {
    if (error instanceof MediaBankForbiddenError) {
      return NextResponse.json({ ok: false, message: "Acces refuse." }, { status: 403 });
    }

    console.error(`[athlete_media_bank] ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, message: "Impossible de charger vos medias." }, { status: 500 });
  }
}
