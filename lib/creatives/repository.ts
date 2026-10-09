import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  creativeProvenances,
  creativeStatuses,
  creativeTypes,
  type CreateAdminManualCreativeProfileInput,
  type CreateCreativeProfileInput,
  type CreateFormApplicationCreativeProfileInput,
  type CreativeProfile,
  type CreativeProvenance,
  type CreativeStatus,
  type CreativeType,
  type UpdateCreativeProfileInput,
} from "@/types/creative";

type CreativeProfileRow = {
  id: string;
  workspace_id: string;
  provenance: string;
  application_id: string | null;
  display_name: string;
  creative_type: string;
  contact_email: string;
  phone: string | null;
  website_url: string | null;
  portfolio_url: string | null;
  instagram: string | null;
  city: string | null;
  country: string | null;
  coverage_areas: string[];
  specialties: string[];
  bio: string | null;
  status: string;
  source_row: number | null;
  approved_by_clerk_user_id: string;
  approved_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
};

type CreativeProfileCountRow = {
  count: number | string;
};

const columns = `
  id, workspace_id, provenance, application_id, display_name, creative_type, contact_email,
  phone, website_url, portfolio_url, instagram, city, country, coverage_areas,
  specialties, bio, status, source_row, approved_by_clerk_user_id, approved_at,
  created_at, updated_at
`;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CreativeProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreativeProfileValidationError";
  }
}

const normalizeRequiredText = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new CreativeProfileValidationError(`${field} est requis.`);
  }
  return value.trim().replace(/\s+/g, " ");
};

const normalizeNullableText = (value: unknown, field: string): string | null => {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new CreativeProfileValidationError(`${field} doit etre une chaine ou null.`);
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
};

const normalizeWorkspaceId = (value: unknown): string =>
  normalizeRequiredText(value, "workspaceId");

const normalizeUuid = (value: unknown, field: string): string => {
  const normalized = normalizeRequiredText(value, field).toLowerCase();
  if (!uuidPattern.test(normalized)) {
    throw new CreativeProfileValidationError(`${field} doit etre un UUID.`);
  }
  return normalized;
};

const normalizeEmail = (value: unknown): string => {
  const normalized = normalizeRequiredText(value, "contactEmail").toLowerCase();
  if (!emailPattern.test(normalized)) {
    throw new CreativeProfileValidationError("contactEmail est invalide.");
  }
  return normalized;
};

const normalizeUrl = (value: unknown, field: string): string | null => {
  const normalized = normalizeNullableText(value, field);
  if (normalized === null) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    return parsed.toString();
  } catch {
    throw new CreativeProfileValidationError(`${field} doit etre une URL HTTP(S) valide.`);
  }
};

const normalizeCreativeType = (value: unknown): CreativeType => {
  if (typeof value !== "string" || !creativeTypes.includes(value as CreativeType)) {
    throw new CreativeProfileValidationError("creativeType est invalide.");
  }
  return value as CreativeType;
};

const normalizeStatus = (value: unknown): CreativeStatus => {
  if (typeof value !== "string" || !creativeStatuses.includes(value as CreativeStatus)) {
    throw new CreativeProfileValidationError("status est invalide.");
  }
  return value as CreativeStatus;
};

const normalizeProvenance = (value: unknown): CreativeProvenance => {
  if (
    typeof value !== "string"
    || !creativeProvenances.includes(value as CreativeProvenance)
  ) {
    throw new CreativeProfileValidationError("provenance est invalide.");
  }
  return value as CreativeProvenance;
};

const normalizeStringList = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new CreativeProfileValidationError(`${field} doit etre une liste de chaines.`);
  }
  return [...new Set(value.map((entry) => entry.trim().replace(/\s+/g, " ")).filter(Boolean))];
};

const normalizeSourceRow = (value: unknown): number => {
  if (!Number.isInteger(value) || Number(value) <= 1) {
    throw new CreativeProfileValidationError("sourceRow doit etre un entier superieur a 1.");
  }
  return Number(value);
};

const normalizeTimestamp = (value: unknown, field: string): string => {
  const date = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new CreativeProfileValidationError(`${field} est invalide.`);
  }
  return date.toISOString();
};

const mapProvenanceFields = (
  row: CreativeProfileRow,
): Pick<CreativeProfile, "provenance" | "applicationId" | "sourceRow"> => {
  const provenance = normalizeProvenance(row.provenance);
  if (provenance === "form_application") {
    return {
      provenance,
      applicationId: normalizeUuid(row.application_id, "creative_profiles.application_id"),
      sourceRow: normalizeSourceRow(row.source_row),
    };
  }
  if (row.application_id !== null || row.source_row !== null) {
    throw new CreativeProfileValidationError(
      "Une fiche manuelle stockee ne peut pas avoir application_id ou source_row.",
    );
  }
  return {
    provenance,
    applicationId: null,
    sourceRow: null,
  };
};

const mapRow = (row: CreativeProfileRow): CreativeProfile => ({
  id: normalizeUuid(row.id, "creative_profiles.id"),
  workspaceId: normalizeWorkspaceId(row.workspace_id),
  ...mapProvenanceFields(row),
  displayName: normalizeRequiredText(row.display_name, "creative_profiles.display_name"),
  creativeType: normalizeCreativeType(row.creative_type),
  contactEmail: normalizeEmail(row.contact_email),
  phone: normalizeNullableText(row.phone, "creative_profiles.phone"),
  websiteUrl: normalizeUrl(row.website_url, "creative_profiles.website_url"),
  portfolioUrl: normalizeUrl(row.portfolio_url, "creative_profiles.portfolio_url"),
  instagram: normalizeNullableText(row.instagram, "creative_profiles.instagram"),
  city: normalizeNullableText(row.city, "creative_profiles.city"),
  country: normalizeNullableText(row.country, "creative_profiles.country"),
  coverageAreas: normalizeStringList(row.coverage_areas, "creative_profiles.coverage_areas"),
  specialties: normalizeStringList(row.specialties, "creative_profiles.specialties"),
  bio: normalizeNullableText(row.bio, "creative_profiles.bio"),
  status: normalizeStatus(row.status),
  approvedByClerkUserId: normalizeRequiredText(
    row.approved_by_clerk_user_id,
    "creative_profiles.approved_by_clerk_user_id",
  ),
  approvedAt: normalizeTimestamp(row.approved_at, "creative_profiles.approved_at"),
  createdAt: normalizeTimestamp(row.created_at, "creative_profiles.created_at"),
  updatedAt: normalizeTimestamp(row.updated_at, "creative_profiles.updated_at"),
});

const validateCreateInput = (input: CreateCreativeProfileInput): CreateCreativeProfileInput => {
  const provenance = normalizeProvenance(input.provenance);
  const businessFields = {
  displayName: normalizeRequiredText(input.displayName, "displayName"),
  creativeType: normalizeCreativeType(input.creativeType),
  contactEmail: normalizeEmail(input.contactEmail),
  phone: normalizeNullableText(input.phone, "phone"),
  websiteUrl: normalizeUrl(input.websiteUrl, "websiteUrl"),
  portfolioUrl: normalizeUrl(input.portfolioUrl, "portfolioUrl"),
  instagram: normalizeNullableText(input.instagram, "instagram"),
  city: normalizeNullableText(input.city, "city"),
  country: normalizeNullableText(input.country, "country"),
  coverageAreas: normalizeStringList(input.coverageAreas, "coverageAreas"),
  specialties: normalizeStringList(input.specialties, "specialties"),
  bio: normalizeNullableText(input.bio, "bio"),
  status: normalizeStatus(input.status),
  approvedByClerkUserId: normalizeRequiredText(input.approvedByClerkUserId, "approvedByClerkUserId"),
  approvedAt: normalizeTimestamp(input.approvedAt, "approvedAt"),
  };
  if (provenance === "form_application") {
    if (input.provenance !== "form_application") {
      throw new CreativeProfileValidationError("provenance est incoherente.");
    }
    return {
      ...businessFields,
      provenance,
      applicationId: normalizeUuid(input.applicationId, "applicationId"),
      sourceRow: normalizeSourceRow(input.sourceRow),
    };
  }
  if (
    input.provenance !== "admin_manual"
    || input.applicationId !== null
    || input.sourceRow !== null
  ) {
    throw new CreativeProfileValidationError(
      "Une fiche manuelle ne peut pas avoir applicationId ou sourceRow.",
    );
  }
  return {
    ...businessFields,
    provenance,
    applicationId: null,
    sourceRow: null,
  };
};

const validateUpdateInput = (
  input: UpdateCreativeProfileInput,
  current: CreativeProfile,
): CreateCreativeProfileInput => {
  const businessFields = {
  displayName: input.displayName ?? current.displayName,
  creativeType: input.creativeType ?? current.creativeType,
  contactEmail: input.contactEmail ?? current.contactEmail,
  phone: input.phone === undefined ? current.phone : input.phone,
  websiteUrl: input.websiteUrl === undefined ? current.websiteUrl : input.websiteUrl,
  portfolioUrl: input.portfolioUrl === undefined ? current.portfolioUrl : input.portfolioUrl,
  instagram: input.instagram === undefined ? current.instagram : input.instagram,
  city: input.city === undefined ? current.city : input.city,
  country: input.country === undefined ? current.country : input.country,
  coverageAreas: input.coverageAreas ?? current.coverageAreas,
  specialties: input.specialties ?? current.specialties,
  bio: input.bio === undefined ? current.bio : input.bio,
  status: input.status ?? current.status,
  approvedByClerkUserId: current.approvedByClerkUserId,
  approvedAt: current.approvedAt,
  };
  if (current.provenance === "form_application") {
    if (!current.applicationId || current.sourceRow === null) {
      throw new CreativeProfileValidationError("Provenance formulaire incoherente.");
    }
    return validateCreateInput({
      ...businessFields,
      provenance: "form_application",
      applicationId: current.applicationId,
      sourceRow: current.sourceRow,
    });
  }
  return validateCreateInput({
    ...businessFields,
    provenance: "admin_manual",
    applicationId: null,
    sourceRow: null,
  });
};

export const CreativeProfileRepository = {
  async countActive(workspaceId: string): Promise<number> {
    const workspace = normalizeWorkspaceId(workspaceId);
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT COUNT(*)::integer AS count
      FROM creative_profiles
      WHERE workspace_id = $1 AND status = 'active'
    `, [workspace]) as CreativeProfileCountRow[];
    const count = Number(rows[0]?.count ?? 0);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("Le compteur de fiches creatives est invalide.");
    }
    return count;
  },

  async createIdempotent(
    workspaceId: string,
    input: CreateFormApplicationCreativeProfileInput,
  ): Promise<CreativeProfile> {
    const workspace = normalizeWorkspaceId(workspaceId);
    const validated = validateCreateInput(input);
    if (validated.provenance !== "form_application") {
      throw new CreativeProfileValidationError("provenance est invalide.");
    }
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      INSERT INTO creative_profiles (
        id, workspace_id, provenance, application_id, display_name, creative_type, contact_email,
        phone, website_url, portfolio_url, instagram, city, country, coverage_areas,
        specialties, bio, status, source_row, approved_by_clerk_user_id, approved_at
      ) VALUES (
        $1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14::text[], $15::text[], $16, $17, $18, $19, $20::timestamptz
      )
      ON CONFLICT (workspace_id, application_id)
      DO UPDATE SET application_id = creative_profiles.application_id
      RETURNING ${columns}
    `, [
      randomUUID(), workspace, validated.provenance, validated.applicationId, validated.displayName,
      validated.creativeType, validated.contactEmail, validated.phone,
      validated.websiteUrl, validated.portfolioUrl, validated.instagram,
      validated.city, validated.country, validated.coverageAreas,
      validated.specialties, validated.bio, validated.status, validated.sourceRow,
      validated.approvedByClerkUserId, validated.approvedAt,
    ]) as CreativeProfileRow[];
    if (!rows[0]) throw new Error("La fiche creative n'a pas ete creee.");
    return mapRow(rows[0]);
  },

  async createManual(
    workspaceId: string,
    input: CreateAdminManualCreativeProfileInput,
  ): Promise<CreativeProfile> {
    const workspace = normalizeWorkspaceId(workspaceId);
    const validated = validateCreateInput(input);
    if (validated.provenance !== "admin_manual") {
      throw new CreativeProfileValidationError("provenance est invalide.");
    }
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      INSERT INTO creative_profiles (
        id, workspace_id, provenance, application_id, display_name, creative_type,
        contact_email, phone, website_url, portfolio_url, instagram, city, country,
        coverage_areas, specialties, bio, status, source_row,
        approved_by_clerk_user_id, approved_at
      ) VALUES (
        $1::uuid, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13::text[], $14::text[], $15, $16, NULL, $17, $18::timestamptz
      )
      RETURNING ${columns}
    `, [
      randomUUID(), workspace, validated.provenance, validated.displayName,
      validated.creativeType, validated.contactEmail, validated.phone,
      validated.websiteUrl, validated.portfolioUrl, validated.instagram,
      validated.city, validated.country, validated.coverageAreas,
      validated.specialties, validated.bio, validated.status,
      validated.approvedByClerkUserId, validated.approvedAt,
    ]) as CreativeProfileRow[];
    if (!rows[0]) throw new Error("La fiche creative manuelle n'a pas ete creee.");
    return mapRow(rows[0]);
  },

  async getById(workspaceId: string, creativeId: string): Promise<CreativeProfile | null> {
    const workspace = normalizeWorkspaceId(workspaceId);
    const id = normalizeUuid(creativeId, "creativeId");
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${columns}
      FROM creative_profiles
      WHERE workspace_id = $1 AND id = $2::uuid
      LIMIT 1
    `, [workspace, id]) as CreativeProfileRow[];
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async list(workspaceId: string): Promise<CreativeProfile[]> {
    const workspace = normalizeWorkspaceId(workspaceId);
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${columns}
      FROM creative_profiles
      WHERE workspace_id = $1
      ORDER BY lower(display_name), created_at, id
    `, [workspace]) as CreativeProfileRow[];
    return rows.map(mapRow);
  },

  async update(
    workspaceId: string,
    creativeId: string,
    input: UpdateCreativeProfileInput,
  ): Promise<CreativeProfile | null> {
    const current = await this.getById(workspaceId, creativeId);
    if (!current) return null;
    const validated = validateUpdateInput(input, current);
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE creative_profiles
      SET display_name = $1,
          creative_type = $2,
          contact_email = $3,
          phone = $4,
          website_url = $5,
          portfolio_url = $6,
          instagram = $7,
          city = $8,
          country = $9,
          coverage_areas = $10::text[],
          specialties = $11::text[],
          bio = $12,
          status = $13,
          updated_at = NOW()
      WHERE workspace_id = $14 AND id = $15::uuid
      RETURNING ${columns}
    `, [
      validated.displayName, validated.creativeType, validated.contactEmail,
      validated.phone, validated.websiteUrl, validated.portfolioUrl,
      validated.instagram, validated.city, validated.country,
      validated.coverageAreas, validated.specialties, validated.bio,
      validated.status, current.workspaceId, current.id,
    ]) as CreativeProfileRow[];
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async setStatus(
    workspaceId: string,
    creativeId: string,
    status: CreativeStatus,
  ): Promise<CreativeProfile | null> {
    const workspace = normalizeWorkspaceId(workspaceId);
    const id = normalizeUuid(creativeId, "creativeId");
    const normalizedStatus = normalizeStatus(status);
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE creative_profiles
      SET status = $1, updated_at = NOW()
      WHERE workspace_id = $2 AND id = $3::uuid
      RETURNING ${columns}
    `, [normalizedStatus, workspace, id]) as CreativeProfileRow[];
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async activate(workspaceId: string, creativeId: string): Promise<CreativeProfile | null> {
    return this.setStatus(workspaceId, creativeId, "active");
  },

  async deactivate(workspaceId: string, creativeId: string): Promise<CreativeProfile | null> {
    return this.setStatus(workspaceId, creativeId, "inactive");
  },
};
