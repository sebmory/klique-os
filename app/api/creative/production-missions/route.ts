import { NextResponse } from "next/server";
import { getCurrentUserCreativeAccessProfile } from "@/lib/clerk-access/service";
import {
  applyToProductionCreativeMission,
  listProductionCreativeMissions,
  updateProductionCreativeAssignment,
} from "@/lib/production-creative-missions";
import {
  parseApplicationInput,
  parseDeliveryInput,
} from "@/lib/production-creative-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requireAccess = async (request: Request) => {
  const access = await getCurrentUserCreativeAccessProfile(request);
  if (!access) return null;
  if (access.status !== "active" || access.creativeProfileStatus !== "active") return false;
  return access;
};

const outcomeResponse = (outcome: string) => {
  if (outcome === "not_found") return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
  if (outcome === "access_denied") return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
  if (outcome === "conditions_changed") {
    return NextResponse.json({ error: "Les conditions ont changé. Une nouvelle confirmation est requise." }, { status: 409 });
  }
  if (outcome === "confirmation_required") {
    return NextResponse.json({ error: "Confirmez les conditions actuelles avant la livraison." }, { status: 409 });
  }
  if (outcome === "already_assigned") {
    return NextResponse.json({ error: "Ce projet est déjà attribué." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
};

export async function GET(request: Request) {
  try {
    if ([...new URL(request.url).searchParams.keys()].length > 0) {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const access = await requireAccess(request);
    if (access === null) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    if (access === false) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
    if (access.onboardingStatus !== "active") {
      return NextResponse.json(
        { projects: [], onboardingRequired: true },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const projects = await listProductionCreativeMissions(access);
    return NextResponse.json({ projects }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[production_creative][list_failed]", error);
    return NextResponse.json({ error: "Impossible de charger les projets." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAccess(request);
    if (access === null) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    if (access === false) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
    if (access.onboardingStatus !== "active") {
      return NextResponse.json({ error: "Validation Admin requise." }, { status: 403 });
    }
    const input = parseApplicationInput(await request.json());
    return outcomeResponse(await applyToProductionCreativeMission(access, input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Requête invalide.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireAccess(request);
    if (access === null) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
    if (access === false) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
    if (access.onboardingStatus !== "active") {
      return NextResponse.json({ error: "Validation Admin requise." }, { status: 403 });
    }
    const input = parseDeliveryInput(await request.json());
    return outcomeResponse(await updateProductionCreativeAssignment(access, input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Requête invalide.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
