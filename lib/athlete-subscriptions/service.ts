import { randomUUID } from "node:crypto";
import {
  ATHLETE_SUBSCRIPTION_FOUNDER_PLAN,
  ATHLETE_SUBSCRIPTION_PLANS,
  type AthleteSubscriptionInternalPlanCode,
  type AthleteSubscriptionPlanCode,
} from "@/lib/athlete-subscription-catalog";
import { createContentStorageClient } from "@/lib/content-storage/db";

export type AthleteSubscriptionStatus = "active" | "expired" | "cancelled";
export type AthleteSubscriptionAssignmentPlanCode =
  | AthleteSubscriptionPlanCode
  | AthleteSubscriptionInternalPlanCode;

export type AthletePlatformAccessStatus =
  | "active"
  | "inactive"
  | "invited"
  | "accepted_without_access"
  | "not_invited";

export type AthletePlatformAccess = {
  status: AthletePlatformAccessStatus;
  email: string | null;
};

export type AthleteSubscription = {
  id: string;
  workspaceId: string;
  athleteId: string;
  planCode: AthleteSubscriptionAssignmentPlanCode;
  status: AthleteSubscriptionStatus;
  startsOn: string;
  endsOn: string;
  isFounder: boolean;
  isComplimentary: boolean;
  priceChf: number;
  discountPercent: number;
  photoSessionsIncluded: number;
  mediaDaysIncluded: number;
  competitionSessionsIncluded: number;
  customContentsIncluded: number;
  createdByClerkUserId: string;
  createdAt: string;
  updatedAt: string;
  platformAccess?: AthletePlatformAccess;
};

export type AssignAthleteSubscriptionInput = {
  workspaceId: string;
  athleteId: string;
  planCode: AthleteSubscriptionAssignmentPlanCode;
  startsOn: string | Date;
  endsOn: string | Date;
  isFounder?: boolean;
  isComplimentary?: boolean;
  createdByClerkUserId: string;
};

export type BulkFounderAssignmentInput = {
  workspaceId: string;
  createdByClerkUserId: string;
  assignments: readonly {
    athleteId: string;
    startsOn: string | Date;
    endsOn: string | Date;
  }[];
};

export type BulkFounderAssignmentResult = {
  created: AthleteSubscription[];
  skipped: Array<{ athleteId: string; reason: "active_subscription" }>;
  errors: Array<{ athleteId: string; message: string }>;
};

export type CancelAthleteSubscriptionInput = {
  workspaceId: string;
  subscriptionId: string;
};

export type AthleteSubscriptionErrorCode = "validation" | "not_found" | "conflict";

export class AthleteSubscriptionError extends Error {
  constructor(
    public readonly code: AthleteSubscriptionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AthleteSubscriptionError";
  }
}

export class AthleteSubscriptionValidationError extends AthleteSubscriptionError {
  constructor(message: string) {
    super("validation", message);
    this.name = "AthleteSubscriptionValidationError";
  }
}

export class AthleteSubscriptionNotFoundError extends AthleteSubscriptionError {
  constructor(message = "Abonnement Athlète introuvable.") {
    super("not_found", message);
    this.name = "AthleteSubscriptionNotFoundError";
  }
}

export class AthleteSubscriptionConflictError extends AthleteSubscriptionError {
  constructor(message = "Un abonnement Athlète actif existe déjà.") {
    super("conflict", message);
    this.name = "AthleteSubscriptionConflictError";
  }
}

type AthleteSubscriptionRow = Record<string, unknown>;

type AthleteSubscriptionCreateRecord = {
  id: string;
  workspaceId: string;
  athleteId: string;
  databasePlanCode: "essentiel" | "impact" | "signature" | "founder";
  startsOn: string;
  endsOn: string;
  isFounder: boolean;
  isComplimentary: boolean;
  priceChf: number;
  discountPercent: number;
  photoSessionsIncluded: number;
  mediaDaysIncluded: number;
  competitionSessionsIncluded: number;
  customContentsIncluded: number;
  createdByClerkUserId: string;
};

export type AthleteSubscriptionRepository = {
  list: (workspaceId: string) => Promise<AthleteSubscriptionRow[]>;
  getActive: (workspaceId: string, athleteId: string) => Promise<AthleteSubscriptionRow | null>;
  create: (record: AthleteSubscriptionCreateRecord) => Promise<AthleteSubscriptionRow>;
  bulkCreateFounder: (
    records: readonly AthleteSubscriptionCreateRecord[],
  ) => Promise<Array<AthleteSubscriptionRow | null>>;
  cancel: (workspaceId: string, subscriptionId: string) => Promise<{
    outcome: "cancelled" | "conflict" | "not_found";
    row: AthleteSubscriptionRow | null;
  }>;
};

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const requireText = (value: unknown, fieldName: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new AthleteSubscriptionValidationError(`${fieldName} est requis.`);
  }
  return normalized;
};

const normalizeDate = (value: unknown, fieldName: string): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AthleteSubscriptionValidationError(`${fieldName} est invalide.`);
    }
    return value.toISOString().slice(0, 10);
  }

  const normalized = requireText(value, fieldName);
  let datePart = normalized;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const inputDate = new Date(normalized);
    if (Number.isNaN(inputDate.getTime())) {
      throw new AthleteSubscriptionValidationError(`${fieldName} est invalide.`);
    }
    datePart = inputDate.toISOString().slice(0, 10);
  }
  const parsed = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== datePart) {
    throw new AthleteSubscriptionValidationError(`${fieldName} est invalide.`);
  }
  return datePart;
};

const normalizeTimestamp = (value: unknown, fieldName: string): string => {
  const parsed = value instanceof Date ? value : new Date(requireText(value, fieldName));
  if (Number.isNaN(parsed.getTime())) {
    throw new AthleteSubscriptionValidationError(`${fieldName} Neon est invalide.`);
  }
  return parsed.toISOString();
};

const normalizeNumber = (value: unknown, fieldName: string): number => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new AthleteSubscriptionValidationError(`${fieldName} Neon est invalide.`);
  }
  return normalized;
};

const requireUuid = (value: unknown, fieldName: string): string => {
  const normalized = requireText(value, fieldName);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new AthleteSubscriptionValidationError(`${fieldName} est invalide.`);
  }
  return normalized;
};

const normalizePlanCode = (value: unknown): AthleteSubscriptionAssignmentPlanCode => {
  const normalized = normalizeText(value);
  const catalogCode = normalized === "essentiel" ? "essential" : normalized;
  if (catalogCode === ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code) {
    return ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code;
  }
  const plan = ATHLETE_SUBSCRIPTION_PLANS.find(({ code }) => code === catalogCode);
  if (!plan) {
    throw new AthleteSubscriptionValidationError("planCode est invalide.");
  }
  return plan.code;
};

const normalizeStatus = (value: unknown): AthleteSubscriptionStatus => {
  const normalized = normalizeText(value);
  if (normalized !== "active" && normalized !== "expired" && normalized !== "cancelled") {
    throw new AthleteSubscriptionValidationError("Statut Neon invalide.");
  }
  return normalized;
};

const mapSubscriptionRow = (row: AthleteSubscriptionRow): AthleteSubscription => {
  const planCode = normalizePlanCode(row.plan_code);
  const status = normalizeStatus(row.status);
  const platformAccessStatus = normalizeText(row.platform_access_status) as AthletePlatformAccessStatus;
  const platformAccess = planCode === "founder" && status === "active"
    ? {
        status: platformAccessStatus || "not_invited",
        email: normalizeText(row.platform_access_email) || null,
      }
    : undefined;

  return {
    id: requireText(row.id, "id"),
    workspaceId: requireText(row.workspace_id, "workspace_id"),
    athleteId: requireText(row.athlete_id, "athlete_id"),
    planCode,
    status,
    startsOn: normalizeDate(row.starts_on, "starts_on"),
    endsOn: normalizeDate(row.ends_on, "ends_on"),
    isFounder: row.is_founder === true,
    isComplimentary: row.is_complimentary === true,
    priceChf: normalizeNumber(row.price_chf, "price_chf"),
    discountPercent: normalizeNumber(row.discount_percent, "discount_percent"),
    photoSessionsIncluded: normalizeNumber(row.photo_sessions_included, "photo_sessions_included"),
    mediaDaysIncluded: normalizeNumber(row.media_days_included, "media_days_included"),
    competitionSessionsIncluded: normalizeNumber(
      row.competition_sessions_included,
      "competition_sessions_included",
    ),
    customContentsIncluded: normalizeNumber(row.custom_contents_included, "custom_contents_included"),
    createdByClerkUserId: requireText(row.created_by_clerk_user_id, "created_by_clerk_user_id"),
    createdAt: normalizeTimestamp(row.created_at, "created_at"),
    updatedAt: normalizeTimestamp(row.updated_at, "updated_at"),
    ...(platformAccess ? { platformAccess } : {}),
  };
};

const toDatabasePlanCode = (
  planCode: AthleteSubscriptionAssignmentPlanCode,
): AthleteSubscriptionCreateRecord["databasePlanCode"] => planCode === "essential" ? "essentiel" : planCode;

const createRepository = (): AthleteSubscriptionRepository => {
  const sql = createContentStorageClient();
  return {
    async list(workspaceId) {
      return await sql`
        SELECT subscription.id, subscription.workspace_id, subscription.athlete_id,
               subscription.plan_code, subscription.status, subscription.starts_on, subscription.ends_on,
               subscription.is_founder, subscription.is_complimentary, subscription.price_chf,
               subscription.discount_percent, subscription.photo_sessions_included,
               subscription.media_days_included, subscription.competition_sessions_included,
               subscription.custom_contents_included, subscription.created_by_clerk_user_id,
               subscription.created_at, subscription.updated_at,
               CASE
                 WHEN subscription.plan_code <> 'founder' OR subscription.status <> 'active' THEN NULL
                 WHEN active_access.email IS NOT NULL THEN 'active'
                 WHEN inactive_access.email IS NOT NULL THEN 'inactive'
                 WHEN invitation.status = 'invited' THEN 'invited'
                 WHEN invitation.status = 'accepted' THEN 'accepted_without_access'
                 ELSE 'not_invited'
               END AS platform_access_status,
               COALESCE(active_access.email, inactive_access.email, invitation.email) AS platform_access_email
        FROM athlete_subscriptions subscription
        LEFT JOIN LATERAL (
          SELECT btrim(access.email) AS email
          FROM user_access access
          WHERE access.workspace_id = subscription.workspace_id
            AND access.athlete_id = subscription.athlete_id
            AND access.role = 'athlete'
            AND access.status = 'active'
          ORDER BY access.updated_at DESC
          LIMIT 1
        ) active_access ON subscription.plan_code = 'founder' AND subscription.status = 'active'
        LEFT JOIN LATERAL (
          SELECT btrim(access.email) AS email
          FROM user_access access
          WHERE access.workspace_id = subscription.workspace_id
            AND access.athlete_id = subscription.athlete_id
            AND access.role = 'athlete'
            AND access.status <> 'active'
          ORDER BY access.updated_at DESC
          LIMIT 1
        ) inactive_access ON subscription.plan_code = 'founder' AND subscription.status = 'active'
        LEFT JOIN athlete_invitations invitation
          ON invitation.workspace_id = subscription.workspace_id
         AND invitation.athlete_id = subscription.athlete_id
         AND subscription.plan_code = 'founder'
         AND subscription.status = 'active'
        WHERE subscription.workspace_id = ${workspaceId}
        ORDER BY subscription.starts_on DESC, subscription.created_at DESC
      ` as AthleteSubscriptionRow[];
    },
    async getActive(workspaceId, athleteId) {
      const rows = await sql`
        SELECT id, workspace_id, athlete_id, plan_code, status, starts_on, ends_on,
               is_founder, is_complimentary, price_chf, discount_percent,
               photo_sessions_included, media_days_included, competition_sessions_included,
               custom_contents_included, created_by_clerk_user_id, created_at, updated_at
        FROM athlete_subscriptions
        WHERE workspace_id = ${workspaceId}
          AND athlete_id = ${athleteId}
          AND status = 'active'
        LIMIT 1
      `;
      return (rows[0] as AthleteSubscriptionRow | undefined) ?? null;
    },
    async create(record) {
      const rows = await sql`
        INSERT INTO athlete_subscriptions (
          id, workspace_id, athlete_id, plan_code, status, starts_on, ends_on,
          is_founder, is_complimentary, price_chf, discount_percent,
          photo_sessions_included, media_days_included, competition_sessions_included,
          custom_contents_included, created_by_clerk_user_id, created_at, updated_at
        ) VALUES (
          ${record.id}::uuid, ${record.workspaceId}, ${record.athleteId}, ${record.databasePlanCode},
          'active', ${record.startsOn}::date, ${record.endsOn}::date,
          ${record.isFounder}, ${record.isComplimentary}, ${record.priceChf}, ${record.discountPercent},
          ${record.photoSessionsIncluded}, ${record.mediaDaysIncluded},
          ${record.competitionSessionsIncluded}, ${record.customContentsIncluded},
          ${record.createdByClerkUserId}, NOW(), NOW()
        )
        RETURNING id, workspace_id, athlete_id, plan_code, status, starts_on, ends_on,
                  is_founder, is_complimentary, price_chf, discount_percent,
                  photo_sessions_included, media_days_included, competition_sessions_included,
                  custom_contents_included, created_by_clerk_user_id, created_at, updated_at
      `;
      return rows[0] as AthleteSubscriptionRow;
    },
    async bulkCreateFounder(records) {
      const queries = records.map((record) => sql`
        INSERT INTO athlete_subscriptions (
          id, workspace_id, athlete_id, plan_code, status, starts_on, ends_on,
          is_founder, is_complimentary, price_chf, discount_percent,
          photo_sessions_included, media_days_included, competition_sessions_included,
          custom_contents_included, created_by_clerk_user_id, created_at, updated_at
        ) VALUES (
          ${record.id}::uuid, ${record.workspaceId}, ${record.athleteId}, 'founder',
          'active', ${record.startsOn}::date, ${record.endsOn}::date,
          TRUE, TRUE, 0, 0, 0, 0, 0, 0,
          ${record.createdByClerkUserId}, NOW(), NOW()
        )
        ON CONFLICT (workspace_id, athlete_id) WHERE status = 'active' DO NOTHING
        RETURNING id, workspace_id, athlete_id, plan_code, status, starts_on, ends_on,
                  is_founder, is_complimentary, price_chf, discount_percent,
                  photo_sessions_included, media_days_included, competition_sessions_included,
                  custom_contents_included, created_by_clerk_user_id, created_at, updated_at
      `);
      const results = await sql.transaction(queries);
      return results.map((rows) => (rows[0] as AthleteSubscriptionRow | undefined) ?? null);
    },
    async cancel(workspaceId, subscriptionId) {
      const rows = await sql`
        WITH candidate AS (
          SELECT id, status
          FROM athlete_subscriptions
          WHERE workspace_id = ${workspaceId}
            AND id = ${subscriptionId}::uuid
          FOR UPDATE
        ), cancelled AS (
          UPDATE athlete_subscriptions subscription
          SET status = 'cancelled', updated_at = NOW()
          FROM candidate
          WHERE subscription.workspace_id = ${workspaceId}
            AND subscription.id = candidate.id
            AND candidate.status = 'active'
          RETURNING subscription.*
        )
        SELECT cancelled.*, 'cancelled' AS transition_outcome
        FROM cancelled
        UNION ALL
        SELECT subscription.*, 'conflict' AS transition_outcome
        FROM athlete_subscriptions subscription
        JOIN candidate ON candidate.id = subscription.id
        WHERE subscription.workspace_id = ${workspaceId}
          AND NOT EXISTS (SELECT 1 FROM cancelled)
        LIMIT 1
      `;
      const row = rows[0] as (AthleteSubscriptionRow & { transition_outcome: string }) | undefined;
      if (!row) return { outcome: "not_found", row: null };
      return {
        outcome: row.transition_outcome === "cancelled" ? "cancelled" : "conflict",
        row,
      };
    },
  };
};

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "23505";

export const listAthleteSubscriptions = async (
  workspaceId: string,
  repository: AthleteSubscriptionRepository = createRepository(),
): Promise<AthleteSubscription[]> => {
  const normalizedWorkspaceId = requireText(workspaceId, "workspaceId");
  return (await repository.list(normalizedWorkspaceId)).map(mapSubscriptionRow);
};

export const getActiveAthleteSubscription = async (
  workspaceId: string,
  athleteId: string,
  repository: AthleteSubscriptionRepository = createRepository(),
): Promise<AthleteSubscription | null> => {
  const normalizedWorkspaceId = requireText(workspaceId, "workspaceId");
  const normalizedAthleteId = requireText(athleteId, "athleteId");
  const row = await repository.getActive(normalizedWorkspaceId, normalizedAthleteId);
  return row ? mapSubscriptionRow(row) : null;
};

export const assignAthleteSubscription = async (
  input: AssignAthleteSubscriptionInput,
  repository: AthleteSubscriptionRepository = createRepository(),
): Promise<AthleteSubscription> => {
  const workspaceId = requireText(input.workspaceId, "workspaceId");
  const athleteId = requireText(input.athleteId, "athleteId");
  const createdByClerkUserId = requireText(input.createdByClerkUserId, "createdByClerkUserId");
  const planCode = normalizePlanCode(input.planCode);
  const startsOn = normalizeDate(input.startsOn, "startsOn");
  const endsOn = normalizeDate(input.endsOn, "endsOn");
  if (endsOn <= startsOn) {
    throw new AthleteSubscriptionValidationError("endsOn doit être postérieure à startsOn.");
  }
  if (input.isFounder !== undefined && typeof input.isFounder !== "boolean") {
    throw new AthleteSubscriptionValidationError("isFounder est invalide.");
  }
  if (input.isComplimentary !== undefined && typeof input.isComplimentary !== "boolean") {
    throw new AthleteSubscriptionValidationError("isComplimentary est invalide.");
  }

  const founderPlan = planCode === ATHLETE_SUBSCRIPTION_FOUNDER_PLAN.code;
  const plan = founderPlan
    ? ATHLETE_SUBSCRIPTION_FOUNDER_PLAN
    : ATHLETE_SUBSCRIPTION_PLANS.find(({ code }) => code === planCode)!;
  const includedProductions = plan.includedProductions;
  const record: AthleteSubscriptionCreateRecord = {
    id: randomUUID(),
    workspaceId,
    athleteId,
    databasePlanCode: toDatabasePlanCode(plan.code),
    startsOn,
    endsOn,
    isFounder: founderPlan ? true : input.isFounder ?? false,
    isComplimentary: founderPlan ? true : input.isComplimentary ?? false,
    priceChf: plan.annualPriceChf,
    discountPercent: plan.aLaCarteDiscountPercent,
    photoSessionsIncluded: includedProductions.filter(({ kind }) => kind === "photo_session").length,
    mediaDaysIncluded: includedProductions.filter(({ kind }) => kind === "media_day").length,
    competitionSessionsIncluded: includedProductions.filter(
      ({ kind }) => kind === "match_or_competition_session",
    ).length,
    customContentsIncluded: plan.customContentCount,
    createdByClerkUserId,
  };

  try {
    return mapSubscriptionRow(await repository.create(record));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AthleteSubscriptionConflictError();
    }
    throw error;
  }
};

export const bulkAssignFounderSubscriptions = async (
  input: BulkFounderAssignmentInput,
  repository: AthleteSubscriptionRepository = createRepository(),
): Promise<BulkFounderAssignmentResult> => {
  const workspaceId = requireText(input.workspaceId, "workspaceId");
  const createdByClerkUserId = requireText(input.createdByClerkUserId, "createdByClerkUserId");
  if (!Array.isArray(input.assignments) || input.assignments.length === 0) {
    throw new AthleteSubscriptionValidationError("Au moins une attribution Founder est requise.");
  }

  const records: AthleteSubscriptionCreateRecord[] = [];
  const errors: BulkFounderAssignmentResult["errors"] = [];
  const seenAthleteIds = new Set<string>();

  for (const assignment of input.assignments) {
    const candidateAthleteId = normalizeText(assignment?.athleteId);
    try {
      const athleteId = requireText(assignment?.athleteId, "athleteId");
      if (seenAthleteIds.has(athleteId)) {
        throw new AthleteSubscriptionValidationError("Cet athlète est présent plusieurs fois dans le lot.");
      }
      seenAthleteIds.add(athleteId);
      const startsOn = normalizeDate(assignment?.startsOn, "startsOn");
      const endsOn = normalizeDate(assignment?.endsOn, "endsOn");
      if (endsOn <= startsOn) {
        throw new AthleteSubscriptionValidationError("endsOn doit être postérieure à startsOn.");
      }
      records.push({
        id: randomUUID(),
        workspaceId,
        athleteId,
        databasePlanCode: "founder",
        startsOn,
        endsOn,
        isFounder: true,
        isComplimentary: true,
        priceChf: 0,
        discountPercent: 0,
        photoSessionsIncluded: 0,
        mediaDaysIncluded: 0,
        competitionSessionsIncluded: 0,
        customContentsIncluded: 0,
        createdByClerkUserId,
      });
    } catch (error) {
      errors.push({
        athleteId: candidateAthleteId,
        message: error instanceof AthleteSubscriptionError ? error.message : "Attribution invalide.",
      });
    }
  }

  if (records.length === 0) return { created: [], skipped: [], errors };

  const rows = await repository.bulkCreateFounder(records);
  const created: AthleteSubscription[] = [];
  const skipped: BulkFounderAssignmentResult["skipped"] = [];
  records.forEach((record, index) => {
    const row = rows[index];
    if (row) created.push(mapSubscriptionRow(row));
    else skipped.push({ athleteId: record.athleteId, reason: "active_subscription" });
  });
  return { created, skipped, errors };
};

export const cancelAthleteSubscription = async (
  input: CancelAthleteSubscriptionInput,
  repository: AthleteSubscriptionRepository = createRepository(),
): Promise<AthleteSubscription> => {
  const workspaceId = requireText(input.workspaceId, "workspaceId");
  const subscriptionId = requireUuid(input.subscriptionId, "subscriptionId");
  const result = await repository.cancel(workspaceId, subscriptionId);
  if (result.outcome === "not_found" || !result.row) {
    throw new AthleteSubscriptionNotFoundError();
  }
  if (result.outcome === "conflict") {
    throw new AthleteSubscriptionConflictError("Seul un abonnement actif peut être annulé.");
  }
  return mapSubscriptionRow(result.row);
};