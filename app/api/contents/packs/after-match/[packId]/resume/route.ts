import { resumeAfterMatchPack } from "@/services/content-after-match-packs/service";
import {
  afterMatchPackErrorResponse,
  afterMatchPackMutationResponse,
  assertNoQueryParameters,
  readJsonBody,
  requirePackId,
  validateResumeAfterMatchPackBody,
} from "@/app/api/contents/packs/after-match/route-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ packId: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  try {
    assertNoQueryParameters(request);
    const { packId: rawPackId } = await params;
    const packId = requirePackId(rawPackId);
    const deliverables = validateResumeAfterMatchPackBody(await readJsonBody(request));
    const pack = await resumeAfterMatchPack(request, packId, deliverables);
    return afterMatchPackMutationResponse(pack, deliverables);
  } catch (error) {
    return afterMatchPackErrorResponse(error);
  }
}
