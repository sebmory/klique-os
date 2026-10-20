import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";
import { processPartnerAthleteIntroductionOutbox } from "@/lib/partner-athlete-introductions/outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const authorized = (request: Request): boolean => {
  const configured = process.env.KLIQUE_PARTNER_INTRODUCTION_OUTBOX_SECRET?.trim() ?? "";
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!configured || !header.startsWith("Bearer ")) return false;
  const supplied = header.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
};

export async function POST(request: Request) {
  if (!isPartnerAthleteIntroductionsEnabled()) {
    return NextResponse.json({ error: "Fonction indisponible." }, { status: 404 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  try {
    const result = await processPartnerAthleteIntroductionOutbox({
      workerId: `route-${randomUUID()}`,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      `[partner_athlete_introduction_outbox] ${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json({ error: "Traitement des notifications impossible." }, { status: 500 });
  }
}
