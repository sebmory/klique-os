import { randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type { CreativeType } from "@/types/creative";

export type AssignmentCreativeSummary = {
  id: string;
  displayName: string;
  creativeType: CreativeType;
  area: string;
};

export type AthleteServiceCreativeAssignmentEvent = {
  id: string;
  action: "assigned" | "replaced" | "unassigned";
  previousCreative: AssignmentCreativeSummary | null;
  creative: AssignmentCreativeSummary | null;
  authoredByClerkUserId: string;
  createdAt: string;
};

export type AthleteServiceCreativeAssignment = {
  requestId: string;
  athleteId: string;
  productName: string;
  creative: AssignmentCreativeSummary | null;
  history: AthleteServiceCreativeAssignmentEvent[];
};

export type AthleteServiceCreativeAssignmentResult =
  | { outcome: "changed" | "unchanged"; assignment: AthleteServiceCreativeAssignment }
  | { outcome: "missing_request" | "invalid_creative" | "idempotency_conflict"; assignment: null };

type AssignmentRow = {
  request_id: string;
  athlete_id: string;
  product_name: string;
  creative_id: string | null;
  creative_display_name: string | null;
  creative_type: CreativeType | null;
  creative_coverage_areas: string[] | null;
  creative_city: string | null;
  creative_country: string | null;
  event_id: string | null;
  event_action: AthleteServiceCreativeAssignmentEvent["action"] | null;
  event_author: string | null;
  event_created_at: string | Date | null;
  event_creative_id: string | null;
  event_creative_display_name: string | null;
  event_creative_type: CreativeType | null;
  event_creative_coverage_areas: string[] | null;
  event_creative_city: string | null;
  event_creative_country: string | null;
  previous_creative_id: string | null;
  previous_creative_display_name: string | null;
  previous_creative_type: CreativeType | null;
  previous_creative_coverage_areas: string[] | null;
  previous_creative_city: string | null;
  previous_creative_country: string | null;
};

type ActiveCreativeRow = {
  id: string;
  display_name: string;
  creative_type: CreativeType;
  coverage_areas: string[];
  city: string | null;
  country: string | null;
};

type MutationRow = {
  outcome: AthleteServiceCreativeAssignmentResult["outcome"];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeRequired = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} est requis.`);
  return normalized;
};

const normalizeUuid = (value: string, field: string): string => {
  const normalized = normalizeRequired(value, field).toLowerCase();
  if (!uuidPattern.test(normalized)) throw new Error(`${field} doit être un UUID.`);
  return normalized;
};

const formatArea = (coverageAreas: string[] | null, city: string | null, country: string | null) => {
  const coverage = (coverageAreas ?? []).map((value) => value.trim()).filter(Boolean);
  if (coverage.length > 0) return coverage.join(", ");
  return [city, country].map((value) => value?.trim()).filter(Boolean).join(", ") || "Zone non renseignée";
};

const mapCreative = (
  id: string | null,
  displayName: string | null,
  creativeType: CreativeType | null,
  coverageAreas: string[] | null,
  city: string | null,
  country: string | null,
): AssignmentCreativeSummary | null => {
  if (!id || !displayName || !creativeType) return null;
  return {
    id,
    displayName,
    creativeType,
    area: formatArea(coverageAreas, city, country),
  };
};

const mapAssignments = (rows: AssignmentRow[]): AthleteServiceCreativeAssignment[] => {
  const assignments = new Map<string, AthleteServiceCreativeAssignment>();
  for (const row of rows) {
    let assignment = assignments.get(row.request_id);
    if (!assignment) {
      assignment = {
        requestId: row.request_id,
        athleteId: row.athlete_id,
        productName: row.product_name,
        creative: mapCreative(
          row.creative_id,
          row.creative_display_name,
          row.creative_type,
          row.creative_coverage_areas,
          row.creative_city,
          row.creative_country,
        ),
        history: [],
      };
      assignments.set(row.request_id, assignment);
    }
    if (row.event_id && row.event_action && row.event_author && row.event_created_at) {
      assignment.history.push({
        id: row.event_id,
        action: row.event_action,
        previousCreative: mapCreative(
          row.previous_creative_id,
          row.previous_creative_display_name,
          row.previous_creative_type,
          row.previous_creative_coverage_areas,
          row.previous_creative_city,
          row.previous_creative_country,
        ),
        creative: mapCreative(
          row.event_creative_id,
          row.event_creative_display_name,
          row.event_creative_type,
          row.event_creative_coverage_areas,
          row.event_creative_city,
          row.event_creative_country,
        ),
        authoredByClerkUserId: row.event_author,
        createdAt: new Date(row.event_created_at).toISOString(),
      });
    }
  }
  return [...assignments.values()];
};

export type AthleteServiceCreativeAssignmentRepository = {
  listActiveCreatives: (workspaceId: string) => Promise<AssignmentCreativeSummary[]>;
  listAssignments: (input: {
    workspaceId: string;
    requestId?: string;
    athleteId?: string;
  }) => Promise<AthleteServiceCreativeAssignment[]>;
  change: (input: {
    workspaceId: string;
    requestId: string;
    creativeProfileId: string | null;
    idempotencyKey: string;
    authoredByClerkUserId: string;
  }) => Promise<AthleteServiceCreativeAssignmentResult["outcome"]>;
};

const createRepository = (): AthleteServiceCreativeAssignmentRepository => {
  const sql = createContentStorageClient();
  return {
    async listActiveCreatives(workspaceId) {
      const rows = await sql.query(`
        SELECT id, display_name, creative_type, coverage_areas, city, country
        FROM creative_profiles
        WHERE workspace_id = $1 AND status = 'active'
        ORDER BY lower(display_name), id
      `, [workspaceId]) as ActiveCreativeRow[];
      return rows.map((row) => mapCreative(
        row.id,
        row.display_name,
        row.creative_type,
        row.coverage_areas,
        row.city,
        row.country,
      )!);
    },
    async listAssignments({ workspaceId, requestId, athleteId }) {
      const rows = await sql.query(`
        SELECT request.id AS request_id, request.athlete_id, product.name AS product_name,
               current_creative.id AS creative_id,
               current_creative.display_name AS creative_display_name,
               current_creative.creative_type,
               current_creative.coverage_areas AS creative_coverage_areas,
               current_creative.city AS creative_city,
               current_creative.country AS creative_country,
               event.id AS event_id, event.action AS event_action,
               event.authored_by_clerk_user_id AS event_author,
               event.created_at AS event_created_at,
               event_creative.id AS event_creative_id,
               event_creative.display_name AS event_creative_display_name,
               event_creative.creative_type AS event_creative_type,
               event_creative.coverage_areas AS event_creative_coverage_areas,
               event_creative.city AS event_creative_city,
               event_creative.country AS event_creative_country,
               previous_creative.id AS previous_creative_id,
               previous_creative.display_name AS previous_creative_display_name,
               previous_creative.creative_type AS previous_creative_type,
               previous_creative.coverage_areas AS previous_creative_coverage_areas,
               previous_creative.city AS previous_creative_city,
               previous_creative.country AS previous_creative_country
        FROM athlete_service_requests request
        JOIN athlete_service_products product ON product.code = request.product_code
        LEFT JOIN creative_profiles current_creative
          ON current_creative.workspace_id = request.workspace_id
         AND current_creative.id = request.assigned_creative_profile_id
        LEFT JOIN athlete_service_request_creative_assignment_events event
          ON event.workspace_id = request.workspace_id
         AND event.service_request_id = request.id
        LEFT JOIN creative_profiles event_creative
          ON event_creative.workspace_id = event.workspace_id
         AND event_creative.id = event.creative_profile_id
        LEFT JOIN creative_profiles previous_creative
          ON previous_creative.workspace_id = event.workspace_id
         AND previous_creative.id = event.previous_creative_profile_id
        WHERE request.workspace_id = $1
          AND ($2::uuid IS NULL OR request.id = $2::uuid)
          AND ($3::text IS NULL OR request.athlete_id = $3)
        ORDER BY request.requested_at DESC, request.id, event.created_at DESC, event.id DESC
      `, [workspaceId, requestId ?? null, athleteId ?? null]) as AssignmentRow[];
      return mapAssignments(rows);
    },
    async change(input) {
      const rows = await sql.query(`
        WITH locked_request AS MATERIALIZED (
          SELECT id, assigned_creative_profile_id
          FROM athlete_service_requests
          WHERE workspace_id = $1 AND id = $2::uuid
          FOR UPDATE
        ),
        existing_event AS MATERIALIZED (
          SELECT creative_profile_id
          FROM athlete_service_request_creative_assignment_events
          WHERE workspace_id = $1
            AND service_request_id = $2::uuid
            AND idempotency_key = $4::uuid
        ),
        valid_target AS MATERIALIZED (
          SELECT id
          FROM creative_profiles
          WHERE workspace_id = $1
            AND id = $3::uuid
            AND status = 'active'
        ),
        changed AS (
          UPDATE athlete_service_requests request
          SET assigned_creative_profile_id = $3::uuid, updated_at = NOW()
          FROM locked_request
          WHERE request.workspace_id = $1
            AND request.id = locked_request.id
            AND NOT EXISTS (SELECT 1 FROM existing_event)
            AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM valid_target))
            AND request.assigned_creative_profile_id IS DISTINCT FROM $3::uuid
          RETURNING locked_request.assigned_creative_profile_id AS previous_creative_profile_id
        ),
        inserted_event AS (
          INSERT INTO athlete_service_request_creative_assignment_events (
            id, workspace_id, service_request_id, previous_creative_profile_id,
            creative_profile_id, action, idempotency_key, authored_by_clerk_user_id
          )
          SELECT $6::uuid, $1, $2::uuid, changed.previous_creative_profile_id, $3::uuid,
                 CASE
                   WHEN changed.previous_creative_profile_id IS NULL THEN 'assigned'
                   WHEN $3::uuid IS NULL THEN 'unassigned'
                   ELSE 'replaced'
                 END,
                 $4::uuid, $5
          FROM changed
          RETURNING id
        )
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM inserted_event) THEN 'changed'
          WHEN NOT EXISTS (SELECT 1 FROM locked_request) THEN 'missing_request'
          WHEN EXISTS (SELECT 1 FROM existing_event)
            AND (SELECT creative_profile_id FROM existing_event) IS NOT DISTINCT FROM $3::uuid
            THEN 'unchanged'
          WHEN EXISTS (SELECT 1 FROM existing_event) THEN 'idempotency_conflict'
          WHEN $3::uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM valid_target) THEN 'invalid_creative'
          ELSE 'unchanged'
        END AS outcome
      `, [
        input.workspaceId,
        input.requestId,
        input.creativeProfileId,
        input.idempotencyKey,
        input.authoredByClerkUserId,
        randomUUID(),
      ]) as MutationRow[];
      return rows[0]?.outcome ?? "missing_request";
    },
  };
};

export const listAthleteServiceCreativeAssignments = async ({
  workspaceId,
  requestId,
  athleteId,
  repository = createRepository(),
}: {
  workspaceId: string;
  requestId?: string;
  athleteId?: string;
  repository?: AthleteServiceCreativeAssignmentRepository;
}) => repository.listAssignments({
  workspaceId: normalizeRequired(workspaceId, "workspaceId"),
  ...(requestId ? { requestId: normalizeUuid(requestId, "requestId") } : {}),
  ...(athleteId ? { athleteId: normalizeRequired(athleteId, "athleteId") } : {}),
});

export const listActiveAssignmentCreatives = async ({
  workspaceId,
  repository = createRepository(),
}: {
  workspaceId: string;
  repository?: AthleteServiceCreativeAssignmentRepository;
}) => repository.listActiveCreatives(normalizeRequired(workspaceId, "workspaceId"));

export const changeAthleteServiceCreativeAssignment = async ({
  workspaceId,
  requestId,
  creativeProfileId,
  idempotencyKey,
  authoredByClerkUserId,
  repository = createRepository(),
}: {
  workspaceId: string;
  requestId: string;
  creativeProfileId: string | null;
  idempotencyKey: string;
  authoredByClerkUserId: string;
  repository?: AthleteServiceCreativeAssignmentRepository;
}): Promise<AthleteServiceCreativeAssignmentResult> => {
  const normalized = {
    workspaceId: normalizeRequired(workspaceId, "workspaceId"),
    requestId: normalizeUuid(requestId, "requestId"),
    creativeProfileId: creativeProfileId === null
      ? null
      : normalizeUuid(creativeProfileId, "creativeProfileId"),
    idempotencyKey: normalizeUuid(idempotencyKey, "idempotencyKey"),
    authoredByClerkUserId: normalizeRequired(authoredByClerkUserId, "authoredByClerkUserId"),
  };
  const outcome = await repository.change(normalized);
  if (outcome !== "changed" && outcome !== "unchanged") {
    return { outcome, assignment: null };
  }
  const assignment = (await repository.listAssignments({
    workspaceId: normalized.workspaceId,
    requestId: normalized.requestId,
  }))[0];
  if (!assignment) return { outcome: "missing_request", assignment: null };
  return { outcome, assignment };
};
