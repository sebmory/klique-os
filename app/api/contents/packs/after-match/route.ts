import {
  createOrResumeAfterMatchPack,
  getAfterMatchPackBySourceRevision,
} from "@/services/content-after-match-packs/service";
import {
  afterMatchPackErrorResponse,
  afterMatchPackMutationResponse,
  assertNoQueryParameters,
  projectAfterMatchPack,
  readJsonBody,
  validateCreateAfterMatchPackBody,
  validateGetAfterMatchPackQuery,
} from "@/app/api/contents/packs/after-match/route-utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const input = validateGetAfterMatchPackQuery(request);
    const pack = await getAfterMatchPackBySourceRevision(request, input);
    return NextResponse.json({ ok: true, pack: pack ? projectAfterMatchPack(pack) : null }, { status: 200 });
  } catch (error) {
    return afterMatchPackErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertNoQueryParameters(request);
    const input = validateCreateAfterMatchPackBody(await readJsonBody(request));
    const pack = await createOrResumeAfterMatchPack(request, input);
    return afterMatchPackMutationResponse(pack, ["reel", "stories"]);
  } catch (error) {
    return afterMatchPackErrorResponse(error);
  }
}
