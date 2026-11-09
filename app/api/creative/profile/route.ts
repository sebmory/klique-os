import { NextResponse } from "next/server";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getCurrentUserCreativeAccessProfile } from "@/lib/clerk-access/service";
import {
  getCreativeProfileChecklist,
  isCreativeProfileComplete,
  type CreativeOnboardingProfile,
} from "@/lib/creatives/onboarding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requireAccess = async (request: Request) => {
  const access = await getCurrentUserCreativeAccessProfile(request);
  if (!access) return null;
  if (access.status !== "active" || access.creativeProfileStatus !== "active") return false;
  return access;
};

export async function GET(request: Request) {
  const access = await requireAccess(request);
  if (access === null) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  if (access === false) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    SELECT display_name AS "displayName", creative_type AS "creativeType",
           portfolio_url AS "portfolioUrl", coverage_areas AS "coverageAreas",
           specialties, bio, general_availability AS "generalAvailability",
           onboarding_status AS "onboardingStatus",
           onboarding_message AS "onboardingMessage"
    FROM creative_profiles
    WHERE workspace_id = $1 AND id = $2::uuid AND status = 'active'
    LIMIT 1
  `, [access.workspaceId, access.creativeProfileId]);
  const profile = (rows[0] ?? null) as CreativeOnboardingProfile | null;
  return NextResponse.json({
    profile,
    checklist: profile ? getCreativeProfileChecklist(profile) : null,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PATCH(request: Request) {
  const access = await requireAccess(request);
  if (access === null) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  if (access === false) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const allowed = [
      "displayName", "creativeType", "portfolioUrl", "coverageAreas",
      "specialties", "bio", "generalAvailability",
    ];
    if (!body || typeof body !== "object" || Array.isArray(body)
      || !Object.keys(body).every((key) => allowed.includes(key))) {
      throw new Error("Requête invalide.");
    }
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName || displayName.length > 200) throw new Error("Nom invalide.");
    if (!["photographer", "videographer", "both"].includes(String(body.creativeType))) {
      throw new Error("Type créatif invalide.");
    }
    const portfolioUrl = typeof body.portfolioUrl === "string" ? body.portfolioUrl.trim() : "";
    if (portfolioUrl) {
      const parsed = new URL(portfolioUrl);
      if (parsed.protocol !== "https:") throw new Error("Le portfolio doit utiliser HTTPS.");
    }
    const arrayField = (value: unknown, label: string) => {
      if (!Array.isArray(value) || value.length > 30) throw new Error(`${label} invalide.`);
      return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
    };
    const coverageAreas = arrayField(body.coverageAreas, "Régions");
    const specialties = arrayField(body.specialties, "Sports");
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";
    const generalAvailability = typeof body.generalAvailability === "string"
      ? body.generalAvailability.trim()
      : "";
    if (bio.length > 1000 || generalAvailability.length > 1000) throw new Error("Texte trop long.");
    const onboardingProfile: CreativeOnboardingProfile = {
      displayName,
      creativeType: body.creativeType as CreativeOnboardingProfile["creativeType"],
      portfolioUrl: portfolioUrl || null,
      coverageAreas,
      specialties,
      bio: bio || null,
      generalAvailability: generalAvailability || null,
      onboardingStatus: "profile_incomplete",
      onboardingMessage: null,
    };
    const nextOnboardingStatus = isCreativeProfileComplete(onboardingProfile)
      ? "pending_validation"
      : "profile_incomplete";
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      WITH current_profile AS (
        SELECT profile.id, profile.onboarding_status
        FROM creative_profiles profile
        JOIN creative_access access
          ON access.workspace_id = profile.workspace_id
         AND access.creative_profile_id = profile.id
         AND access.clerk_user_id = $10
         AND access.status = 'active'
        WHERE profile.workspace_id = $1
          AND profile.id = $2::uuid
          AND profile.status = 'active'
        FOR UPDATE OF profile
      ),
      updated AS (
        UPDATE creative_profiles profile
        SET display_name = $3, creative_type = $4, portfolio_url = $5,
            coverage_areas = $6::text[], specialties = $7::text[], bio = $8,
            general_availability = $9, onboarding_status = $11,
            onboarding_submitted_at = CASE WHEN $11 = 'pending_validation' THEN NOW() ELSE NULL END,
            onboarding_validated_at = NULL,
            updated_at = NOW()
        FROM current_profile current
        WHERE profile.id = current.id
        RETURNING profile.id, current.onboarding_status
      ),
      event AS (
        INSERT INTO creative_onboarding_events (
          workspace_id, creative_profile_id, event_type, from_status, to_status,
          actor_clerk_user_id
        )
        SELECT $1, id, 'profile_saved', onboarding_status, $11, $10
        FROM updated
      )
      SELECT id FROM updated
    `, [
      access.workspaceId, access.creativeProfileId, displayName, body.creativeType,
      portfolioUrl || null, coverageAreas, specialties, bio || null,
      generalAvailability || null, access.clerkUserId, nextOnboardingStatus,
    ]);
    if (!rows[0]) return NextResponse.json({ error: "Accès créatif refusé." }, { status: 403 });
    return NextResponse.json({
      ok: true,
      onboardingStatus: nextOnboardingStatus,
      checklist: getCreativeProfileChecklist({
        ...onboardingProfile,
        onboardingStatus: nextOnboardingStatus,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Requête invalide." },
      { status: 400 },
    );
  }
}
