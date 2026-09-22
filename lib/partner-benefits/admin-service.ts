import { randomUUID } from "node:crypto";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { getEcosystemPartnersFrom06Partenaires } from "@/lib/google-sheets";

export const PARTNER_BENEFIT_USAGE_POLICIES = ["once_lifetime", "once_per_membership", "unlimited"] as const;
export const PARTNER_BENEFIT_STATUSES = ["active", "inactive"] as const;

export type PartnerBenefitUsagePolicy = (typeof PARTNER_BENEFIT_USAGE_POLICIES)[number];
export type PartnerBenefitStatus = (typeof PARTNER_BENEFIT_STATUSES)[number];

export type AdminPartnerBenefit = {
  id: string;
  workspaceId: string;
  partnerId: string;
  title: string;
  details: string;
  usagePolicy: PartnerBenefitUsagePolicy;
  validFrom: string;
  expiresAt: string | null;
  status: PartnerBenefitStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreatePartnerBenefitInput = {
  partnerId?: unknown;
  title?: unknown;
  details?: unknown;
  usagePolicy?: unknown;
  validFrom?: unknown;
  expiresAt?: unknown;
  status?: unknown;
};

export type UpdatePartnerBenefitInput = Partial<Omit<CreatePartnerBenefitInput, "partnerId">>;

type PartnerBenefitRow = Record<string, unknown>;

type PartnerBenefitCreateRecord = {
  id: string;
  workspaceId: string;
  partnerId: string;
  title: string;
  details: string;
  usagePolicy: PartnerBenefitUsagePolicy;
  validFrom: string;
  expiresAt: string | null;
  status: PartnerBenefitStatus;
};

type PartnerBenefitUpdateRecord = {
  workspaceId: string;
  partnerId: string;
  benefitId: string;
  title: { set: boolean; value: string };
  details: { set: boolean; value: string };
  usagePolicy: { set: boolean; value: PartnerBenefitUsagePolicy };
  validFrom: { set: boolean; value: string };
  expiresAt: { set: boolean; value: string | null };
  status: { set: boolean; value: PartnerBenefitStatus };
};

export type PartnerBenefitAdminRepository = {
  list: (workspaceId: string, partnerId?: string) => Promise<PartnerBenefitRow[]>;
  create: (record: PartnerBenefitCreateRecord) => Promise<PartnerBenefitRow | null>;
  update: (record: PartnerBenefitUpdateRecord) => Promise<PartnerBenefitRow | null>;
  deactivate: (workspaceId: string, partnerId: string, benefitId: string) => Promise<PartnerBenefitRow | null>;
};

export type PartnerBenefitAdminDependencies = {
  repository: PartnerBenefitAdminRepository;
  getPartners: typeof getEcosystemPartnersFrom06Partenaires;
};

export class PartnerBenefitAdminError extends Error {
  constructor(
    public readonly code: "forbidden" | "validation" | "partner_not_found" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "PartnerBenefitAdminError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const normalizeText = (value: unknown): string => String(value ?? "").trim().replace(/\s+/g, " ");

const requireText = (value: unknown, fieldName: string, maximumLength: number): string => {
  const normalized = normalizeText(value);
  if (!normalized) throw new PartnerBenefitAdminError("validation", `${fieldName} est requis.`);
  if (normalized.length > maximumLength) {
    throw new PartnerBenefitAdminError("validation", `${fieldName} est trop long.`);
  }
  return normalized;
};

export const normalizePartnerBenefitUuid = (value: unknown, fieldName = "partnerId"): string => {
  const normalized = requireText(value, fieldName, 36).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new PartnerBenefitAdminError("validation", `${fieldName} doit être un UUID valide.`);
  }
  return normalized;
};

export const normalizePartnerBenefitUsagePolicy = (value: unknown): PartnerBenefitUsagePolicy => {
  const normalized = normalizeText(value).toLowerCase();
  if (!PARTNER_BENEFIT_USAGE_POLICIES.includes(normalized as PartnerBenefitUsagePolicy)) {
    throw new PartnerBenefitAdminError("validation", "usagePolicy est invalide.");
  }
  return normalized as PartnerBenefitUsagePolicy;
};

export const normalizePartnerBenefitStatus = (value: unknown): PartnerBenefitStatus => {
  const normalized = normalizeText(value).toLowerCase();
  if (!PARTNER_BENEFIT_STATUSES.includes(normalized as PartnerBenefitStatus)) {
    throw new PartnerBenefitAdminError("validation", "status est invalide.");
  }
  return normalized as PartnerBenefitStatus;
};

export const normalizePartnerBenefitDate = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new PartnerBenefitAdminError("validation", `${fieldName} est requis.`);
  }
  const normalized = value.trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(normalized)) {
    throw new PartnerBenefitAdminError("validation", `${fieldName} doit être une date ISO avec heure.`);
  }
  return parsed.toISOString();
};

const normalizeOptionalDate = (value: unknown, fieldName: string): string | null => {
  if (value === null || value === "") return null;
  return normalizePartnerBenefitDate(value, fieldName);
};

const validateDateRange = (validFrom: string, expiresAt: string | null): void => {
  if (expiresAt && new Date(expiresAt).getTime() <= new Date(validFrom).getTime()) {
    throw new PartnerBenefitAdminError("validation", "expiresAt doit être postérieur à validFrom.");
  }
};

const normalizeTimestampFromDatabase = (value: unknown, fieldName: string): string => {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) {
    throw new PartnerBenefitAdminError("validation", `${fieldName} Neon est invalide.`);
  }
  return parsed.toISOString();
};

const mapBenefitRow = (row: PartnerBenefitRow): AdminPartnerBenefit => ({
  id: normalizePartnerBenefitUuid(row.id, "id"),
  workspaceId: requireText(row.workspace_id, "workspace_id", 120),
  partnerId: normalizePartnerBenefitUuid(row.partner_id),
  title: requireText(row.title, "title", 200),
  details: requireText(row.details, "details", 5000),
  usagePolicy: normalizePartnerBenefitUsagePolicy(row.usage_policy),
  validFrom: normalizeTimestampFromDatabase(row.valid_from, "valid_from"),
  expiresAt: row.expires_at === null ? null : normalizeTimestampFromDatabase(row.expires_at, "expires_at"),
  status: normalizePartnerBenefitStatus(row.status),
  createdAt: normalizeTimestampFromDatabase(row.created_at, "created_at"),
  updatedAt: normalizeTimestampFromDatabase(row.updated_at, "updated_at"),
});

const createRepository = (): PartnerBenefitAdminRepository => {
  const sql = createContentStorageClient();

  return {
    async list(workspaceId, partnerId) {
      if (partnerId) {
        return await sql`
          SELECT id, workspace_id, partner_id, title, details, usage_policy,
                 valid_from, expires_at, status, created_at, updated_at
          FROM partner_benefits
          WHERE workspace_id = ${workspaceId}
            AND partner_id = ${partnerId}::uuid
          ORDER BY status ASC, valid_from DESC, title ASC
        ` as PartnerBenefitRow[];
      }
      return await sql`
        SELECT id, workspace_id, partner_id, title, details, usage_policy,
               valid_from, expires_at, status, created_at, updated_at
        FROM partner_benefits
        WHERE workspace_id = ${workspaceId}
        ORDER BY status ASC, valid_from DESC, title ASC
      ` as PartnerBenefitRow[];
    },

    async create(record) {
      const rows = await sql`
        INSERT INTO partner_benefits (
          id, workspace_id, partner_id, title, details, usage_policy,
          valid_from, expires_at, status, created_at, updated_at
        ) VALUES (
          ${record.id}::uuid, ${record.workspaceId}, ${record.partnerId}::uuid,
          ${record.title}, ${record.details}, ${record.usagePolicy},
          ${record.validFrom}::timestamptz, ${record.expiresAt}::timestamptz,
          ${record.status}, NOW(), NOW()
        )
        RETURNING id, workspace_id, partner_id, title, details, usage_policy,
                  valid_from, expires_at, status, created_at, updated_at
      ` as PartnerBenefitRow[];
      return rows[0] ?? null;
    },

    async update(record) {
      const rows = await sql`
        UPDATE partner_benefits
        SET title = CASE WHEN ${record.title.set} THEN ${record.title.value} ELSE title END,
            details = CASE WHEN ${record.details.set} THEN ${record.details.value} ELSE details END,
            usage_policy = CASE WHEN ${record.usagePolicy.set} THEN ${record.usagePolicy.value} ELSE usage_policy END,
            valid_from = CASE WHEN ${record.validFrom.set} THEN ${record.validFrom.value}::timestamptz ELSE valid_from END,
            expires_at = CASE WHEN ${record.expiresAt.set} THEN ${record.expiresAt.value}::timestamptz ELSE expires_at END,
            status = CASE WHEN ${record.status.set} THEN ${record.status.value} ELSE status END,
            updated_at = NOW()
        WHERE workspace_id = ${record.workspaceId}
          AND partner_id = ${record.partnerId}::uuid
          AND id = ${record.benefitId}::uuid
          AND (
            CASE WHEN ${record.expiresAt.set} THEN ${record.expiresAt.value}::timestamptz ELSE expires_at END IS NULL
            OR CASE WHEN ${record.validFrom.set} THEN ${record.validFrom.value}::timestamptz ELSE valid_from END
              < CASE WHEN ${record.expiresAt.set} THEN ${record.expiresAt.value}::timestamptz ELSE expires_at END
          )
        RETURNING id, workspace_id, partner_id, title, details, usage_policy,
                  valid_from, expires_at, status, created_at, updated_at
      ` as PartnerBenefitRow[];
      return rows[0] ?? null;
    },

    async deactivate(workspaceId, partnerId, benefitId) {
      const rows = await sql`
        UPDATE partner_benefits
        SET status = 'inactive', updated_at = NOW()
        WHERE workspace_id = ${workspaceId}
          AND partner_id = ${partnerId}::uuid
          AND id = ${benefitId}::uuid
        RETURNING id, workspace_id, partner_id, title, details, usage_policy,
                  valid_from, expires_at, status, created_at, updated_at
      ` as PartnerBenefitRow[];
      return rows[0] ?? null;
    },
  };
};

const defaultDependencies = (): PartnerBenefitAdminDependencies => ({
  repository: createRepository(),
  getPartners: getEcosystemPartnersFrom06Partenaires,
});

const requireActiveAdminWorkspace = async (request: Request): Promise<string> => {
  const profile = await getCurrentUserAccessProfile(request);
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";
  const access = profile?.userAccess ?? null;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (!clerkUserId || access?.role !== "admin" || access.status !== "active" || !workspaceId) {
    throw new PartnerBenefitAdminError("forbidden", "Un accès Admin actif est requis.");
  }
  return workspaceId;
};

const requireActivePartner = async (
  partnerIdValue: unknown,
  getPartners: typeof getEcosystemPartnersFrom06Partenaires,
): Promise<string> => {
  const partnerId = normalizePartnerBenefitUuid(partnerIdValue);
  const partners = await getPartners();
  const matches = partners.filter((partner) => String(partner.id ?? "").trim().toLowerCase() === partnerId);
  if (matches.length !== 1 || normalizeText(matches[0].status).toLocaleLowerCase("fr") !== "actif") {
    throw new PartnerBenefitAdminError("partner_not_found", "Le partenaire actif est introuvable dans 06_Partenaires.");
  }
  return partnerId;
};

const getDependencies = (dependencies?: PartnerBenefitAdminDependencies): PartnerBenefitAdminDependencies =>
  dependencies ?? defaultDependencies();

export const listAdminPartnerBenefits = async (
  request: Request,
  partnerIdValue?: unknown,
  dependencies?: PartnerBenefitAdminDependencies,
): Promise<AdminPartnerBenefit[]> => {
  const workspaceId = await requireActiveAdminWorkspace(request);
  const resolved = getDependencies(dependencies);
  const partnerId = partnerIdValue === undefined
    ? undefined
    : await requireActivePartner(partnerIdValue, resolved.getPartners);
  return (await resolved.repository.list(workspaceId, partnerId)).map(mapBenefitRow);
};

export const createAdminPartnerBenefit = async (
  request: Request,
  input: CreatePartnerBenefitInput,
  dependencies?: PartnerBenefitAdminDependencies,
): Promise<AdminPartnerBenefit> => {
  const workspaceId = await requireActiveAdminWorkspace(request);
  const resolved = getDependencies(dependencies);
  const partnerId = await requireActivePartner(input.partnerId, resolved.getPartners);
  const validFrom = normalizePartnerBenefitDate(input.validFrom, "validFrom");
  const expiresAt = normalizeOptionalDate(input.expiresAt, "expiresAt");
  validateDateRange(validFrom, expiresAt);
  const row = await resolved.repository.create({
    id: randomUUID(),
    workspaceId,
    partnerId,
    title: requireText(input.title, "title", 200),
    details: requireText(input.details, "details", 5000),
    usagePolicy: normalizePartnerBenefitUsagePolicy(input.usagePolicy),
    validFrom,
    expiresAt,
    status: input.status === undefined ? "active" : normalizePartnerBenefitStatus(input.status),
  });
  if (!row) throw new PartnerBenefitAdminError("not_found", "L’avantage n’a pas été créé.");
  return mapBenefitRow(row);
};

export const updateAdminPartnerBenefit = async (
  request: Request,
  partnerIdValue: unknown,
  benefitIdValue: unknown,
  input: UpdatePartnerBenefitInput,
  dependencies?: PartnerBenefitAdminDependencies,
): Promise<AdminPartnerBenefit> => {
  const workspaceId = await requireActiveAdminWorkspace(request);
  const resolved = getDependencies(dependencies);
  const partnerId = await requireActivePartner(partnerIdValue, resolved.getPartners);
  const benefitId = normalizePartnerBenefitUuid(benefitIdValue, "benefitId");
  const has = (field: keyof UpdatePartnerBenefitInput) => Object.prototype.hasOwnProperty.call(input, field);
  if (!["title", "details", "usagePolicy", "validFrom", "expiresAt", "status"].some((field) => has(field as keyof UpdatePartnerBenefitInput))) {
    throw new PartnerBenefitAdminError("validation", "Au moins un champ modifiable est requis.");
  }
  const validFrom = has("validFrom") ? normalizePartnerBenefitDate(input.validFrom, "validFrom") : new Date(0).toISOString();
  const expiresAt = has("expiresAt") ? normalizeOptionalDate(input.expiresAt, "expiresAt") : null;
  if (has("validFrom") && has("expiresAt")) validateDateRange(validFrom, expiresAt);
  const row = await resolved.repository.update({
    workspaceId,
    partnerId,
    benefitId,
    title: { set: has("title"), value: has("title") ? requireText(input.title, "title", 200) : "" },
    details: { set: has("details"), value: has("details") ? requireText(input.details, "details", 5000) : "" },
    usagePolicy: {
      set: has("usagePolicy"),
      value: has("usagePolicy") ? normalizePartnerBenefitUsagePolicy(input.usagePolicy) : "unlimited",
    },
    validFrom: {
      set: has("validFrom"),
      value: validFrom,
    },
    expiresAt: {
      set: has("expiresAt"),
      value: expiresAt,
    },
    status: {
      set: has("status"),
      value: has("status") ? normalizePartnerBenefitStatus(input.status) : "active",
    },
  });
  if (!row) throw new PartnerBenefitAdminError("not_found", "Avantage introuvable ou dates incompatibles.");
  return mapBenefitRow(row);
};

export const deactivateAdminPartnerBenefit = async (
  request: Request,
  partnerIdValue: unknown,
  benefitIdValue: unknown,
  dependencies?: PartnerBenefitAdminDependencies,
): Promise<AdminPartnerBenefit> => {
  const workspaceId = await requireActiveAdminWorkspace(request);
  const resolved = getDependencies(dependencies);
  const partnerId = await requireActivePartner(partnerIdValue, resolved.getPartners);
  const benefitId = normalizePartnerBenefitUuid(benefitIdValue, "benefitId");
  const row = await resolved.repository.deactivate(workspaceId, partnerId, benefitId);
  if (!row) throw new PartnerBenefitAdminError("not_found", "Avantage introuvable.");
  return mapBenefitRow(row);
};