import { clerkClient } from "@clerk/nextjs/server";
import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";
import { getAthletesFromGoogleSheets, getMediaFromGoogleSheets, getPartnersFromGoogleSheets } from "@/lib/google-sheets";

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
};

export type UserAccessPermissionContext = {
  role: ClerkUserAccessRole;
  athleteId: string | null;
  partnerId: string | null;
  mediaId: string | null;
  workspaceId: string;
  status: ClerkUserAccessStatus;
  isAdmin: boolean;
  isAthlete: boolean;
  isPartnerExpert: boolean;
  isMedia: boolean;
  isActive: boolean;
  hasFullAccess: boolean;
  canAccessPersonalSpace: boolean;
  canAccessCommunityZones: boolean;
  canAccessAthleteSpace: boolean;
  canAccessPartnerSpace: boolean;
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

export type InviteAthleteResult =
  | { ok: true; invitation: AthleteInvitationRecord }
  | {
      ok: false;
      reason: "forbidden" | "missing_email" | "invalid_email" | "already_active" | "already_invited" | "athlete_not_found" | "clerk_error";
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
      clerk_invitation_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('invited', 'accepted', 'revoked')),
      invited_by_clerk_user_id TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
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

export const buildUserAccessPermissionContext = (
  access: Partial<ClerkUserAccessRecord> | null | undefined,
): UserAccessPermissionContext => {
  const role = normalizeRole(access?.role);
  const status = normalizeStatus(access?.status);
  const workspaceId = access?.workspaceId?.trim() || getDefaultWorkspaceId();
  const athleteId = typeof access?.athleteId === "string" ? access.athleteId : null;
  const partnerId = typeof access?.partnerId === "string" ? access.partnerId : null;
  const mediaId = typeof access?.mediaId === "string" ? access.mediaId : null;

  const isAdmin = role === "admin";
  const isAthlete = role === "athlete";
  const isPartnerExpert = role === "partner_expert";
  const isMedia = role === "media";
  const isActive = status === "active";

  const canAccessPersonalSpace = isAdmin || (isActive && (isAthlete || isPartnerExpert || isMedia));
  const canAccessCommunityZones = isAdmin || (isActive && (isAthlete || isPartnerExpert || isMedia));
  const canAccessAthleteSpace = isAdmin || (isActive && isAthlete && Boolean(athleteId));
  const canAccessPartnerSpace = isAdmin || (isActive && isPartnerExpert && Boolean(partnerId));
  const hasFullAccess = isAdmin && isActive;

  return {
    role,
    athleteId,
    partnerId,
    mediaId,
    workspaceId,
    status,
    isAdmin,
    isAthlete,
    isPartnerExpert,
    isMedia,
    isActive,
    hasFullAccess,
    canAccessPersonalSpace,
    canAccessCommunityZones,
    canAccessAthleteSpace,
    canAccessPartnerSpace,
  };
};

export const getCurrentUserPermissionContext = async (request?: Request): Promise<UserAccessPermissionContext> => {
  const profile = await getCurrentUserAccessProfile(request);
  return buildUserAccessPermissionContext(profile?.userAccess ?? null);
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
    const activePartner = partners.find((partner) => partner.id === partnerId || partner.row?.toString() === partnerId);
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
  const metadata = clerkUser.publicMetadata ?? {};
  const metadataRole = typeof metadata.role === "string" ? metadata.role : null;
  const metadataAthleteId = typeof metadata.athleteId === "string" ? metadata.athleteId.trim() : "";

  if (metadataRole !== "athlete" || !metadataAthleteId) {
    return null;
  }

  await createAthleteInvitationsTable();
  const sql = getSql();

  const invitationRows = await sql`
    SELECT athlete_id, email, clerk_invitation_id, status
    FROM athlete_invitations
    WHERE athlete_id = ${metadataAthleteId} AND status = 'invited'
  `;
  const invitation = invitationRows[0] as Record<string, unknown> | undefined;
  if (!invitation) {
    return null;
  }

  const invitedEmail = String(invitation.email ?? "").trim().toLowerCase();
  if (!invitedEmail) {
    return null;
  }

  const verifiedEmail = (clerkUser.emailAddresses ?? []).find(
    (entry) => entry.emailAddress.trim().toLowerCase() === invitedEmail && entry.verification?.status === "verified",
  );

  if (!verifiedEmail) {
    return null;
  }

  const workspaceId = getDefaultWorkspaceId();

  const upsertRows = await sql`
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
      ${verifiedEmail.emailAddress},
      'athlete',
      ${workspaceId},
      ${metadataAthleteId},
      NULL,
      NULL,
      'active',
      NOW(),
      NOW()
    )
    ON CONFLICT (clerk_user_id) DO UPDATE SET
      email = EXCLUDED.email,
      role = 'athlete',
      athlete_id = EXCLUDED.athlete_id,
      status = 'active',
      updated_at = NOW()
    RETURNING clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at
  `;

  await sql`UPDATE athlete_invitations SET status = 'accepted', updated_at = NOW() WHERE athlete_id = ${metadataAthleteId}`;

  return upsertRows[0] ? mapRow(upsertRows[0] as Record<string, unknown>) : null;
};

export const getCurrentUserAccessProfile = async (request?: Request): Promise<CurrentUserAccessProfile | null> => {
  const currentRequest = request ?? new Request("http://localhost");
  const authResult = await getAuthenticatedClerkUser(currentRequest);
  if (!authResult) {
    return null;
  }

  const { userId, clerkUser } = authResult;
  await createUserAccessTable();

  const sql = getSql();
  const rows = await sql`SELECT clerk_user_id, email, role, workspace_id, athlete_id, partner_id, media_id, status, created_at, updated_at FROM user_access WHERE clerk_user_id = ${userId}`;

  let userAccess = rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;

  if (!userAccess) {
    userAccess = await linkAthleteAccessFromInvitation(userId, clerkUser);
  }

  return {
    clerkUser: {
      id: clerkUser.id,
      email: clerkUser.emailAddresses?.[0]?.emailAddress ?? null,
    },
    userAccess,
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

export const getAthleteAccessState = async (athleteId: string): Promise<{ state: AthleteAccessState; email: string | null }> => {
  const trimmedAthleteId = athleteId.trim();
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

export const inviteAthleteToKlique = async (
  request: Request,
  athleteId: string,
  options?: { resend?: boolean },
): Promise<InviteAthleteResult> => {
  console.log("[inviteAthleteToKlique][resend-debug]", {
    options,
    optionsResend: options?.resend,
    optionsResendType: typeof options?.resend,
  });
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
  const emailValidationResult = email ? isValidEmail(email) : false;
  console.log("[inviteAthleteToKlique][email-diagnostic]", {
    athleteName: athlete.name,
    athleteEmailJson: JSON.stringify(athlete.email),
    athleteEmailLength: athlete.email?.length ?? null,
    normalizedEmail: email,
    isValidEmail: emailValidationResult,
  });
  if (!email) {
    return { ok: false, reason: "missing_email" };
  }
  if (!isValidEmail(email)) {
    return { ok: false, reason: "invalid_email" };
  }

  await createUserAccessTable();
  await createAthleteInvitationsTable();
  const sql = getSql();

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
      redirectUrl: "/sign-up",
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
      clerk_invitation_id,
      status,
      invited_by_clerk_user_id,
      created_at,
      updated_at
    )
    VALUES (
      ${trimmedAthleteId},
      ${email},
      ${invitationId},
      'invited',
      ${authResult.userId},
      NOW(),
      NOW()
    )
    ON CONFLICT (athlete_id) DO UPDATE SET
      email = EXCLUDED.email,
      clerk_invitation_id = EXCLUDED.clerk_invitation_id,
      status = 'invited',
      invited_by_clerk_user_id = EXCLUDED.invited_by_clerk_user_id,
      updated_at = NOW()
    RETURNING athlete_id, email, clerk_invitation_id, status, invited_by_clerk_user_id, created_at, updated_at
  `;

  return { ok: true, invitation: mapInvitationRow(rows[0] as Record<string, unknown>) };
};
