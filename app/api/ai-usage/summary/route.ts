import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { getAiUsageSummary } from "@/lib/ai-usage/summary-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isValidIsoDate = (value: string): boolean => {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

export async function GET(request: Request) {
  try {
    const accessContext = await requireContentAccess(request);

    const url = new URL(request.url);
    const from = (url.searchParams.get("from") ?? "").trim();
    const to = (url.searchParams.get("to") ?? "").trim();

    if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
      return NextResponse.json(
        { ok: false, message: "Parametres from/to invalides (format ISO requis)." },
        { status: 400 }
      );
    }

    if (Date.parse(from) >= Date.parse(to)) {
      return NextResponse.json(
        { ok: false, message: "La periode from doit etre anterieure a to." },
        { status: 400 }
      );
    }

    const requestedClerkUserId = url.searchParams.get("clerkUserId")?.trim() || undefined;

    const clerkUserId = accessContext.isAdmin ? requestedClerkUserId : accessContext.clerkUserId;

    const summary = await getAiUsageSummary({
      workspaceId: accessContext.workspaceId,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      clerkUserId,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[ai_usage] Failed to build usage summary: ${reason}`);
    return NextResponse.json({ ok: false, message: "Impossible de calculer la synthese d usage IA." }, { status: 500 });
  }
}
