import { NextResponse } from "next/server";
import { getAfterMatchPack } from "@/services/content-after-match-packs/service";
import {
  afterMatchPackErrorResponse,
  assertNoQueryParameters,
  projectAfterMatchPack,
  requirePackId,
} from "@/app/api/contents/packs/after-match/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ packId: string }>;
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    assertNoQueryParameters(request);
    const { packId: rawPackId } = await params;
    const packId = requirePackId(rawPackId);
    const pack = await getAfterMatchPack(request, packId);
    return NextResponse.json({ ok: true, pack: projectAfterMatchPack(pack) }, { status: 200 });
  } catch (error) {
    return afterMatchPackErrorResponse(error);
  }
}
