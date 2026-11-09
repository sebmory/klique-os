import { createContentStorageClient } from "@/lib/content-storage/db";

export const creativeOnboardingStatuses = [
  "invitation_to_send",
  "invitation_sent",
  "account_created",
  "profile_incomplete",
  "pending_validation",
  "active",
  "disabled",
] as const;

export type CreativeOnboardingStatus = typeof creativeOnboardingStatuses[number];

export type CreativeOnboardingProfile = {
  displayName: string;
  creativeType: "photographer" | "videographer" | "both";
  portfolioUrl: string | null;
  coverageAreas: string[];
  specialties: string[];
  bio: string | null;
  generalAvailability: string | null;
  onboardingStatus: CreativeOnboardingStatus;
  onboardingMessage: string | null;
};

export type CreativeOnboardingProfilePatch = Partial<Pick<
  CreativeOnboardingProfile,
  | "displayName"
  | "creativeType"
  | "portfolioUrl"
  | "coverageAreas"
  | "specialties"
  | "bio"
  | "generalAvailability"
>>;

const preserveText = (
  current: string | null,
  incoming: string | null | undefined,
): string | null => {
  if (incoming === undefined) return current;
  const normalized = incoming?.trim() || null;
  return normalized ?? current;
};

const preserveList = (current: string[], incoming: string[] | undefined): string[] => {
  if (incoming === undefined) return current;
  const normalized = [...new Set(incoming.map((value) => value.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : current;
};

export const mergeCreativeOnboardingProfile = (
  current: CreativeOnboardingProfile,
  patch: CreativeOnboardingProfilePatch,
): CreativeOnboardingProfile => ({
  ...current,
  displayName: preserveText(current.displayName, patch.displayName) ?? current.displayName,
  creativeType: patch.creativeType ?? current.creativeType,
  portfolioUrl: preserveText(current.portfolioUrl, patch.portfolioUrl),
  coverageAreas: preserveList(current.coverageAreas, patch.coverageAreas),
  specialties: preserveList(current.specialties, patch.specialties),
  bio: preserveText(current.bio, patch.bio),
  generalAvailability: preserveText(
    current.generalAvailability,
    patch.generalAvailability,
  ),
});

export const getCreativeProfileChecklist = (profile: CreativeOnboardingProfile) => ({
  displayName: Boolean(profile.displayName.trim()),
  creativeType: ["photographer", "videographer", "both"].includes(profile.creativeType),
  coverageAreas: profile.coverageAreas.length > 0,
  specialties: profile.specialties.length > 0,
  portfolioUrl: (() => {
    if (!profile.portfolioUrl) return false;
    try {
      return new URL(profile.portfolioUrl).protocol === "https:";
    } catch {
      return false;
    }
  })(),
  bio: Boolean(profile.bio?.trim()),
  generalAvailability: Boolean(profile.generalAvailability?.trim()),
});

export const isCreativeProfileComplete = (profile: CreativeOnboardingProfile): boolean =>
  Object.values(getCreativeProfileChecklist(profile)).every(Boolean);

export const validateCreativeOnboarding = async (
  workspaceId: string,
  creativeProfileId: string,
  actorClerkUserId: string,
): Promise<"validated" | "not_found" | "not_ready"> => {
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH current_profile AS (
      SELECT id, onboarding_status
      FROM creative_profiles
      WHERE workspace_id = $1
        AND id = $2::uuid
        AND status = 'active'
      FOR UPDATE
    ),
    updated AS (
      UPDATE creative_profiles profile
      SET onboarding_status = 'active',
          onboarding_validated_at = NOW(),
          approved_by_clerk_user_id = $3,
          approved_at = NOW(),
          updated_at = NOW()
      FROM current_profile current
      WHERE profile.id = current.id
        AND current.onboarding_status = 'pending_validation'
        AND EXISTS (
          SELECT 1
          FROM creative_access access
          WHERE access.workspace_id = $1
            AND access.creative_profile_id = current.id
            AND access.status = 'active'
        )
      RETURNING profile.id, current.onboarding_status
    ),
    event AS (
      INSERT INTO creative_onboarding_events (
        workspace_id, creative_profile_id, event_type, from_status, to_status,
        actor_clerk_user_id
      )
      SELECT $1, id, 'admin_validated', onboarding_status, 'active', $3
      FROM updated
    )
    SELECT
      EXISTS (SELECT 1 FROM current_profile) AS found,
      EXISTS (SELECT 1 FROM updated) AS validated
  `, [workspaceId, creativeProfileId, actorClerkUserId]);
  const result = rows[0] as { found?: boolean; validated?: boolean } | undefined;
  if (!result?.found) return "not_found";
  return result.validated ? "validated" : "not_ready";
};
