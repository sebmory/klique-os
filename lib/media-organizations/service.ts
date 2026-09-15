import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";

export const MEDIA_ORGANIZATION_TYPES = [
  "media_outlet",
  "journalist",
  "agency",
  "creator",
  "other",
] as const;

export const MEDIA_ORGANIZATION_STATUSES = ["active", "inactive"] as const;

export type MediaOrganizationType = (typeof MEDIA_ORGANIZATION_TYPES)[number];
export type MediaOrganizationStatus = (typeof MEDIA_ORGANIZATION_STATUSES)[number];

export type MediaOrganization = {
  id: string;
  workspaceId: string;
  name: string;
  type: MediaOrganizationType;
  contactEmail: string;
  website: string | null;
  status: MediaOrganizationStatus;
  createdAt: string;
  updatedAt: string;
};

export type MediaOrganizationInvitationOverview = {
  invitationId: string;
  mediaId: string | null;
  email: string;
  invitationStatus: "invited" | "accepted" | "revoked";
  accessStatus: "active" | "disabled" | null;
  createdAt: string;
};

export type CreateMediaOrganizationInput = {
  name?: unknown;
  type?: unknown;
  contactEmail?: unknown;
  website?: unknown;
  status?: unknown;
};

export type LinkExistingMediaAccessInput = {
  mediaId?: unknown;
  email?: unknown;
};

export type LinkedMediaAccess = {
  clerkUserId: string;
  mediaId: string;
  email: string;
  linkedInvitationCount: number;
};

export type MediaOrganizationErrorCode = "validation" | "not_found" | "conflict" | "invitation_pending";

export class MediaOrganizationError extends Error {
  constructor(
    public readonly code: MediaOrganizationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MediaOrganizationError";
  }
}

export class MediaOrganizationValidationError extends MediaOrganizationError {
  constructor(message: string) {
    super("validation", message);
    this.name = "MediaOrganizationValidationError";
  }
}

export class MediaOrganizationNotFoundError extends MediaOrganizationError {
  constructor(message = "Organisation media introuvable.") {
    super("not_found", message);
    this.name = "MediaOrganizationNotFoundError";
  }
}

export class MediaOrganizationConflictError extends MediaOrganizationError {
  constructor(message = "Une organisation media avec ces informations existe deja.") {
    super("conflict", message);
    this.name = "MediaOrganizationConflictError";
  }
}

type MediaOrganizationRow = Record<string, unknown>;

export type MediaOrganizationCreateRecord = {
  id: string;
  workspaceId: string;
  name: string;
  type: MediaOrganizationType;
  contactEmail: string;
  website: string | null;
  status: MediaOrganizationStatus;
};

export type MediaOrganizationRepository = {
  list: (workspaceId: string) => Promise<MediaOrganizationRow[]>;
  create: (record: MediaOrganizationCreateRecord) => Promise<MediaOrganizationRow>;
  getActive: (workspaceId: string, mediaId: string) => Promise<MediaOrganizationRow | null>;
};

type MediaOrganizationInvitationRepository = {
  list: (workspaceId: string) => Promise<MediaOrganizationRow[]>;
};

export type MediaOrganizationAccessLinkTransactionResult = {
  organizationRows: MediaOrganizationRow[];
  accessRows: MediaOrganizationRow[];
  pendingInvitationRows: MediaOrganizationRow[];
  updatedAccessRows: MediaOrganizationRow[];
  updatedInvitationRows: MediaOrganizationRow[];
};

export type MediaOrganizationAccessLinkRepository = {
  linkExisting: (
    workspaceId: string,
    mediaId: string,
    email: string,
  ) => Promise<MediaOrganizationAccessLinkTransactionResult>;
};

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const requireText = (value: unknown, fieldName: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new MediaOrganizationValidationError(`${fieldName} est requis.`);
  }
  return normalized;
};

const normalizeWorkspaceId = (value: unknown): string => requireText(value, "workspaceId");

const normalizeMediaId = (value: unknown): string => {
  const mediaId = requireText(value, "mediaId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaId)) {
    throw new MediaOrganizationValidationError("mediaId est invalide.");
  }
  return mediaId.toLowerCase();
};

export const normalizeMediaOrganizationName = (value: unknown): string =>
  requireText(value, "name").replace(/\s+/g, " ");

export const normalizeMediaOrganizationType = (value: unknown): MediaOrganizationType => {
  const normalized = requireText(value, "type").toLowerCase();
  if (!MEDIA_ORGANIZATION_TYPES.includes(normalized as MediaOrganizationType)) {
    throw new MediaOrganizationValidationError("type est invalide.");
  }
  return normalized as MediaOrganizationType;
};

export const normalizeMediaOrganizationEmail = (value: unknown): string => {
  const normalized = requireText(value, "contactEmail").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new MediaOrganizationValidationError("contactEmail est invalide.");
  }
  return normalized;
};

const normalizeMediaAccessEmail = (value: unknown): string => {
  const normalized = requireText(value, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new MediaOrganizationValidationError("email est invalide.");
  }
  return normalized;
};

export const normalizeMediaOrganizationWebsite = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;

  const normalized = normalizeText(value);
  if (!normalized) {
    throw new MediaOrganizationValidationError("website ne peut pas etre vide.");
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new MediaOrganizationValidationError("website est invalide.");
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof MediaOrganizationValidationError) throw error;
    throw new MediaOrganizationValidationError("website est invalide.");
  }
};

export const normalizeMediaOrganizationStatus = (value: unknown): MediaOrganizationStatus => {
  const normalized = requireText(value, "status").toLowerCase();
  if (!MEDIA_ORGANIZATION_STATUSES.includes(normalized as MediaOrganizationStatus)) {
    throw new MediaOrganizationValidationError("status est invalide.");
  }
  return normalized as MediaOrganizationStatus;
};

const normalizeTimestamp = (value: unknown, fieldName: string): string => {
  const parsed = value instanceof Date ? value : new Date(requireText(value, fieldName));
  if (Number.isNaN(parsed.getTime())) {
    throw new MediaOrganizationValidationError(`${fieldName} Neon est invalide.`);
  }
  return parsed.toISOString();
};

const mapMediaOrganizationRow = (row: MediaOrganizationRow): MediaOrganization => ({
  id: normalizeMediaId(row.id),
  workspaceId: normalizeWorkspaceId(row.workspace_id),
  name: normalizeMediaOrganizationName(row.name),
  type: normalizeMediaOrganizationType(row.type),
  contactEmail: normalizeMediaOrganizationEmail(row.contact_email),
  website: normalizeMediaOrganizationWebsite(row.website),
  status: normalizeMediaOrganizationStatus(row.status),
  createdAt: normalizeTimestamp(row.created_at, "created_at"),
  updatedAt: normalizeTimestamp(row.updated_at, "updated_at"),
});

const createRepository = (): MediaOrganizationRepository => {
  const sql = createContentStorageClient();

  return {
    async list(workspaceId) {
      return await sql`
        SELECT id, workspace_id, name, type, contact_email, website, status, created_at, updated_at
        FROM media_organizations
        WHERE workspace_id = ${workspaceId}
        ORDER BY lower(btrim(name)), created_at, id
      ` as MediaOrganizationRow[];
    },

    async create(record) {
      const rows = await sql`
        INSERT INTO media_organizations (
          id, workspace_id, name, type, contact_email, website, status, created_at, updated_at
        ) VALUES (
          ${record.id}::uuid,
          ${record.workspaceId},
          ${record.name},
          ${record.type},
          ${record.contactEmail},
          ${record.website},
          ${record.status},
          NOW(),
          NOW()
        )
        RETURNING id, workspace_id, name, type, contact_email, website, status, created_at, updated_at
      `;
      return rows[0] as MediaOrganizationRow;
    },

    async getActive(workspaceId, mediaId) {
      const rows = await sql`
        SELECT id, workspace_id, name, type, contact_email, website, status, created_at, updated_at
        FROM media_organizations
        WHERE workspace_id = ${workspaceId}
          AND id = ${mediaId}::uuid
          AND status = 'active'
        LIMIT 1
      `;
      return (rows[0] as MediaOrganizationRow | undefined) ?? null;
    },
  };
};

const createInvitationRepository = (): MediaOrganizationInvitationRepository => {
  const sql = createContentStorageClient();

  return {
    async list(workspaceId) {
      return await sql`
        SELECT
          invitation.id,
          invitation.media_id,
          invitation.email,
          invitation.status AS invitation_status,
          access.status AS access_status,
          invitation.created_at
        FROM media_invitations invitation
        LEFT JOIN user_access access
          ON access.clerk_user_id = invitation.accepted_clerk_user_id
          AND access.workspace_id = invitation.workspace_id
          AND access.role = 'media'
          AND (
            invitation.media_id IS NULL
            OR access.media_id = invitation.media_id::text
          )
        WHERE invitation.workspace_id = ${workspaceId}
        ORDER BY invitation.created_at DESC, invitation.id DESC
      ` as MediaOrganizationRow[];
    },
  };
};

const createAccessLinkRepository = (): MediaOrganizationAccessLinkRepository => {
  const sql = createContentStorageClient();

  return {
    async linkExisting(workspaceId, mediaId, email) {
      const organizationQuery = sql`
        SELECT id
        FROM media_organizations
        WHERE workspace_id = ${workspaceId}
          AND id = ${mediaId}::uuid
          AND status = 'active'
        FOR UPDATE
      `;
      const accessQuery = sql`
        SELECT clerk_user_id, media_id
        FROM user_access
        WHERE workspace_id = ${workspaceId}
          AND role = 'media'
          AND status = 'active'
          AND lower(btrim(email)) = ${email}
        FOR UPDATE
      `;
      const pendingInvitationQuery = sql`
        SELECT id
        FROM media_invitations
        WHERE workspace_id = ${workspaceId}
          AND lower(btrim(email)) = ${email}
          AND media_id IS NULL
          AND status = 'invited'
        FOR UPDATE
      `;
      const updateAccessQuery = sql`
        UPDATE user_access
        SET media_id = ${mediaId}
        WHERE workspace_id = ${workspaceId}
          AND role = 'media'
          AND status = 'active'
          AND lower(btrim(email)) = ${email}
          AND media_id IS NULL
          AND (
            SELECT COUNT(*)
            FROM user_access candidate
            WHERE candidate.workspace_id = ${workspaceId}
              AND candidate.role = 'media'
              AND candidate.status = 'active'
              AND lower(btrim(candidate.email)) = ${email}
          ) = 1
          AND EXISTS (
            SELECT 1
            FROM media_organizations organization
            WHERE organization.workspace_id = ${workspaceId}
              AND organization.id = ${mediaId}::uuid
              AND organization.status = 'active'
          )
        RETURNING clerk_user_id
      `;
      const updateInvitationsQuery = sql`
        UPDATE media_invitations invitation
        SET media_id = ${mediaId}::uuid
        WHERE invitation.workspace_id = ${workspaceId}
          AND lower(btrim(invitation.email)) = ${email}
          AND invitation.media_id IS NULL
          AND (
            SELECT COUNT(*)
            FROM user_access access
            WHERE access.workspace_id = ${workspaceId}
              AND access.role = 'media'
              AND access.status = 'active'
              AND lower(btrim(access.email)) = ${email}
          ) = 1
          AND EXISTS (
            SELECT 1
            FROM user_access access
            WHERE access.workspace_id = ${workspaceId}
              AND access.role = 'media'
              AND access.status = 'active'
              AND lower(btrim(access.email)) = ${email}
              AND access.media_id = ${mediaId}
          )
          AND EXISTS (
            SELECT 1
            FROM media_organizations organization
            WHERE organization.workspace_id = ${workspaceId}
              AND organization.id = ${mediaId}::uuid
              AND organization.status = 'active'
          )
        RETURNING invitation.id
      `;

      const results = await sql.transaction([
        organizationQuery,
        accessQuery,
        pendingInvitationQuery,
        updateAccessQuery,
        updateInvitationsQuery,
      ]);

      return {
        organizationRows: results[0] as MediaOrganizationRow[],
        accessRows: results[1] as MediaOrganizationRow[],
        pendingInvitationRows: results[2] as MediaOrganizationRow[],
        updatedAccessRows: results[3] as MediaOrganizationRow[],
        updatedInvitationRows: results[4] as MediaOrganizationRow[],
      };
    },
  };
};

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error
    && typeof error.cause === "object"
    && error.cause !== null
    && "code" in error.cause
    && error.cause.code === "23505";
};

export const listMediaOrganizations = async (
  workspaceId: string,
  repository: MediaOrganizationRepository = createRepository(),
): Promise<MediaOrganization[]> => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return (await repository.list(normalizedWorkspaceId)).map(mapMediaOrganizationRow);
};

export const listMediaOrganizationInvitations = async (
  workspaceId: string,
  repository: MediaOrganizationInvitationRepository = createInvitationRepository(),
): Promise<MediaOrganizationInvitationOverview[]> => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  return (await repository.list(normalizedWorkspaceId)).map((row) => {
    const invitationStatus = normalizeText(row.invitation_status);
    if (invitationStatus !== "invited" && invitationStatus !== "accepted" && invitationStatus !== "revoked") {
      throw new MediaOrganizationValidationError("invitation_status Neon est invalide.");
    }

    const accessStatus = row.access_status === null || row.access_status === undefined
      ? null
      : normalizeText(row.access_status);
    if (accessStatus !== null && accessStatus !== "active" && accessStatus !== "disabled") {
      throw new MediaOrganizationValidationError("access_status Neon est invalide.");
    }

    return {
      invitationId: requireText(row.id, "invitation_id"),
      mediaId: row.media_id === null || row.media_id === undefined
        ? null
        : normalizeMediaId(row.media_id),
      email: normalizeMediaOrganizationEmail(row.email),
      invitationStatus,
      accessStatus,
      createdAt: normalizeTimestamp(row.created_at, "created_at"),
    };
  });
};

export const createMediaOrganization = async (
  workspaceId: string,
  input: CreateMediaOrganizationInput,
  repository: MediaOrganizationRepository = createRepository(),
): Promise<MediaOrganization> => {
  const record: MediaOrganizationCreateRecord = {
    id: randomUUID(),
    workspaceId: normalizeWorkspaceId(workspaceId),
    name: normalizeMediaOrganizationName(input.name),
    type: normalizeMediaOrganizationType(input.type),
    contactEmail: normalizeMediaOrganizationEmail(input.contactEmail),
    website: normalizeMediaOrganizationWebsite(input.website),
    status: input.status === undefined ? "active" : normalizeMediaOrganizationStatus(input.status),
  };

  try {
    return mapMediaOrganizationRow(await repository.create(record));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new MediaOrganizationConflictError();
    }
    throw error;
  }
};

export const getActiveMediaOrganization = async (
  workspaceId: string,
  mediaId: string,
  repository: MediaOrganizationRepository = createRepository(),
): Promise<MediaOrganization> => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const normalizedMediaId = normalizeMediaId(mediaId);
  const row = await repository.getActive(normalizedWorkspaceId, normalizedMediaId);
  if (!row) {
    throw new MediaOrganizationNotFoundError();
  }
  return mapMediaOrganizationRow(row);
};

export const linkExistingMediaAccess = async (
  workspaceId: string,
  input: LinkExistingMediaAccessInput,
  repository: MediaOrganizationAccessLinkRepository = createAccessLinkRepository(),
): Promise<LinkedMediaAccess> => {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const mediaId = normalizeMediaId(input.mediaId);
  const email = normalizeMediaAccessEmail(input.email);
  const result = await repository.linkExisting(normalizedWorkspaceId, mediaId, email);

  if (result.organizationRows.length === 0) {
    throw new MediaOrganizationNotFoundError("Organisation media active introuvable.");
  }
  if (result.accessRows.length === 0) {
    if (result.pendingInvitationRows.length > 0) {
      throw new MediaOrganizationError(
        "invitation_pending",
        "Une invitation ancienne est encore en attente. Envoyez une nouvelle invitation liée à l’organisation.",
      );
    }
    throw new MediaOrganizationNotFoundError("Aucun accès média actif ne correspond à cette adresse.");
  }
  if (result.accessRows.length > 1) {
    throw new MediaOrganizationConflictError("Plusieurs accès média actifs correspondent à cette adresse.");
  }

  const accessRow = result.accessRows[0];
  const existingMediaId = normalizeText(accessRow.media_id);
  if (existingMediaId && existingMediaId !== mediaId) {
    throw new MediaOrganizationConflictError("Cet accès média est déjà lié à une autre organisation.");
  }
  if (!existingMediaId && result.updatedAccessRows.length !== 1) {
    throw new MediaOrganizationConflictError("L’accès média n’a pas pu être rattaché.");
  }

  return {
    clerkUserId: requireText(accessRow.clerk_user_id, "clerkUserId"),
    mediaId,
    email,
    linkedInvitationCount: result.updatedInvitationRows.length,
  };
};