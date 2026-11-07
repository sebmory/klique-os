import { NextResponse } from "next/server";
import {
  getDefaultCreativeAdminAccess,
  requireCreativeAdminContext,
} from "@/lib/creatives/admin-route";
import {
  createProductionCreativeBrief,
  listProductionCreativeBriefsForSource,
  parseAdminBriefInput,
  parseAdminConditionsInput,
  transitionProductionCreativeBrief,
  updateProductionCreativeConditions,
  verifyProductionSourceAnchor,
} from "@/lib/admin-production-creative";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireCreativeAdminContext(request, getDefaultCreativeAdminAccess);
  if ("response" in access) return access.response;
  const params = new URL(request.url).searchParams;
  const sourceRow = Number(params.get("productionSourceRow"));
  const sourceFingerprint = params.get("productionSourceFingerprint")?.trim() ?? "";
  if ([...params.keys()].some((key) =>
    !["productionSourceRow", "productionSourceFingerprint"].includes(key)
  )
    || !Number.isInteger(sourceRow) || sourceRow < 4
    || !/^[0-9a-f]{64}$/.test(sourceFingerprint)) {
    return NextResponse.json({ error: "Production source invalide." }, { status: 400 });
  }
  try {
    const sourceAnchorState = await verifyProductionSourceAnchor(sourceRow, sourceFingerprint);
    const briefs = await listProductionCreativeBriefsForSource(
      access.context.workspaceId,
      sourceRow,
      sourceFingerprint,
    );
    return NextResponse.json({ briefs, sourceAnchorState }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[production_creative_admin][list_failed]", error);
    return NextResponse.json({ error: "Impossible de charger les briefs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireCreativeAdminContext(request, getDefaultCreativeAdminAccess);
  if ("response" in access) return access.response;
  try {
    const input = parseAdminBriefInput(await request.json());
    const sourceAnchorState = await verifyProductionSourceAnchor(
      input.productionSourceRow,
      input.productionSourceFingerprint,
    );
    if (sourceAnchorState !== "exact") {
      return NextResponse.json(
        { error: "Le rattachement à la production est modifié, absent ou ambigu.", sourceAnchorState },
        { status: 409 },
      );
    }
    const id = await createProductionCreativeBrief(access.context, input);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("[production_creative_admin][create_failed]", error);
    const databaseError = error && typeof error === "object"
      ? error as { code?: unknown; constraint?: unknown }
      : null;
    if (
      databaseError?.code === "23505"
      && databaseError.constraint === "production_creative_briefs_source_anchor_unique_idx"
    ) {
      return NextResponse.json(
        { error: "Un brief existe déjà pour cet ancrage Production." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de créer le brief." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const access = await requireCreativeAdminContext(request, getDefaultCreativeAdminAccess);
  if ("response" in access) return access.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (
      !body || typeof body !== "object" || Array.isArray(body)
      || !["publish", "assign", "request_changes", "validate_delivery", "update_conditions"].includes(String(body.action))
    ) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    if (body.action === "update_conditions") {
      const outcome = await updateProductionCreativeConditions(
        access.context,
        String(body.briefId ?? ""),
        parseAdminConditionsInput(body.conditions),
      );
      if (outcome === "not_found") return NextResponse.json({ error: "Brief introuvable." }, { status: 404 });
      return NextResponse.json({ ok: true, unchanged: outcome === "unchanged" });
    }
    const outcome = await transitionProductionCreativeBrief(access.context, {
      briefId: String(body.briefId ?? ""),
      action: body.action as "publish" | "assign" | "request_changes" | "validate_delivery",
      creativeProfileId: typeof body.creativeProfileId === "string" ? body.creativeProfileId : undefined,
      comment: typeof body.comment === "string" ? body.comment : undefined,
    });
    if (outcome === "not_found") return NextResponse.json({ error: "Brief introuvable." }, { status: 404 });
    if (outcome === "conflict") return NextResponse.json({ error: "Transition impossible dans l’état actuel." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[production_creative_admin][transition_failed]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossible de modifier le brief." },
      { status: 400 },
    );
  }
}
