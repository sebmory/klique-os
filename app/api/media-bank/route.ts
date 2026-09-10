import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { MediaBankForbiddenError, listMediaBankLots } from "@/lib/media-bank/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const lots = await listMediaBankLots(access);
    return NextResponse.json({ ok: true, lots });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    if (error instanceof MediaBankForbiddenError) {
      return NextResponse.json({ ok: false, message: "Acces refuse." }, { status: 403 });
    }

    console.error(`[media_bank] ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, message: "Impossible de charger la banque medias." }, { status: 500 });
  }
}
