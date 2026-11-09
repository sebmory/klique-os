import { createContentStorageClient, getDefaultWorkspaceId } from "@/lib/content-storage/db";
import { buildCreativeMissionRegularizationPayload } from "@/fixtures/creative-mission-regularization";

export type CreativeMissionRegularizationResult = {
  canonicalRecords: number;
  completedMissions: number;
  closedEntries: number;
  serviceLinks: number;
  productionLinks: number;
  athleteLinks: number;
  events: number;
};

type ResultRow = {
  canonical_records: number;
  completed_missions: number;
  closed_entries: number;
  service_links: number;
  production_links: number;
  athlete_links: number;
  events: number;
};

export const runCreativeMissionRegularization = async ({
  workspaceId = getDefaultWorkspaceId(),
}: {
  workspaceId?: string;
} = {}): Promise<CreativeMissionRegularizationResult> => {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) throw new Error("workspaceId est requis.");

  const sql = createContentStorageClient();
  const payload = buildCreativeMissionRegularizationPayload();
  const expectedServiceCount = payload.records
    .reduce((sum, record) => sum + record.services.length, 0);

  const rows = await sql.query(`
    WITH record_specs AS MATERIALIZED (
      SELECT *
      FROM jsonb_to_recordset(($2::jsonb)->'records') AS record (
        key text,
        "recordKind" text,
        "businessState" text,
        title text,
        "missionType" text,
        "occurredAt" timestamptz,
        "occurredAtSource" text,
        "regularizationStatus" text,
        "regularizationNote" text,
        "historicalCreativeName" text,
        "historicalProfileDisplayName" text,
        athletes jsonb,
        services jsonb,
        productions jsonb
      )
    ),
    expected_services AS MATERIALIZED (
      SELECT record.key, service.*
      FROM record_specs record
      CROSS JOIN LATERAL jsonb_to_recordset(record.services) AS service (
        "requestId" uuid,
        "athleteId" text,
        "productCode" text,
        status text,
        "isAdminRealization" boolean,
        "historicalRealizationAt" text,
        "refusalReason" text
      )
    ),
    validated_services AS MATERIALIZED (
      SELECT expected.key, request.id
      FROM expected_services expected
      JOIN athlete_service_requests request
        ON request.workspace_id = $1
       AND request.id = expected."requestId"
       AND request.athlete_id = expected."athleteId"
       AND request.product_code = expected."productCode"
       AND request.status = expected.status
       AND request.is_admin_membership_realization = expected."isAdminRealization"
       AND request.requested_details->>'historicalRealizationAt'
         IS NOT DISTINCT FROM expected."historicalRealizationAt"
       AND request.refusal_reason IS NOT DISTINCT FROM expected."refusalReason"
      WHERE NOT EXISTS (
        SELECT 1
        FROM athlete_credit_movements reversal
        WHERE reversal.reversal_realization_id = request.id
      )
    ),
    validation_guard AS MATERIALIZED (
      SELECT 1 / CASE
        WHEN (SELECT count(*) FROM expected_services) = $3::integer
         AND (SELECT count(*) FROM validated_services) = $3::integer
         AND (SELECT count(DISTINCT id) FROM validated_services) = $3::integer
        THEN 1 ELSE 0
      END AS ok
    ),
    upserted_missions AS MATERIALIZED (
      INSERT INTO creative_missions (
        workspace_id, record_kind, business_state, title, mission_type,
        occurred_at, occurred_at_source, regularization_status,
        regularization_key, regularization_note, historical_creative_name,
        historical_creative_profile_id, created_by_actor
      )
      SELECT
        $1,
        record."recordKind",
        record."businessState",
        record.title,
        record."missionType",
        record."occurredAt",
        record."occurredAtSource",
        record."regularizationStatus",
        record.key,
        record."regularizationNote",
        record."historicalCreativeName",
        profile.id,
        'system:historical-regularization:v1'
      FROM record_specs record
      CROSS JOIN validation_guard
      LEFT JOIN LATERAL (
        SELECT CASE
          WHEN count(*) = 1 THEN (array_agg(candidate.id ORDER BY candidate.id))[1]
          ELSE NULL
        END AS id
        FROM creative_profiles candidate
        WHERE candidate.workspace_id = $1
          AND candidate.display_name = record."historicalProfileDisplayName"
          AND candidate.status = 'active'
      ) profile ON record."historicalProfileDisplayName" IS NOT NULL
      ON CONFLICT (workspace_id, regularization_key)
        WHERE regularization_key IS NOT NULL
      DO UPDATE SET regularization_key = EXCLUDED.regularization_key
      RETURNING id, regularization_key, business_state, record_kind
    ),
    inserted_athletes AS (
      INSERT INTO creative_mission_athletes (
        workspace_id, mission_id, athlete_id, athlete_name_snapshot
      )
      SELECT
        $1,
        mission.id,
        athlete.id,
        athlete.name
      FROM record_specs record
      JOIN upserted_missions mission
        ON mission.regularization_key = record.key
      CROSS JOIN LATERAL jsonb_to_recordset(record.athletes) AS athlete (
        id text,
        name text
      )
      ON CONFLICT DO NOTHING
      RETURNING mission_id
    ),
    inserted_service_links AS (
      INSERT INTO creative_mission_links (
        workspace_id, mission_id, source_type, relation_type, source_id,
        athlete_service_request_id, source_snapshot
      )
      SELECT
        $1,
        mission.id,
        'athlete_service_request',
        CASE
          WHEN mission.record_kind = 'historical_entry' THEN 'origin'
          ELSE 'service'
        END,
        request.id::text,
        request.id,
        jsonb_build_object(
          'athleteId', request.athlete_id,
          'productCode', request.product_code,
          'productName', product.name,
          'status', request.status,
          'requestedDetails', request.requested_details - 'recordedByClerkUserId',
          'requestedAt', request.requested_at,
          'scheduledAt', request.scheduled_at,
          'startedAt', request.started_at,
          'completedAt', request.completed_at,
          'refusedAt', request.refused_at,
          'refusalReason', request.refusal_reason,
          'isAdminMembershipRealization', request.is_admin_membership_realization
        )
      FROM expected_services expected
      JOIN upserted_missions mission
        ON mission.regularization_key = expected.key
      JOIN athlete_service_requests request
        ON request.workspace_id = $1
       AND request.id = expected."requestId"
      JOIN athlete_service_products product
        ON product.code = request.product_code
      ON CONFLICT DO NOTHING
      RETURNING mission_id
    ),
    inserted_production_links AS (
      INSERT INTO creative_mission_links (
        workspace_id, mission_id, source_type, relation_type, source_id,
        production_source, production_source_row, production_source_fingerprint,
        source_snapshot
      )
      SELECT
        $1,
        mission.id,
        'production_sheet',
        'production',
        production."sourceId",
        production.source,
        production.row,
        production.fingerprint,
        production.snapshot
      FROM record_specs record
      JOIN upserted_missions mission
        ON mission.regularization_key = record.key
      CROSS JOIN LATERAL jsonb_to_recordset(record.productions) AS production (
        source text,
        row integer,
        snapshot jsonb,
        fingerprint text,
        "sourceId" text
      )
      ON CONFLICT DO NOTHING
      RETURNING mission_id
    ),
    inserted_events AS (
      INSERT INTO creative_mission_events (
        workspace_id, mission_id, action, from_state, to_state,
        actor, note, details, idempotency_key
      )
      SELECT
        $1,
        mission.id,
        CASE mission.record_kind
          WHEN 'historical_entry' THEN 'historical_closed_without_action'
          ELSE 'historical_completed'
        END,
        NULL,
        mission.business_state,
        'system:historical-regularization:v1',
        record."regularizationNote",
        jsonb_build_object(
          'regularizationKey', record.key,
          'occurredAtSource', record."occurredAtSource",
          'historicalCreativeName', record."historicalCreativeName"
        ),
        'historical-regularization:v1:' || record.key
      FROM record_specs record
      JOIN upserted_missions mission
        ON mission.regularization_key = record.key
      ON CONFLICT DO NOTHING
      RETURNING mission_id
    )
    SELECT
      (SELECT count(*)::int FROM upserted_missions) AS canonical_records,
      (SELECT count(*)::int FROM upserted_missions
        WHERE record_kind = 'mission' AND business_state = 'completed') AS completed_missions,
      (SELECT count(*)::int FROM upserted_missions
        WHERE record_kind = 'historical_entry') AS closed_entries,
      (SELECT count(*)::int
        FROM creative_mission_links link
        JOIN upserted_missions mission ON mission.id = link.mission_id
        WHERE link.workspace_id = $1
          AND link.source_type = 'athlete_service_request')
        + (SELECT count(*)::int FROM inserted_service_links) AS service_links,
      (SELECT count(*)::int
        FROM creative_mission_links link
        JOIN upserted_missions mission ON mission.id = link.mission_id
        WHERE link.workspace_id = $1
          AND link.source_type = 'production_sheet')
        + (SELECT count(*)::int FROM inserted_production_links) AS production_links,
      (SELECT count(*)::int
        FROM creative_mission_athletes athlete
        JOIN upserted_missions mission ON mission.id = athlete.mission_id
        WHERE athlete.workspace_id = $1)
        + (SELECT count(*)::int FROM inserted_athletes) AS athlete_links,
      (SELECT count(*)::int
        FROM creative_mission_events event
        JOIN upserted_missions mission ON mission.id = event.mission_id
        WHERE event.workspace_id = $1)
        + (SELECT count(*)::int FROM inserted_events) AS events
  `, [
    normalizedWorkspaceId,
    JSON.stringify(payload),
    expectedServiceCount,
  ]) as ResultRow[];

  const result = rows[0];
  if (!result) throw new Error("La régularisation n'a retourné aucun résultat.");
  return {
    canonicalRecords: result.canonical_records,
    completedMissions: result.completed_missions,
    closedEntries: result.closed_entries,
    serviceLinks: result.service_links,
    productionLinks: result.production_links,
    athleteLinks: result.athlete_links,
    events: result.events,
  };
};
