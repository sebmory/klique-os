import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isPartnerAthleteIntroductionsEnabled } from "@/lib/partner-athlete-introductions/activation";
import {
  getPartnerAthleteIntroductionOutboxDiagnostics,
  processPartnerAthleteIntroductionOutbox,
} from "@/lib/partner-athlete-introductions/outbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const authorized = (request: Request, configured: string): boolean => {
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (!configured || !header.startsWith("Bearer ")) return false;
  const supplied = header.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
};

const executeOutbox = async (source: "cron" | "internal") => {
  const result = await processPartnerAthleteIntroductionOutbox({
    workerId: `${source}-${randomUUID()}`,
  });
  let diagnostics = null;
  try {
    diagnostics = await getPartnerAthleteIntroductionOutboxDiagnostics();
  } catch {
    console.warn(
      `[partner_athlete_introduction_outbox] source=${source} diagnostics=unavailable`,
    );
  }
  console.info(
    [
      "[partner_athlete_introduction_outbox]",
      `source=${source}`,
      `claimed=${result.claimed}`,
      `delivered=${result.delivered}`,
      `discarded=${result.discarded}`,
      `retried=${result.retried}`,
      `failed=${result.failed}`,
      `stored_failed=${diagnostics?.failed ?? "unknown"}`,
      `stale_pending=${diagnostics?.stalePending ?? "unknown"}`,
      `stale_processing=${diagnostics?.staleProcessing ?? "unknown"}`,
    ].join(" "),
  );
  return { result, diagnostics };
};

export async function POST(request: Request) {
  if (!isPartnerAthleteIntroductionsEnabled()) {
    return NextResponse.json({ error: "Fonction indisponible." }, { status: 404 });
  }
  const configured = process.env.KLIQUE_PARTNER_INTRODUCTION_OUTBOX_SECRET?.trim() ?? "";
  if (!authorized(request, configured)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  try {
    const { result } = await executeOutbox("internal");
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      `[partner_athlete_introduction_outbox] source=internal execution=failed type=${error instanceof Error ? error.name : "unknown"}`,
    );
    return NextResponse.json({ error: "Traitement des notifications impossible." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const configured = process.env.CRON_SECRET?.trim() ?? "";
  if (!authorized(request, configured)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  if (!isPartnerAthleteIntroductionsEnabled()) {
    return new Response(null, { status: 204 });
  }
  try {
    const execution = await executeOutbox("cron");
    return NextResponse.json(execution);
  } catch (error) {
    console.error(
      `[partner_athlete_introduction_outbox] source=cron execution=failed type=${error instanceof Error ? error.name : "unknown"}`,
    );
    return NextResponse.json({ error: "Traitement des notifications impossible." }, { status: 500 });
  }
}
