import { randomUUID } from "crypto";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";
import { getAthletesFromGoogleSheets, getMediaFromGoogleSheets, getPartnersFromGoogleSheets } from "@/lib/google-sheets";
import {
  getActiveMediaOrganization,
  MediaOrganizationError,
} from "@/lib/media-organizations/service";

const getBootstrapAdminEmail = (): string | null => {
  const configuredEmail = process.env.KLIQUE_BOOTSTRAP_ADMIN_EMAIL?.trim();
  return configuredEmail ? configuredEmail.toLowerCase() : null;
};

export type ClerkUserAccessRole = "admin" | "athlete" | "partner_expert" | "media";
export type ClerkUserAccessStatus = "invited" | "active" | "disabled";

export type ClerkUserAccessRecord = {
  clerkUserId: string;
  email: string;
  role: ClerkUserAccessRole;
  workspaceId: string;
  athleteId: string | null;
  partnerId: string | null;
  mediaId: string | null;
  status: ClerkUserAccessStatus;
  createdAt: string;
  updatedAt: string;
};

export type CurrentUserAccessProfile = {
  clerkUser: {
    id: string;
    email: string | null;
  };
  userAccess: ClerkUserAccessRecord | null;
  creativeAccess: CreativeAccessRecord | null;
};

export type UserAccessPermissionContext = {
  role: ClerkUserAccessRole;
  athleteId: string | null;
  partnerId: string | null;
  mediaId: string | null;
  creativeProfileId: string | null;
  workspaceId: string;
  status: ClerkUserAccessStatus;
  creativeAccessStatus: CreativeAccessState;
  isAdmin: boolean;
  isAthlete: boolean;
  isPartnerExpert: boolean;
  isMedia: boolean;
  isCreative: boolean;
  isActive: boolean;
  hasFullAccess: boolean;
  canAccessPersonalSpace: boolean;
  canAccessCommunityZones: boolean;
  canAccessAthleteSpace: boolean;
  canAccessPartnerSpace: boolean;
  canAccessCreativeSpace: boolean;
};

export type CurrentUserBusinessResolution = {
  businessType: "admin" | "athlete" | "partner" | "media" | "unlinked" | "invalid";
  businessRecord: Record<string, unknown> | null;
  reason: "admin" | "no_link" | "missing_record" | "invalid_role";
};

export type BusinessAccessEvaluation = {
  allowed: boolean;
  reason: "allowed" | "admin_required" | "role_forbidden" | "owner_mismatch" | "no_link" | "missing_record" | "invalid_role";
};

export type AthleteInvitationStatus = "invited" | "accepted" | "revoked";

export type AthleteInvitationRecord = {
  athleteId: string;
  email: string;
  clerkInvitationId: string;
  status: AthleteInvitationStatus;
  invitedByClerkUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AthleteAccessState = "none" | "invited" | "active";

export type PartnerAccessState = "none" | "invited" | "active";

export type PartnerInvitationIdentity = {
  partnerId: string;
  email: string;
  legacyPartnerIds?: string[];
};

export type CreativeAccessState = "none" | "invited" | "active" | "revoked";

export type CreativeAccessRecord = {
  id: string;
  workspaceId: string;
  creativeProfileId: string;
  clerkUserId: string;
  status: CreativeAccessState;
  invitationEmail: string;
  invitedByClerkUserId: string | null;
  invitedAt: string;
  activatedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creativeDisplayName: string | null;
  creativeProfileStatus: string | null;
};

export type CurrentCreativeAccessProfile = {
  creativeProfileId: string | null;
  workspaceId: string | null;
  status: CreativeAccessState;
  record: CreativeAccessRecord | null;
};

export type InviteAthleteResult =
  | { ok: true; invitation: AthleteInvitationRecord }
  | {
      ok: false;
      reason: "forbidden" | "missing_email" | "invalid_email" | "already_active" | "already_invited" | "athlete_not_found" | "clerk_error";
      message?: string;
    };

export type InvitePartnerResult =
  | { ok: true; partnerId: string; email: string; clerkInvitationId: string }
  | {
      ok: false;
      reason: "forbidden" | "missing_email" | "invalid_email" | "already_active" | "already_invited" | "partner_not_found" | "clerk_error";
      message?: string;
    };

export type InviteCreativeResult =
  | { ok: true; creativeProfileId: string; email: string; clerkInvitationId: string; workspaceId: string }
  | {
      ok: false;
      reason: "forbidden" | "missing_email" | "invalid_email" | "already_active" | "already_invited" | "creative_not_found" | "inactive_profile" | "clerk_error";
      message?: string;
    };

export type RevokeCreativeAccessResult =
  | { ok: true; creativeProfileId: string }
  | {
      ok: false;
      reason: "forbidden" | "creative_not_found" | "not_invited" | "clerk_error";
      message?: string;
    };

const allowedRoles: ClerkUserAccessRole[] = ["admin", "athlete", "partner_expert", "media"];
const allowedStatuses: ClerkUserAccessStatus[] = ["invited", "active", "disabled"];
const allowedInvitationStatuses: AthleteInvitationStatus[] = ["invited", "accepted", "revoked"];
const clerkAuthorizedParties = ["http://localhost:3000", "https://klique-os.vercel.app", "https://app.klique.ch"];

const ensureNodeRuntime = () => {
  if (typeof window !== "undefined") {
    throw new Error("Clerk access service is server-only.");
  }
};

const getSql = () => {
  ensureNodeRuntime();
  return createContentStorageClient();
};

const createUserAccessTable = async () => {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS user_access (
      clerk_user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'athlete', 'partner_expert', 'media')),
      workspace_id TEXT NOT NULL,
      athlete_id TEXT,
      partner_id TEXT,
      media_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
};

const createAthleteInvitationsTable = async () => {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS athlete_invitations (
      athlete_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      clerk_invitation_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('invited', 'accepted', 'revoked')),
      invited_by_clerk_user_id TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
};

const createMediaInvitationsTable = async () => {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS media_invitations (
      id UUID PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      media_id UUID NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'revoked')),
      invited_by_clerk_user_id TEXT NOT NULL,
      clerk_invitation_id TEXT NULL,
      accepted_clerk_user_id TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at TIMESTAMPTZ NULL
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS media_invitations_workspace_email_active_unique
      ON media_invitations (workspace_id, lower(btrim(email)))
      WHERE status = 'invited'
  `;
};

const createPartnerInvitationsTable = async () => {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS partner_invitations (
      partner_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      email TEXT NOT NULL,
      clerk_invitation_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'revoked')),
      invited_by_clerk_user_id TEXT NOT NULL,
      accepted_clerk_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS partner_invitations_workspace_email_pending_unique
      ON partner_invitations (workspace_id, lower(btrim(email)))
      WHERE status = 'invited'
  `;
};

const createCreativeAccessTable = async () => {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS creative_access (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id TEXT NOT NULL,
      creative_profile_id UUID NOT NULL,
      clerk_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'revoked')),
      invitation_email TEXT NOT NULL,
      invited_by_clerk_user_id TEXT,
      invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT creative_access_profile_workspace_fk
        FOREIGN KEY (workspace_id, creative_profile_id)
        REFERENCES creative_profiles (workspace_id, id)
        ON DELETE RESTRICT
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS creative_access_workspace_profile_clerk_unique_idx
      ON creative_access (workspace_id, creative_profile_id, clerk_user_id)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS creative_access_workspace_clerk_active_unique_idx
      ON creative_access (workspace_id, clerk_user_id)
      WHERE status = 'active'
  `;
};

const createCreativeInvitationsTable = async () => {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS creative_invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id TEXT NOT NULL,
      creative_profile_id UUID NOT NULL,
      email TEXT NOT NULL,
      clerk_invitation_id TEXT,
      status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'revoked')),
      invited_by_clerk_user_id TEXT NOT NULL,
      accepted_clerk_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at TIMESTAMPTZ,
      CONSTRAINT creative_invitations_profile_workspace_fk
        FOREIGN KEY (workspace_id, creative_profile_id)
        REFERENCES creative_profiles (workspace_id, id)
        ON DELETE RESTRICT
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS creative_invitations_workspace_profile_pending_unique_idx
      ON creative_invitations (workspace_id, creative_profile_id)
      WHERE status = 'invited'
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS creative_invitations_workspace_email_pending_unique_idx
      ON creative_invitations (workspace_id, lower(btrim(email)))
      WHERE status = 'invited'
  `;
};

const normalizeRole = (value: unknown): ClerkUserAccessRole => {
  if (typeof value === "string" && allowedRoles.includes(value as ClerkUserAccessRole)) {
    return value as ClerkUserAccessRole;
  }
  return "admin";
};

const normalizeStatus = (value: unknown): ClerkUserAccessStatus => {
  if (typeof value === "string" && allowedStatuses.includes(value as ClerkUserAccessStatus)) {
    return value as ClerkUserAccessStatus;
  }
  return "invited";
};

const normalizeInvitationStatus = (value: unknown): AthleteInvitationStatus => {
  if (typeof value === "string" && allowedInvitationStatuses.includes(value as AthleteInvitationStatus)) {
    return value as AthleteInvitationStatus;
  }
  return "invited";
};

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const mapInvitationRow = (row: Record<string, unknown>): AthleteInvitationRecord => ({
  athleteId: String(row.athlete_id ?? ""),
  email: String(row.email ?? ""),
  clerkInvitationId: String(row.clerk_invitation_id ?? ""),
  status: normalizeInvitationStatus(row.status),
  invitedByClerkUserId: typeof row.invited_by_clerk_user_id === "string" ? row.invited_by_clerk_user_id : null,
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

const mapRow = (row: Record<string, unknown>): ClerkUserAccessRecord => ({
  clerkUserId: String(row.clerk_user_id ?? ""),
  email: String(row.email ?? ""),
  role: normalizeRole(row.role),
  workspaceId: String(row.workspace_id ?? ""),
  athleteId: typeof row.athlete_id === "string" ? row.athlete_id : null,
  partnerId: typeof row.partner_id === "string" ? row.partner_id : null,
  mediaId: typeof row.media_id === "string" ? row.media_id : null,
  status: normalizeStatus(row.status),
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
});

const mapCreativeAccessRow = (row: Record<string, unknown>): CreativeAccessRecord => ({
  id: String(row.id ?? ""),
  workspaceId: String(row.workspace_id ?? ""),
  creativeProfileId: String(row.creative_profile_id ?? ""),
  clerkUserId: String(row.clerk_user_id ?? ""),
  status: typeof row.status === "string" && ["none", "invited", "active", "revoked"].includes(row.status)
    ? row.status as CreativeAccessState
    : "none",
  invitationEmail: String(row.invitation_email ?? row.email ?? ""),
  invitedByClerkUserId: typeof row.invited_by_clerk_user_id === "string" ? row.invited_by_clerk_user_id : null,
  invitedAt: String(row.invited_at ?? row.created_at ?? ""),
  activatedAt: typeof row.activated_at === "string" ? row.activated_at : null,
  revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
  createdAt: String(row.created_at ?? ""),
  updatedAt: String(row.updated_at ?? ""),
  creativeDisplayName: typeof row.creative_display_name === "string" ? row.creative_display_name : null,
  creativeProfileStatus: typeof row.creative_profile_status === "string" ? row.creative_profile_status : null,
});

export const buildUserAccessPermissionContext = (
  access: Partial<ClerkUserAccessRecord> | null | undefined,
  creativeAccess?: Partial<CreativeAccessRecord> | null,
): UserAccessPermissionContext => {
  const role = normalizeRole(access?.role);
  const status = normalizeStatus(access?.status);
  const workspaceId = access?.workspaceId?.trim() || getDefaultWorkspaceId();
  const athleteId = typeof access?.athleteId === "string" ? access.athleteId : null;
  const partnerId = typeof access?.partnerId === "string" ? access.partnerId : null;
  const mediaId = typeof access?.mediaId === "string" ? access.mediaId : null;
  const creativeProfileId = typeof creativeAccess?.creativeProfileId === "string" ? creativeAccess.creativeProfileId : null;
  const creativeAccessStatus: CreativeAccessState = (
    typeof creativeAccess?.status === "string" && ["none", "invited", "active", "revoked"].includes(creativeAccess.status)
      ? creativeAccess.status as CreativeAccessState
      : "none"
  );

  const isAdmin = role === "admin";
  const isAthlete = role === "athlete";
  const isPartnerExpert = role === "partner_expert";
  const isMedia = role === "media";
  const isCreative = creativeAccessStatus === "active" && Boolean(creativeProfileId);
  const isActive = status === "active";

  const canAccessPersonalSpace = isAdmin || (isActive && (isAthlete || isPartnerExpert || isMedia));
  const canAccessCommunityZones = isAdmin || (isActive && (isAthlete || isPartnerExpert || isMedia));
  const canAccessAthleteSpace = isAdmin || (isActive && isAthlete && Boolean(athleteId));
  const canAccessPartnerSpace = isAdmin || (isActive && isPartnerExpert && Boolean(partnerId));
  const canAccessCreativeSpace = isAdmin || isCreative;
  const hasFullAccess = isAdmin && isActive;

  return {
    role,
    athleteId,
    partnerId,
    mediaId,
    creativeProfileId,
    workspaceId,
    status,
    creativeAccessStatus,
    isAdmin,
    isAthlete,
    isPartnerExpert,
    isMedia,
    isCreative,
    isActive,
    hasFullAccess,
    canAccessPersonalSpace,
    canAccessCommunityZones,
    canAccessAthleteSpace,
    canAccessPartnerSpace,
    canAccessCreativeSpace,
  };
};

export const getCurrentUserPermissionContext = async (request?: Request): Promise<UserAccessPermissionContext> => {
  const profile = await getCurrentUserAccessProfile(request);
  return buildUserAccessPermissionContext(profile?.userAccess ?? null, profile?.creativeAccess ?? null);
};

const normalizeBusinessValue = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

export const resolveCurrentUserBusinessLink = async (request?: Request): Promise<CurrentUserBusinessResolution> => {
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess;

  if (!access) {
    return {
      businessType: "unlinked",
      businessRecord: null,
      reason: "no_link",
    };
  }

  if (access.role === "admin") {
    return {
      businessType: "admin",
      businessRecord: null,
      reason: "admin",
    };
  }

  if (access.role === "athlete") {
    const athleteId = normalizeBusinessValue(access.athleteId);
    if (!athleteId) {
      return {
        businessType: "unlinked",
        businessRecord: null,
        reason: "no_link",
      };
    }

    const athletes = await getAthletesFromGoogleSheets();
    const activeAthlete = athletes.find((athlete) => athlete.key === athleteId || athlete.row?.toString() === athleteId);
    if (!activeAthlete) {
      return {
        businessType: "invalid",
        businessRecord: null,
        reason: "missing_record",
      };
    }

    return {
      businessType: "athlete",
      businessRecord: activeAthlete as Record<string, unknown>,
      reason: "admin",
    };
  }

  if (access.role === "partner_expert") {
    const partnerId = normalizeBusinessValue(access.partnerId);
    if (!partnerId) {
      return {
        businessType: "unlinked",
        businessRecord: null,
        reason: "no_link",
      };
    }

    const partners = await getPartnersFromGoogleSheets();
    const rowPartnerIdMatch = /^row-(\d+)$/.exec(partnerId);
    const rowPartnerId = rowPartnerIdMatch ? Number(rowPartnerIdMatch[1]) : null;
    const activePartner = partners.find((partner) => {
      const normalizedPartnerName = normalizeBusinessValue(partner.name);
      return partner.id === partnerId
        || (normalizedPartnerName !== null && normalizedPartnerName.toLowerCase() === partnerId.toLowerCase())
        || partner.row?.toString() === partnerId
        || (rowPartnerId !== null && partner.row === rowPartnerId);
    });
    if (!activePartner) {
      return {
        businessType: "invalid",
        businessRecord: null,
        reason: "missing_record",
      };
    }

    return {
      businessType: "partner",
      businessRecord: activePartner as Record<string, unknown>,
      reason: "admin",
    };
  }

  if (access.role === "media") {
    const mediaId = normalizeBusinessValue(access.mediaId);
    if (!mediaId) {
      return {
        businessType: "unlinked",
        businessRecord: null,
        reason: "no_link",
      };
    }

    const mediaItems = await getMediaFromGoogleSheets();
    const activeMedia = mediaItems.find((mediaItem) => String(mediaItem.row ?? "") === mediaId);
    if (!activeMedia) {
      return {
        businessType: "invalid",
        businessRecord: null,
        reason: "missing_record",
      };
    }

    return {
      businessType: "media",
      businessRecord: activeMedia as Record<string, unknown>,
      reason: "admin",
    };
  }

  return {
    businessType: "invalid",
    businessRecord: null,
    reason: "invalid_role",
  };
};

export const evaluateBusinessAccess = async (
  request?: Request,
  options?: {
    action?: "read:athlete-record" | "read:partner-record" | "write:crm" | "read:pass" | "read:community" | "read:own-profile";
    targetAthleteId?: string | null;
    targetPartnerId?: string | null;
  },
): Promise<BusinessAccessEvaluation> => {
  const permissionContext = await getCurrentUserPermissionContext(request);
  const businessLink = await resolveCurrentUserBusinessLink(request);

  if (permissionContext.isAdmin && permissionContext.isActive) {
    return { allowed: true, reason: "allowed" };
  }

  if (!permissionContext.isActive) {
    return { allowed: false, reason: "role_forbidden" };
  }

  if (options?.action === "write:crm") {
    return { allowed: false, reason: "admin_required" };
  }

  if (options?.action === "read:pass" || options?.action === "read:community" || options?.action === "read:own-profile") {
    if (permissionContext.isAthlete || permissionContext.isPartnerExpert || permissionContext.isMedia) {
      return { allowed: true, reason: "allowed" };
    }
    return { allowed: false, reason: "role_forbidden" };
  }

  if (options?.action === "read:athlete-record") {
    if (permissionContext.isAthlete) {
      const targetAthleteId = options.targetAthleteId?.trim() ?? null;
      if (!targetAthleteId) {
        return { allowed: false, reason: "owner_mismatch" };
      }
      if (permissionContext.athleteId && targetAthleteId === permissionContext.athleteId) {
        return { allowed: true, reason: "allowed" };
      }
      return { allowed: false, reason: "owner_mismatch" };
    }

    if (permissionContext.isPartnerExpert || permissionContext.isMedia) {
      return { allowed: false, reason: "role_forbidden" };
    }

    return { allowed: false, reason: "role_forbidden" };
  }

  if (options?.action === "read:partner-record") {
    if (permissionContext.isPartnerExpert) {
      const targetPartnerId = options.targetPartnerId?.trim() ?? null;
      if (!targetPartnerId) {
        return { allowed: false, reason: "owner_mismatch" };
      }
      if (permissionContext.partnerId && targetPartnerId === permissionContext.partnerId) {
        return { allowed: true, reason: "allowed" };
      }
      return { allowed: false, reason: "owner_mismatch" };
    }

    if (permissionContext.isAthlete || permissionContext.isMedia) {
      return { allowed: false, reason: "role_forbidden" };
    }

    return { allowed: false, reason: "role_forbidden" };
  }

  if (businessLink.businessType === "unlinked") {
    return { allowed: false, reason: "no_link" };
  }

  if (businessLink.businessType === "invalid") {
    return { allowed: false, reason: "missing_record" };
  }

  return { allowed: false, reason: "role_forbidden" };
};

const getAuthenticatedClerkUser = async (request: Request) => {
  const client = await clerkClient();
  const authResult = await client.authenticateRequest(request, {
    authorizedParties: clerkAuthorizedParties,
  });

  if (!authResult.isAuthenticated) {
    return null;
  }

  const authData = authResult.toAuth();
  const userId = authData?.userId;
  if (!userId) {
    return null;
  }

  const clerkUser = await client.users.getUser(userId);
  return { userId, clerkUser };
};

type LinkableClerkUser = {
  publicMetadata?: Record<string, unknown> | null;
  emailAddresses?: Array<{ emailAddress: string; verification?: { status?: string | null } | null }>;
};

// Links a Clerk user to user_access strictly via athleteId + verified email match against a prior admin-issued invitation, never by athlete name.
const linkAthleteAccessFromInvitation = async (
  userId: string,
  clerkUser: LinkableClerkUser,
): Promise<ClerkUserAccessRecord | null> => {
  await createAthleteInvitationsTable();
  await createUserAccessTable();
  const sql = getSql();

  // Récupérer les e-mails vérifiés du compte Clerk.
  const verifiedEmails = (clerkUser.emailAddresses ?? [])
    .filter((entry) => entry.verification?.status === "verified")
    .map((entry) => entry.emailAddress.trim().toLowerCase())
    .filter(Boolean);

  if (!verifiedEmails.length) {
    return null;
  }

  // Si publicMetadata contient des valeurs, vérifier qu'elles correspondent.
  const metadata = clerkUser.publicMetadata ?? {};
  const metadataRole = typeof metadata.role === "string" ? metadata.role : null;
  const metadataAthleteId = typeof metadata.athleteId === "string" ? metadata.athleteId.trim() : "";

  if (metadataRole && metadataRole !== "athlete") {
    return null;
  }

  // Instruction unique donc transaction implicite : reservation, creation d acces et acceptation reussissent ou echouent ensemble.
  const rows = await sql`
    WITH claimed AS (
      SELECT athlete_id, btrim(email) AS email, workspace_id
      FROM athlete_invitations
      WHERE status = 'invited' AND lower(btrim(email)) = ANY(${verifiedEmails})
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    ),
    validated AS (
      SELECT athlete_id, email, workspace_id
      FROM claimed
      WHERE CASE WHEN ${metadataAthleteId} = ''
            THEN true
            ELSE athlete_id = ${metadataAthleteId}
      END
    ),
    checked_access AS (
      SELECT 1
      FROM validated
      WHERE NOT EXISTS (
        SELECT 1 FROM user_access WHERE clerk_user_id = ${userId}
      )
    ),
    upserted AS (
      INSERT INTO user_access (
        clerk_user_id,
        email,
        role,
        workspace_id,
        athlete_id,
        partner_id,
        media_id,
        status,
        created_at,
        updated_at
      )
      SELECT
        ${userId},
        validated.email,
        'athlete',
        validated.workspace_id,
        validated.athlete_id,
        NULL,
        NULL,
        'active',
        NOW(),
        NOW()
      FROM validated, checked_access
      ON CONFLICT (clerk_user_id) DO NOTHING
      RETURNING clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
    ),
    accepted AS (
      UPDATE athlete_invitations a
      SET status = 'accepted', updated_at = NOW()
      FROM claimed
      WHERE a.athlete_id = claimed.athlete_id
        AND a.status = 'invited'
        AND EXISTS (SELECT 1 FROM upserted)
      RETURNING a.athlete_id
    )
    SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
    FROM upserted
  `;

  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
};

const linkCreativeAccessFromInvitation = async (
  userId: string,
  clerkUser: LinkableClerkUser,
): Promise<CreativeAccessRecord | null> => {
  const verifiedEmails = (clerkUser.emailAddresses ?? [])
    .filter((entry) => entry.verification?.status === "verified")
    .map((entry) => entry.emailAddress.trim().toLowerCase())
    .filter(Boolean);

  if (!verifiedEmails.length) {
    return null;
  }

  const metadata = clerkUser.publicMetadata ?? {};
  const metadataRole = typeof metadata.role === "string" ? metadata.role : null;
  const metadataCreativeProfileId = typeof metadata.creativeProfileId === "string" ? metadata.creativeProfileId.trim() : "";
  const metadataWorkspaceId = typeof metadata.workspaceId === "string" ? metadata.workspaceId.trim() : "";
  if (metadataRole !== "creative" || !metadataCreativeProfileId || !metadataWorkspaceId) {
    return null;
  }

  await createCreativeAccessTable();
  await createCreativeInvitationsTable();
  const sql = getSql();

  const rows = await sql`
    WITH claimed AS (
      SELECT id, workspace_id, creative_profile_id, btrim(email) AS email, invited_by_clerk_user_id
      FROM creative_invitations
      WHERE status = 'invited'
        AND lower(btrim(email)) = ANY(${verifiedEmails})
        AND workspace_id = ${metadataWorkspaceId}
        AND creative_profile_id = ${metadataCreativeProfileId}::uuid
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    ),
    upserted AS (
      INSERT INTO creative_access (
        workspace_id,
        creative_profile_id,
        clerk_user_id,
        status,
        invitation_email,
        invited_by_clerk_user_id,
        invited_at,
        activated_at,
        created_at,
        updated_at
      )
      SELECT
        claimed.workspace_id,
        claimed.creative_profile_id,
        ${userId},
        'active',
        claimed.email,
        claimed.invited_by_clerk_user_id,
        NOW(),
        NOW(),
        NOW(),
        NOW()
      FROM claimed
      ON CONFLICT (workspace_id, creative_profile_id)
      DO UPDATE SET
        clerk_user_id = EXCLUDED.clerk_user_id,
        status = 'active',
        invitation_email = EXCLUDED.invitation_email,
        activated_at = COALESCE(creative_access.activated_at, NOW()),
        updated_at = NOW()
      RETURNING id, workspace_id, creative_profile_id, clerk_user_id, status, invitation_email, invited_by_clerk_user_id, invited_at, activated_at, revoked_at, created_at, updated_at
    ),
    accepted AS (
      UPDATE creative_invitations invitation
      SET status = 'accepted', accepted_clerk_user_id = ${userId}, accepted_at = NOW(), updated_at = NOW()
      FROM claimed
      WHERE invitation.id = claimed.id
        AND invitation.status = 'invited'
        AND EXISTS (SELECT 1 FROM upserted)
      RETURNING invitation.id
    )
    SELECT ca.id, ca.workspace_id, ca.creative_profile_id, ca.clerk_user_id, ca.status,
           ca.invitation_email, ca.invited_by_clerk_user_id, ca.invited_at,
           ca.activated_at, ca.revoked_at, ca.created_at, ca.updated_at,
           cp.display_name AS creative_display_name, cp.status AS creative_profile_status
    FROM creative_access ca
    LEFT JOIN creative_profiles cp
      ON cp.id = ca.creative_profile_id
     AND cp.workspace_id = ca.workspace_id
    WHERE ca.clerk_user_id = ${userId}
      AND ca.workspace_id = ${metadataWorkspaceId}
      AND ca.creative_profile_id = ${metadataCreativeProfileId}::uuid
    ORDER BY ca.updated_at DESC
    LIMIT 1
  `;

  return rows[0] ? mapCreativeAccessRow(rows[0] as Record<string, unknown>) : null;
};

// L'identité partenaire vient exclusivement de partner_invitations et d'un e-mail Clerk vérifié.
const linkPartnerAccessFromInvitation = async (
  userId: string,
  clerkUser: LinkableClerkUser,
): Promise<ClerkUserAccessRecord | null> => {
  const verifiedEmails = (clerkUser.emailAddresses ?? [])
    .filter((entry) => entry.verification?.status === "verified")
    .map((entry) => entry.emailAddress.trim().toLowerCase())
    .filter(Boolean);

  if (verifiedEmails.length === 0) return null;

  const metadata = clerkUser.publicMetadata ?? {};
  const metadataRole = typeof metadata.role === "string" ? metadata.role : null;
  const metadataPartnerId = typeof metadata.partnerId === "string" ? metadata.partnerId.trim() : "";
  const metadataWorkspaceId = typeof metadata.workspaceId === "string" ? metadata.workspaceId.trim() : "";
  if (metadataRole !== "partner_expert" || !metadataPartnerId || !metadataWorkspaceId) return null;

  await createUserAccessTable();
  await createPartnerInvitationsTable();
  const sql = getSql();
  const rows = await sql`
    WITH claimed AS (
      SELECT partner_id, workspace_id, btrim(email) AS email
      FROM partner_invitations
      WHERE status = 'invited'
        AND lower(btrim(email)) = ANY(${verifiedEmails})
        AND partner_id = ${metadataPartnerId}
        AND workspace_id = ${metadataWorkspaceId}
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    ),
    validated AS (
      SELECT partner_id, workspace_id, email
      FROM claimed
      WHERE partner_id = ${metadataPartnerId}
        AND workspace_id = ${metadataWorkspaceId}
    ),
    upserted AS (
      INSERT INTO user_access (
        clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
      )
      SELECT ${userId}, email, 'partner_expert', workspace_id, NULL, partner_id, NULL, 'active', NOW(), NOW()
      FROM validated
      ON CONFLICT (clerk_user_id) DO UPDATE SET
        email = EXCLUDED.email,
        status = 'active',
        updated_at = NOW()
      WHERE user_access.role = 'partner_expert'
        AND user_access.workspace_id = EXCLUDED.workspace_id
        AND user_access.partner_id = EXCLUDED.partner_id
      RETURNING clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
    ),
    accepted AS (
      UPDATE partner_invitations invitation
      SET status = 'accepted', accepted_clerk_user_id = ${userId}, accepted_at = NOW(), updated_at = NOW()
      FROM claimed
      WHERE invitation.partner_id = claimed.partner_id
        AND invitation.status = 'invited'
        AND EXISTS (SELECT 1 FROM upserted)
      RETURNING invitation.partner_id
    )
    SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
    FROM upserted
  `;

  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
};

// L acces est accorde par media_invitations, jamais sur la seule foi des publicMetadata Clerk.
const linkMediaAccessFromInvitation = async (
  userId: string,
  clerkUser: LinkableClerkUser,
): Promise<ClerkUserAccessRecord | null> => {
  const metadata = clerkUser.publicMetadata ?? {};
  const metadataRole = typeof metadata.role === "string" ? metadata.role : null;
  const metadataWorkspaceId = typeof metadata.workspaceId === "string" ? metadata.workspaceId.trim() : "";
  const metadataMediaId = typeof metadata.mediaId === "string" ? metadata.mediaId.trim().toLowerCase() : "";
  if (
    metadataRole !== "media"
    || !metadataWorkspaceId
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(metadataMediaId)
  ) {
    return null;
  }

  const verifiedEmails = (clerkUser.emailAddresses ?? [])
    .filter((entry) => entry.verification?.status === "verified")
    .map((entry) => entry.emailAddress.trim().toLowerCase())
    .filter(Boolean);

  if (verifiedEmails.length === 0) {
    return null;
  }

  await createMediaInvitationsTable();
  const sql = getSql();

  // Instruction unique donc transaction implicite : reservation, creation d acces et acceptation reussissent ou echouent ensemble.
  const rows = await sql`
    WITH claimed AS (
      SELECT id, workspace_id, media_id, btrim(email) AS email
      FROM media_invitations
      WHERE status = 'invited'
        AND lower(btrim(email)) = ANY(${verifiedEmails})
        AND workspace_id = ${metadataWorkspaceId}
        AND media_id = ${metadataMediaId}::uuid
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    ),
    upserted AS (
      INSERT INTO user_access (
        clerk_user_id,
        email,
        role,
        workspace_id,
        athlete_id,
        partner_id,
        media_id,
        status,
        created_at,
        updated_at
      )
      SELECT
        ${userId},
        claimed.email,
        'media',
        claimed.workspace_id,
        NULL,
        NULL,
        claimed.media_id::text,
        'active',
        NOW(),
        NOW()
      FROM claimed
      ON CONFLICT (clerk_user_id) DO NOTHING
      RETURNING clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
    ),
    accepted AS (
      UPDATE media_invitations m
      SET status = 'accepted', accepted_clerk_user_id = ${userId}, accepted_at = NOW()
      FROM claimed
      WHERE m.id = claimed.id
        AND m.status = 'invited'
        AND EXISTS (SELECT 1 FROM upserted)
      RETURNING m.id
    )
    SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
    FROM upserted
  `;

  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
};

const getServerAuthUserId = async (): Promise<string | null> => {
  if (typeof auth !== "function") {
    return null;
  }

  const authResult = await auth();
  return authResult?.userId ?? null;
};

const getLocalCreativeAccessProfile = async (
  userId: string,
): Promise<CreativeAccessRecord | null> => {
  await createCreativeAccessTable();
  const sql = getSql();
  const rows = await sql`
    SELECT ca.id, ca.workspace_id, ca.creative_profile_id, ca.clerk_user_id, ca.status,
           ca.invitation_email, ca.invited_by_clerk_user_id, ca.invited_at,
           ca.activated_at, ca.revoked_at, ca.created_at, ca.updated_at,
           cp.display_name AS creative_display_name, cp.status AS creative_profile_status
    FROM creative_access ca
    LEFT JOIN creative_profiles cp
      ON cp.id = ca.creative_profile_id
     AND cp.workspace_id = ca.workspace_id
    WHERE ca.clerk_user_id = ${userId}
    ORDER BY ca.updated_at DESC
    LIMIT 1
  `;

  return rows[0]
    ? mapCreativeAccessRow(rows[0] as Record<string, unknown>)
    : null;
};

export const getLocalUserAccessProfileByClerkUserId = async (
  clerkUserId: string,
): Promise<CurrentUserAccessProfile | null> => {
  if (!clerkUserId?.trim()) {
    return null;
  }

  await createUserAccessTable();
  const sql = getSql();
  const rows = await sql`SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at FROM user_access WHERE clerk_user_id = ${clerkUserId}`;

  const localUserAccess = rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
  const localCreativeAccess = await getLocalCreativeAccessProfile(clerkUserId);

  if (!localUserAccess && !localCreativeAccess) {
    return null;
  }

  return {
    clerkUser: {
      id: clerkUserId,
      email: localUserAccess?.email ?? null,
    },
    userAccess: localUserAccess,
    creativeAccess: localCreativeAccess,
  };
};

const hasLocalUserAccessRecord = async (userId: string): Promise<boolean> => {
  await createUserAccessTable();
  const sql = getSql();
  const rows = await sql`
    SELECT 1
    FROM user_access
    WHERE clerk_user_id = ${userId}
    LIMIT 1
  `;
  return Boolean(rows[0]);
};

export const getCurrentUserCreativeAccessProfile = async (request?: Request): Promise<CreativeAccessRecord | null> => {
  const currentRequest = request ?? new Request("http://localhost");
  const userId = await getServerAuthUserId();
  if (!userId) {
    return null;
  }

  const localCreativeAccess = await getLocalCreativeAccessProfile(userId);
  if (localCreativeAccess) return localCreativeAccess;
  if (await hasLocalUserAccessRecord(userId)) return null;

  const authResult = await getAuthenticatedClerkUser(currentRequest);
  if (!authResult || authResult.userId !== userId) {
    return null;
  }

  const linked = await linkCreativeAccessFromInvitation(userId, authResult.clerkUser);
  if (linked) {
    return linked;
  }

  return null;
};

export const getCurrentCreativeAccessProfile = getCurrentUserCreativeAccessProfile;

export const getCurrentUserAccessProfile = async (request?: Request): Promise<CurrentUserAccessProfile | null> => {
  const currentRequest = request ?? new Request("http://localhost");
  const userId = await getServerAuthUserId();
  if (!userId) {
    return null;
  }

  await createUserAccessTable();
  const sql = getSql();
  const rows = await sql`SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at FROM user_access WHERE clerk_user_id = ${userId}`;

  const localUserAccess = rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
  const localCreativeAccess = await getLocalCreativeAccessProfile(userId);
  if (localUserAccess || localCreativeAccess) {
    return {
      clerkUser: {
        id: userId,
        email: localUserAccess?.email ?? null,
      },
      userAccess: localUserAccess,
      creativeAccess: localCreativeAccess,
    };
  }

  const authResult = await getAuthenticatedClerkUser(currentRequest);
  if (!authResult || authResult.userId !== userId) {
    return null;
  }

  const { clerkUser } = authResult;
  let userAccess = await linkAthleteAccessFromInvitation(userId, clerkUser);

  if (!userAccess) {
    userAccess = await linkPartnerAccessFromInvitation(userId, clerkUser);
  }

  if (!userAccess) {
    userAccess = await linkMediaAccessFromInvitation(userId, clerkUser);
  }

  const creativeAccess = await linkCreativeAccessFromInvitation(userId, clerkUser);

  return {
    clerkUser: {
      id: clerkUser.id,
      email: clerkUser.emailAddresses?.[0]?.emailAddress ?? null,
    },
    userAccess,
    creativeAccess,
  };
};

export const bootstrapCurrentUserAsAdmin = async (request?: Request): Promise<ClerkUserAccessRecord | null> => {
  const currentRequest = request ?? new Request("http://localhost");
  const authResult = await getAuthenticatedClerkUser(currentRequest);
  if (!authResult) {
    return null;
  }

  const { userId, clerkUser } = authResult;
  const configuredEmail = getBootstrapAdminEmail();
  const email = clerkUser.emailAddresses?.[0]?.emailAddress ?? `${clerkUser.id}@clerk.local`;
  if (!configuredEmail || email.toLowerCase() !== configuredEmail) {
    throw new Error("Forbidden");
  }

  const workspaceId = getDefaultWorkspaceId();

  await createUserAccessTable();

  const sql = getSql();
  const existingRows = await sql`SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at FROM user_access WHERE clerk_user_id = ${userId}`;
  if (existingRows[0]) {
    return mapRow(existingRows[0] as Record<string, unknown>);
  }

  const existingAdmins = await sql`SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at FROM user_access WHERE role = 'admin'`;
  if (existingAdmins[0]) {
    throw new Error("Forbidden");
  }

  const rows = await sql`
    INSERT INTO user_access (
      clerk_user_id,
      email,
      role,
      workspace_id,
      athlete_id,
      partner_id,
      media_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${userId},
      ${email},
      'admin',
      ${workspaceId},
      NULL,
      NULL,
      NULL,
      'active',
      NOW(),
      NOW()
    )
    RETURNING clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
  `;

  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
};

// Clerk exige une URL absolue : on privilegie l origine publique configuree, avec repli local en developpement.
const getAppOrigin = (): string => {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
};

export type InviteMediaResult =
  | { ok: true; invitationId: string; email: string; mediaId: string }
  | {
      ok: false;
      reason: "forbidden" | "invalid_email" | "invalid_media" | "media_not_found" | "already_invited" | "already_active" | "clerk_error";
      message?: string;
    };

// L invitation Clerk est la seule voie d entree : aucun signup public n est ouvert.
export const inviteMediaToKlique = async (
  request: Request,
  rawEmail: string,
  rawMediaId?: unknown,
): Promise<InviteMediaResult> => {
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess ?? null;
  const inviterId = profile?.clerkUser?.id?.trim() ?? "";
  const workspaceId = access?.workspaceId?.trim() ?? "";

  if (!inviterId || access?.role !== "admin" || access.status !== "active" || !workspaceId) {
    return { ok: false, reason: "forbidden" };
  }

  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return { ok: false, reason: "invalid_email" };
  }

  const mediaId = typeof rawMediaId === "string" ? rawMediaId.trim().toLowerCase() : "";
  if (!mediaId) {
    return { ok: false, reason: "invalid_media" };
  }

  try {
    await getActiveMediaOrganization(workspaceId, mediaId);
  } catch (error) {
    if (error instanceof MediaOrganizationError) {
      return {
        ok: false,
        reason: error.code === "not_found" ? "media_not_found" : "invalid_media",
      };
    }
    throw error;
  }

  await createUserAccessTable();
  await createMediaInvitationsTable();
  const sql = getSql();

  const activeRows = await sql`
    SELECT clerk_user_id FROM user_access
    WHERE lower(btrim(email)) = ${email} AND role = 'media' AND status = 'active'
  `;
  if (activeRows[0]) {
    return { ok: false, reason: "already_active" };
  }

  const pendingRows = await sql`
    SELECT id FROM media_invitations
    WHERE workspace_id = ${workspaceId} AND lower(btrim(email)) = ${email} AND status = 'invited'
  `;
  if (pendingRows[0]) {
    return { ok: false, reason: "already_invited" };
  }

  let clerkInvitationId: string;
  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: {
        role: "media",
        workspaceId,
        mediaId,
      },
      redirectUrl: `${getAppOrigin()}/sign-up?portal=media`,
      notify: true,
    });
    clerkInvitationId = invitation.id;
  } catch (error) {
    const clerkError = error as { status?: unknown; message?: unknown };
    console.error("[media_invite][clerk_error]", {
      status: clerkError?.status ?? null,
      message: clerkError?.message ?? null,
    });
    return { ok: false, reason: "clerk_error", message: "Echec de l invitation Clerk." };
  }

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO media_invitations (
      id,
      workspace_id,
      media_id,
      email,
      status,
      invited_by_clerk_user_id,
      clerk_invitation_id,
      created_at
    )
    VALUES (
      ${id},
      ${workspaceId},
      ${mediaId}::uuid,
      ${email},
      'invited',
      ${inviterId},
      ${clerkInvitationId},
      NOW()
    )
    RETURNING id, email, media_id
  `;

  const created = rows[0] as Record<string, unknown> | undefined;
  if (!created) {
    return { ok: false, reason: "already_invited" };
  }

  return {
    ok: true,
    invitationId: String(created.id ?? ""),
    email: String(created.email ?? ""),
    mediaId: String(created.media_id ?? ""),
  };
};

export const getAthleteAccessState = async (athleteId: string): Promise<{ state: AthleteAccessState; email: string | null }> => {  const trimmedAthleteId = athleteId.trim();
  if (!trimmedAthleteId) {
    return { state: "none", email: null };
  }

  await createUserAccessTable();
  await createAthleteInvitationsTable();
  const sql = getSql();

  const activeRows = await sql`
    SELECT email FROM user_access WHERE athlete_id = ${trimmedAthleteId} AND role = 'athlete' AND status = 'active'
  `;
  if (activeRows[0]) {
    return { state: "active", email: String((activeRows[0] as Record<string, unknown>).email ?? "") || null };
  }

  const invitationRows = await sql`
    SELECT email FROM athlete_invitations WHERE athlete_id = ${trimmedAthleteId} AND status = 'invited'
  `;
  if (invitationRows[0]) {
    return { state: "invited", email: String((invitationRows[0] as Record<string, unknown>).email ?? "") || null };
  }

  return { state: "none", email: null };
};

export const getPartnerAccessState = async ({ partnerId, legacyPartnerIds = [] }: PartnerInvitationIdentity): Promise<{ state: PartnerAccessState; email: string | null }> => {
  const trimmedPartnerId = partnerId.trim();
  if (!trimmedPartnerId) return { state: "none", email: null };
  const [legacyPartnerId1 = "", legacyPartnerId2 = "", legacyPartnerId3 = ""] = legacyPartnerIds
    .map((value) => value.trim())
    .filter(Boolean);

  await createUserAccessTable();
  await createPartnerInvitationsTable();
  const sql = getSql();
  const activeRows = await sql`
    SELECT email FROM user_access
    WHERE partner_id IN (${trimmedPartnerId}, ${legacyPartnerId1}, ${legacyPartnerId2}, ${legacyPartnerId3})
      AND role = 'partner_expert' AND status = 'active'
  `;
  if (activeRows[0]) {
    return { state: "active", email: String((activeRows[0] as Record<string, unknown>).email ?? "") || null };
  }

  const invitationRows = await sql`
    SELECT email FROM partner_invitations
    WHERE partner_id IN (${trimmedPartnerId}, ${legacyPartnerId1}, ${legacyPartnerId2}, ${legacyPartnerId3})
      AND status = 'invited'
      AND NULLIF(btrim(clerk_invitation_id), '') IS NOT NULL
  `;
  if (invitationRows[0]) {
    return { state: "invited", email: String((invitationRows[0] as Record<string, unknown>).email ?? "") || null };
  }

  return { state: "none", email: null };
};

export const invitePartnerToKlique = async (
  request: Request,
  partner: PartnerInvitationIdentity,
  options?: { resend?: boolean },
): Promise<InvitePartnerResult> => {
  const trimmedPartnerId = partner.partnerId.trim();
  if (!trimmedPartnerId) return { ok: false, reason: "partner_not_found" };

  const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
  if (!accessCheck.allowed) return { ok: false, reason: "forbidden" };

  const authResult = await getAuthenticatedClerkUser(request);
  if (!authResult) return { ok: false, reason: "forbidden" };

  const exactPartnerId = trimmedPartnerId;
  const [legacyPartnerId1 = "", legacyPartnerId2 = "", legacyPartnerId3 = ""] = (partner.legacyPartnerIds ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const email = partner.email.trim();
  if (!email) return { ok: false, reason: "missing_email" };
  if (!isValidEmail(email)) return { ok: false, reason: "invalid_email" };
  const normalizedEmail = email.toLowerCase();

  await createUserAccessTable();
  await createPartnerInvitationsTable();
  const sql = getSql();
  const inviterRows = await sql`SELECT workspace_id FROM user_access WHERE clerk_user_id = ${authResult.userId}`;
  const workspaceId = (inviterRows[0] as { workspace_id?: string } | undefined)?.workspace_id?.trim() || getDefaultWorkspaceId();

  const activeRows = await sql`
    SELECT clerk_user_id FROM user_access
    WHERE (
      partner_id IN (${exactPartnerId}, ${legacyPartnerId1}, ${legacyPartnerId2}, ${legacyPartnerId3})
      OR lower(btrim(email)) = ${normalizedEmail}
    ) AND status = 'active'
  `;
  if (activeRows[0]) return { ok: false, reason: "already_active" };

  const pendingRows = await sql`
    SELECT partner_id, email, clerk_invitation_id FROM partner_invitations
    WHERE status = 'invited'
      AND NULLIF(btrim(clerk_invitation_id), '') IS NOT NULL
      AND (
        partner_id IN (${exactPartnerId}, ${legacyPartnerId1}, ${legacyPartnerId2}, ${legacyPartnerId3})
        OR (workspace_id = ${workspaceId} AND lower(btrim(email)) = ${normalizedEmail})
      )
  `;
  const pending = pendingRows[0] as { partner_id?: string; email?: string; clerk_invitation_id?: string } | undefined;
  const isResend = options?.resend === true;
  const acceptedPartnerIds = new Set([exactPartnerId, legacyPartnerId1, legacyPartnerId2, legacyPartnerId3].filter(Boolean));
  const pendingPartnerId = pending?.partner_id?.trim() ?? "";
  if (pending && (!isResend || !acceptedPartnerIds.has(pendingPartnerId) || pending.email?.trim().toLowerCase() !== normalizedEmail)) {
    return { ok: false, reason: "already_invited" };
  }

  const incompleteRows = await sql`
    SELECT partner_id FROM partner_invitations
    WHERE status = 'invited'
      AND NULLIF(btrim(clerk_invitation_id), '') IS NULL
      AND (
        partner_id IN (${exactPartnerId}, ${legacyPartnerId1}, ${legacyPartnerId2}, ${legacyPartnerId3})
        OR (workspace_id = ${workspaceId} AND lower(btrim(email)) = ${normalizedEmail})
      )
    LIMIT 1
  `;
  const incompletePartnerId = String((incompleteRows[0] as { partner_id?: unknown } | undefined)?.partner_id ?? "").trim();
  const hasIncompleteInvitation = Boolean(incompletePartnerId);
  const storedPartnerId = pendingPartnerId || (acceptedPartnerIds.has(incompletePartnerId) ? incompletePartnerId : exactPartnerId);

  let clerkInvitationId = "";
  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { role: "partner_expert", workspaceId, partnerId: storedPartnerId },
      redirectUrl: `${getAppOrigin()}/sign-up?portal=partner`,
      notify: true,
      ignoreExisting: isResend || hasIncompleteInvitation,
    });
    clerkInvitationId = invitation.id?.trim() ?? "";
    if (!clerkInvitationId) {
      return { ok: false, reason: "clerk_error", message: "Clerk n'a retourné aucun identifiant d'invitation." };
    }
  } catch (error) {
    const clerkError = error as { message?: unknown };
    return { ok: false, reason: "clerk_error", message: String(clerkError.message ?? "Échec de l'invitation Clerk.") };
  }

  const savedRows = await sql`
    INSERT INTO partner_invitations (
      partner_id, workspace_id, email, clerk_invitation_id, status, invited_by_clerk_user_id, created_at, updated_at
    ) VALUES (
      ${storedPartnerId}, ${workspaceId}, ${email}, ${clerkInvitationId}, 'invited', ${authResult.userId}, NOW(), NOW()
    )
    ON CONFLICT (partner_id) DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      email = EXCLUDED.email,
      clerk_invitation_id = EXCLUDED.clerk_invitation_id,
      status = 'invited',
      invited_by_clerk_user_id = EXCLUDED.invited_by_clerk_user_id,
      accepted_clerk_user_id = NULL,
      accepted_at = NULL,
      updated_at = NOW()
    RETURNING clerk_invitation_id
  `;

  const savedClerkInvitationId = String(
    (savedRows[0] as { clerk_invitation_id?: unknown } | undefined)?.clerk_invitation_id ?? "",
  ).trim();
  if (!savedClerkInvitationId || savedClerkInvitationId !== clerkInvitationId) {
    return { ok: false, reason: "clerk_error", message: "L'identifiant de l'invitation Clerk n'a pas été confirmé dans Neon." };
  }

  return { ok: true, partnerId: exactPartnerId, email, clerkInvitationId: savedClerkInvitationId };
};

export const getCreativeAccessState = async (
  workspaceId: string,
  creativeProfileId: string,
): Promise<{ state: CreativeAccessState; email: string | null }> => {
  const normalizedWorkspace = workspaceId.trim();
  const normalizedProfileId = creativeProfileId.trim();
  if (!normalizedWorkspace || !normalizedProfileId) {
    return { state: "none", email: null };
  }

  await createCreativeAccessTable();
  await createCreativeInvitationsTable();
  const sql = getSql();

  const activeRows = await sql`
    SELECT invitation_email AS email
    FROM creative_access
    WHERE workspace_id = ${normalizedWorkspace}
      AND creative_profile_id = ${normalizedProfileId}::uuid
      AND status = 'active'
    LIMIT 1
  `;
  if (activeRows[0]) {
    return { state: "active", email: String((activeRows[0] as Record<string, unknown>).email ?? "") || null };
  }

  const pendingRows = await sql`
    SELECT email
    FROM creative_invitations
    WHERE workspace_id = ${normalizedWorkspace}
      AND creative_profile_id = ${normalizedProfileId}::uuid
      AND status = 'invited'
    LIMIT 1
  `;
  if (pendingRows[0]) {
    return { state: "invited", email: String((pendingRows[0] as Record<string, unknown>).email ?? "") || null };
  }

  const revokedRows = await sql`
    SELECT invitation_email AS email
    FROM creative_access
    WHERE workspace_id = ${normalizedWorkspace}
      AND creative_profile_id = ${normalizedProfileId}::uuid
      AND status = 'revoked'
    LIMIT 1
  `;
  if (revokedRows[0]) {
    return { state: "revoked", email: String((revokedRows[0] as Record<string, unknown>).email ?? "") || null };
  }

  return { state: "none", email: null };
};

export const inviteCreativeProfileToKlique = async (
  request: Request,
  creativeProfileId: string,
  options?: { resend?: boolean },
): Promise<InviteCreativeResult> => {
  const normalizedCreativeProfileId = creativeProfileId.trim();
  if (!normalizedCreativeProfileId) {
    return { ok: false, reason: "creative_not_found" };
  }

  const permissionContext = await getCurrentUserAccessProfile(request);
  const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
  if (!accessCheck.allowed || !permissionContext?.userAccess || permissionContext.userAccess.role !== "admin") {
    return { ok: false, reason: "forbidden" };
  }

  const authResult = await getAuthenticatedClerkUser(request);
  if (!authResult) {
    return { ok: false, reason: "forbidden" };
  }

  const workspaceId = permissionContext.userAccess.workspaceId.trim() || getDefaultWorkspaceId();

  await createCreativeAccessTable();
  await createCreativeInvitationsTable();
  const sql = getSql();

  const profileRows = await sql`
    SELECT id, workspace_id, contact_email, status
    FROM creative_profiles
    WHERE workspace_id = ${workspaceId}
      AND id = ${normalizedCreativeProfileId}::uuid
    LIMIT 1
  `;

  const profile = profileRows[0] as { id?: string; workspace_id?: string; contact_email?: string; status?: string } | undefined;
  if (!profile?.id) {
    return { ok: false, reason: "creative_not_found" };
  }
  if (profile.status !== "active") {
    return { ok: false, reason: "inactive_profile" };
  }

  const email = String(profile.contact_email ?? "").trim();
  if (!email) {
    return { ok: false, reason: "missing_email" };
  }
  if (!isValidEmail(email)) {
    return { ok: false, reason: "invalid_email" };
  }

  const activeRows = await sql`
    SELECT clerk_user_id
    FROM creative_access
    WHERE workspace_id = ${workspaceId}
      AND creative_profile_id = ${normalizedCreativeProfileId}::uuid
      AND status = 'active'
    LIMIT 1
  `;
  if (activeRows[0]) {
    return { ok: false, reason: "already_active" };
  }

  const pendingRows = await sql`
    SELECT id, email
    FROM creative_invitations
    WHERE workspace_id = ${workspaceId}
      AND creative_profile_id = ${normalizedCreativeProfileId}::uuid
      AND status = 'invited'
    LIMIT 1
  `;
  const isResend = options?.resend === true;
  if (pendingRows[0] && !isResend) {
    return { ok: false, reason: "already_invited" };
  }

  try {
    const client = await clerkClient();
    const existingUsers = await client.users.getUserList({
      emailAddress: [email],
      limit: 10,
    });
    const exactVerifiedUser = existingUsers.data.find((user) =>
      user.emailAddresses.some((address) =>
        address.emailAddress.trim().toLowerCase() === email
        && address.verification?.status === "verified"
      )
    );
    if (exactVerifiedUser) {
      await sql`
        WITH linked AS (
          INSERT INTO creative_access (
            workspace_id, creative_profile_id, clerk_user_id, status,
            invitation_email, invited_by_clerk_user_id, invited_at,
            activated_at, revoked_at, created_at, updated_at
          )
          VALUES (
            ${workspaceId}, ${normalizedCreativeProfileId}::uuid, ${exactVerifiedUser.id},
            'active', ${email}, ${authResult.userId}, NOW(), NOW(), NULL, NOW(), NOW()
          )
          ON CONFLICT (workspace_id, creative_profile_id)
          DO UPDATE SET
            clerk_user_id = EXCLUDED.clerk_user_id,
            status = 'active',
            invitation_email = EXCLUDED.invitation_email,
            invited_by_clerk_user_id = EXCLUDED.invited_by_clerk_user_id,
            activated_at = NOW(),
            revoked_at = NULL,
            updated_at = NOW()
          RETURNING creative_profile_id
        )
        INSERT INTO creative_invitations (
          workspace_id, creative_profile_id, email, clerk_invitation_id,
          status, invited_by_clerk_user_id, accepted_clerk_user_id,
          created_at, updated_at, accepted_at
        )
        SELECT ${workspaceId}, ${normalizedCreativeProfileId}::uuid, ${email}, NULL,
               'accepted', ${authResult.userId}, ${exactVerifiedUser.id}, NOW(), NOW(), NOW()
        FROM linked
      `;
      return {
        ok: true,
        creativeProfileId: normalizedCreativeProfileId,
        email,
        clerkInvitationId: `existing:${exactVerifiedUser.id}`,
        workspaceId,
      };
    }

    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: {
        role: "creative",
        workspaceId,
        creativeProfileId: normalizedCreativeProfileId,
      },
      redirectUrl: `${getAppOrigin()}/sign-up?portal=creative`,
      notify: true,
      ignoreExisting: isResend,
      expiresInDays: 30,
    });

    const invitationId = String(invitation.id ?? "").trim();
    if (!invitationId) {
      return { ok: false, reason: "clerk_error", message: "Clerk n'a retourné aucun identifiant d'invitation." };
    }

    const rows = await sql`
      INSERT INTO creative_invitations (
        workspace_id,
        creative_profile_id,
        email,
        clerk_invitation_id,
        status,
        invited_by_clerk_user_id,
        created_at,
        updated_at,
        expires_at
      )
      VALUES (
        ${workspaceId},
        ${normalizedCreativeProfileId}::uuid,
        ${email},
        ${invitationId},
        'invited',
        ${authResult.userId},
        NOW(),
        NOW(),
        NOW() + INTERVAL '30 days'
      )
      ON CONFLICT (workspace_id, creative_profile_id) WHERE status = 'invited'
      DO UPDATE SET
        email = EXCLUDED.email,
        clerk_invitation_id = EXCLUDED.clerk_invitation_id,
        invited_by_clerk_user_id = EXCLUDED.invited_by_clerk_user_id,
        updated_at = NOW(),
        expires_at = EXCLUDED.expires_at
      RETURNING workspace_id, creative_profile_id, email, clerk_invitation_id, status
    `;

    const saved = rows[0] as { email?: string; clerk_invitation_id?: string; creative_profile_id?: string } | undefined;
    if (!saved?.clerk_invitation_id || saved.clerk_invitation_id !== invitationId) {
      return { ok: false, reason: "clerk_error", message: "L'invitation créative n'a pas été confirmée dans Neon." };
    }

    return {
      ok: true,
      creativeProfileId: normalizedCreativeProfileId,
      email: String(saved.email ?? email),
      clerkInvitationId: String(saved.clerk_invitation_id),
      workspaceId,
    };
  } catch (error) {
    const clerkError = error as { message?: unknown };
    return {
      ok: false,
      reason: "clerk_error",
      message: String(clerkError.message ?? "Échec de l'invitation Clerk."),
    };
  }
};

export const revokeCreativeProfileAccess = async (
  request: Request,
  creativeProfileId: string,
): Promise<RevokeCreativeAccessResult> => {
  const profile = await getCurrentUserAccessProfile(request);
  const access = profile?.userAccess;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (
    !profile?.clerkUser.id
    || access?.role !== "admin"
    || access.status !== "active"
    || !workspaceId
  ) {
    return { ok: false, reason: "forbidden" };
  }
  const normalizedCreativeProfileId = creativeProfileId.trim();
  if (!normalizedCreativeProfileId) {
    return { ok: false, reason: "creative_not_found" };
  }

  const sql = getSql();
  const rows = await sql`
    SELECT invitation.clerk_invitation_id, access.id AS access_id
    FROM creative_profiles profile
    LEFT JOIN creative_invitations invitation
      ON invitation.workspace_id = profile.workspace_id
     AND invitation.creative_profile_id = profile.id
     AND invitation.status = 'invited'
    LEFT JOIN creative_access access
      ON access.workspace_id = profile.workspace_id
     AND access.creative_profile_id = profile.id
     AND access.status = 'active'
    WHERE profile.workspace_id = ${workspaceId}
      AND profile.id = ${normalizedCreativeProfileId}::uuid
    LIMIT 1
  `;
  const target = rows[0] as {
    clerk_invitation_id?: string | null;
    access_id?: string | null;
  } | undefined;
  if (!target) return { ok: false, reason: "creative_not_found" };
  if (!target.clerk_invitation_id && !target.access_id) {
    return { ok: false, reason: "not_invited" };
  }

  if (target.clerk_invitation_id) {
    try {
      const client = await clerkClient();
      await client.invitations.revokeInvitation(target.clerk_invitation_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Échec de la révocation Clerk.";
      console.error("[creative_access][revoke_clerk_error]", { message });
      return { ok: false, reason: "clerk_error", message };
    }
  }

  await sql.transaction([
    sql`
      UPDATE creative_invitations
      SET status = 'revoked', updated_at = NOW()
      WHERE workspace_id = ${workspaceId}
        AND creative_profile_id = ${normalizedCreativeProfileId}::uuid
        AND status = 'invited'
    `,
    sql`
      UPDATE creative_access
      SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
      WHERE workspace_id = ${workspaceId}
        AND creative_profile_id = ${normalizedCreativeProfileId}::uuid
        AND status = 'active'
    `,
  ], { isolationLevel: "Serializable" });
  return { ok: true, creativeProfileId: normalizedCreativeProfileId };
};

export const inviteAthleteToKlique = async (
  request: Request,
  athleteId: string,
  options?: { resend?: boolean },
): Promise<InviteAthleteResult> => {
  const isResend = options?.resend === true;
  const trimmedAthleteId = athleteId.trim();
  if (!trimmedAthleteId) {
    return { ok: false, reason: "athlete_not_found" };
  }

  const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
  if (!accessCheck.allowed) {
    return { ok: false, reason: "forbidden" };
  }

  const authResult = await getAuthenticatedClerkUser(request);
  if (!authResult) {
    return { ok: false, reason: "forbidden" };
  }

  const athletes = await getAthletesFromGoogleSheets();
  const athlete = athletes.find((item) => item.key === trimmedAthleteId);
  if (!athlete) {
    return { ok: false, reason: "athlete_not_found" };
  }

  const email = normalizeBusinessValue(athlete.email);
  if (!email) {
    return { ok: false, reason: "missing_email" };
  }
  if (!isValidEmail(email)) {
    return { ok: false, reason: "invalid_email" };
  }

  await createUserAccessTable();
  await createAthleteInvitationsTable();
  const sql = getSql();

  // Workspace de l invitation : celui de l admin qui invite, le workspace par defaut n est qu un repli.
  const inviterAccessRows = await sql`SELECT workspace_id FROM user_access WHERE clerk_user_id = ${authResult.userId}`;
  const workspaceId =
    (inviterAccessRows[0] as { workspace_id?: string } | undefined)?.workspace_id?.trim() || getDefaultWorkspaceId();

  const activeRows = await sql`
    SELECT clerk_user_id FROM user_access WHERE athlete_id = ${trimmedAthleteId} AND role = 'athlete' AND status = 'active'
  `;
  if (activeRows[0]) {
    return { ok: false, reason: "already_active" };
  }

  const pendingRows = await sql`
    SELECT athlete_id FROM athlete_invitations WHERE athlete_id = ${trimmedAthleteId} AND status = 'invited'
  `;
  if (pendingRows[0] && !isResend) {
    return { ok: false, reason: "already_invited" };
  }

  let invitationId: string;
  try {
    const client = await clerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      publicMetadata: {
        athleteId: trimmedAthleteId,
        role: "athlete",
      },
      redirectUrl: `${getAppOrigin()}/sign-up`,
      notify: true,
      ignoreExisting: isResend,
    });
    invitationId = invitation.id;
  } catch (error) {
    const clerkError = error as {
      status?: unknown;
      message?: unknown;
      errors?: unknown;
      clerkError?: unknown;
    };
    const errorList = Array.isArray(clerkError?.errors) ? clerkError.errors : [];
    const firstError = (errorList[0] ?? null) as
      | { code?: unknown; message?: unknown; longMessage?: unknown }
      | null;

    const diagnostic = {
      status: clerkError?.status,
      message: clerkError?.message,
      errors: clerkError?.errors,
      firstErrorCode: firstError?.code,
      firstErrorMessage: firstError?.message,
      firstErrorLongMessage: firstError?.longMessage,
    };

    console.error("[CLERK_INVITATION_FULL_ERROR]", diagnostic);

    const statusText = String(clerkError?.status ?? "unknown");
    const codeText = firstError?.code ? String(firstError.code) : "unknown_code";
    const messageText = firstError?.message
      ? String(firstError.message)
      : clerkError?.message
        ? String(clerkError.message)
        : "Échec de l'invitation Clerk.";
    const longMessageText = firstError?.longMessage ? ` — ${String(firstError.longMessage)}` : "";
    const diagnosticMessage = `Clerk ${statusText} — ${codeText} — ${messageText}${longMessageText}`;

    return {
      ok: false,
      reason: "clerk_error",
      message: diagnosticMessage,
    };
  }

  const rows = await sql`
    INSERT INTO athlete_invitations (
      athlete_id,
      email,
      workspace_id,
      clerk_invitation_id,
      status,
      invited_by_clerk_user_id,
      created_at,
      updated_at
    )
    VALUES (
      ${trimmedAthleteId},
      ${email},
      ${workspaceId},
      ${invitationId},
      'invited',
      ${authResult.userId},
      NOW(),
      NOW()
    )
    ON CONFLICT (athlete_id) DO UPDATE SET
      email = EXCLUDED.email,
      workspace_id = EXCLUDED.workspace_id,
      clerk_invitation_id = EXCLUDED.clerk_invitation_id,
      status = 'invited',
      invited_by_clerk_user_id = EXCLUDED.invited_by_clerk_user_id,
      updated_at = NOW()
    RETURNING athlete_id, email, clerk_invitation_id, status, invited_by_clerk_user_id, created_at, updated_at
  `;

  return { ok: true, invitation: mapInvitationRow(rows[0] as Record<string, unknown>) };
};
