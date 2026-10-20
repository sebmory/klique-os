import { randomUUID } from "node:crypto";
import type {
  NeonQueryFunction,
  NeonQueryFunctionInTransaction,
  QueryRows,
} from "@neondatabase/serverless";
import { createContentStorageClient } from "@/lib/content-storage/db";
import type {
  AthleteIntroductionDecision,
  AdminIntroductionDetail,
  AdminIntroductionSummary,
  IntroductionActor,
  IntroductionModerationAction,
  IntroductionReportStatus,
  IntroductionRequestState,
} from "@/lib/partner-athlete-introductions/contracts";
import { PARTNER_INTRODUCTION_FLOW_VERSION } from "@/lib/partner-athlete-introductions/domain";

type Sql = NeonQueryFunction<false, false>;
type TransactionSql = NeonQueryFunctionInTransaction<false, false>;
type Row = Record<string, unknown>;

export type IntroductionMutationOutcome =
  | "created"
  | "transitioned"
  | "unchanged"
  | "replay"
  | "forbidden"
  | "ineligible_athlete"
  | "solicitation_disabled"
  | "unresolved_request"
  | "suspended_request"
  | "refusal_cooldown"
  | "historical_request"
  | "already_answered"
  | "suspended"
  | "not_found"
  | "identity_ambiguous"
  | "idempotency_conflict"
  | "conflict";

export type IntroductionMutationResult = {
  outcome: IntroductionMutationOutcome;
  request: IntroductionRequestState | null;
  retryAt: string | null;
};

export type CreateIntroductionRecordInput = {
  actor: IntroductionActor;
  athleteId: string;
  partnerPublicName: string;
  athletePublicName: string;
  reason: string;
  message: string;
  idempotencyKey: string;
  payloadHash: string;
  now: string;
};

export type RespondIntroductionRecordInput = {
  actor: IntroductionActor;
  requestId: string;
  decision: AthleteIntroductionDecision;
  idempotencyKey: string;
  payloadHash: string;
  now: string;
  authorizedInstagram: string | null;
  contactReference: string | null;
};

export type ActivateHistoricalIntroductionInput = {
  actor: IntroductionActor;
  requestId: string;
  partnerPublicName: string;
  athletePublicName: string;
  idempotencyKey: string;
  payloadHash: string;
  now: string;
};

export type ModerateIntroductionRecordInput = {
  actor: IntroductionActor;
  requestId: string;
  action: IntroductionModerationAction;
  reason: string;
  idempotencyKey: string;
  payloadHash: string;
  now: string;
};

export type SetPartnerSolicitationInput = {
  actor: IntroductionActor;
  partnerId: string;
  canSolicit: boolean;
  reason: string;
  idempotencyKey: string;
  payloadHash: string;
  now: string;
};

export type ReportIntroductionInput = {
  actor: IntroductionActor;
  requestId: string;
  reason: string;
  comment: string;
  idempotencyKey: string;
  payloadHash: string;
  now: string;
};

export type HandleIntroductionReportInput = {
  actor: IntroductionActor;
  requestId: string;
  reportId: string;
  status: Exclude<IntroductionReportStatus, "open">;
  note: string;
  idempotencyKey: string;
  payloadHash: string;
  now: string;
};

export type ClaimedOutboxRecord = {
  id: string;
  workspaceId: string;
  eventId: string;
  recipientClerkUserId: string;
  attemptCount: number;
};

export type OutboxDeliveryResult =
  | { outcome: "delivered"; notificationId: string }
  | { outcome: "discarded"; notificationId: null }
  | { outcome: "not_found"; notificationId: null };

export type PartnerIntroductionOutboxDiagnostics = {
  failed: number;
  stalePending: number;
  staleProcessing: number;
};

export type PartnerAthleteIntroductionRepository = {
  create(input: CreateIntroductionRecordInput): Promise<IntroductionMutationResult>;
  activateHistorical(
    input: ActivateHistoricalIntroductionInput,
  ): Promise<IntroductionMutationResult>;
  respond(input: RespondIntroductionRecordInput): Promise<IntroductionMutationResult>;
  moderate(input: ModerateIntroductionRecordInput): Promise<IntroductionMutationResult>;
  setPartnerSolicitation(input: SetPartnerSolicitationInput): Promise<
    "updated" | "replay" | "forbidden" | "idempotency_conflict"
  >;
  getForAthlete(actor: IntroductionActor, requestId: string): Promise<IntroductionRequestState | null>;
  getForPartner(actor: IntroductionActor, requestId: string): Promise<IntroductionRequestState | null>;
  listForAthlete(actor: IntroductionActor): Promise<IntroductionRequestState[]>;
  listForPartner(actor: IntroductionActor): Promise<IntroductionRequestState[]>;
  listForAdmin(input: {
    actor: IntroductionActor;
    status: string | null;
    moderationStatus: string | null;
    staleOnly: boolean;
    reportedOnly: boolean;
    historicalOnly: boolean;
    staleDays: number;
    limit: number;
    offset: number;
    now: string;
  }): Promise<{ items: AdminIntroductionSummary[]; total: number; counters: Record<string, number> }>;
  getForAdmin(actor: IntroductionActor, requestId: string, staleDays: number, now: string): Promise<AdminIntroductionDetail | null>;
  report(input: ReportIntroductionInput): Promise<"created" | "replay" | "duplicate" | "forbidden" | "not_found" | "idempotency_conflict">;
  handleReport(input: HandleIntroductionReportInput): Promise<
    "updated" | "replay" | "forbidden" | "not_found" | "idempotency_conflict" | "conflict"
  >;
  getOutboxDiagnostics(input: {
    staleBefore: string;
  }): Promise<PartnerIntroductionOutboxDiagnostics>;
  claimOutbox(input: {
    workerId: string;
    batchSize: number;
    maxAttempts: number;
    staleLockBefore: string;
    now: string;
  }): Promise<ClaimedOutboxRecord[]>;
  deliverOutbox(input: {
    outboxId: string;
    workerId: string;
    notificationId: string;
    now: string;
  }): Promise<OutboxDeliveryResult>;
  failOutbox(input: {
    outboxId: string;
    workerId: string;
    maxAttempts: number;
    retryAt: string;
    errorCode: string;
    now: string;
  }): Promise<"pending" | "failed" | "not_found">;
};

const normalizeTimestamp = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error("Timestamp PostgreSQL invalide.");
  return parsed.toISOString();
};

const mapRequest = (row: Row): IntroductionRequestState => ({
  id: String(row.id ?? ""),
  workspaceId: String(row.workspace_id ?? ""),
  athleteId: String(row.athlete_id ?? ""),
  partnerId: String(row.partner_id ?? ""),
  requestKind: String(row.request_kind ?? "athlete_contact") as IntroductionRequestState["requestKind"],
  flowVersion: Number(row.flow_version ?? 1),
  status: String(row.status ?? "open") as IntroductionRequestState["status"],
  moderationStatus: String(row.moderation_status ?? "clear") as IntroductionRequestState["moderationStatus"],
  athleteResponseEnabledAt: normalizeTimestamp(row.athlete_response_enabled_at),
  respondedAt: normalizeTimestamp(row.responded_at),
  createdAt: normalizeTimestamp(row.created_at) ?? "",
  reason: String(row.subject ?? ""),
  message: String(row.message ?? ""),
  partnerPublicNameSnapshot: String(row.partner_public_name_snapshot ?? ""),
  athletePublicNameSnapshot: String(row.athlete_public_name_snapshot ?? ""),
  authorizedContactChannel:
    row.authorized_contact_channel === "instagram" ? "instagram" : null,
  authorizedContactValueSnapshot:
    row.authorized_contact_value_snapshot === null
    || row.authorized_contact_value_snapshot === undefined
      ? null
      : String(row.authorized_contact_value_snapshot),
  authorizedContactReference:
    row.authorized_contact_reference === null
    || row.authorized_contact_reference === undefined
      ? null
      : String(row.authorized_contact_reference),
  contactConsentedAt: normalizeTimestamp(row.contact_consented_at),
});

const mapAdminSummary = (row: Row): AdminIntroductionSummary => ({
  id: String(row.id ?? ""),
  partnerId: String(row.partner_id ?? ""),
  athleteId: String(row.athlete_id ?? ""),
  partnerPublicName: String(row.partner_public_name_snapshot ?? ""),
  athletePublicName: String(row.athlete_public_name_snapshot ?? ""),
  historical: Number(row.flow_version ?? 1) < PARTNER_INTRODUCTION_FLOW_VERSION,
  reason: String(row.subject ?? ""),
  status: String(row.status ?? "awaiting_athlete") as AdminIntroductionSummary["status"],
  moderationStatus: String(row.moderation_status ?? "clear") as AdminIntroductionSummary["moderationStatus"],
  createdAt: normalizeTimestamp(row.created_at) ?? "",
  respondedAt: normalizeTimestamp(row.responded_at),
  ageDays: Number(row.age_days ?? 0),
  stale: Boolean(row.stale),
  reported: Boolean(row.reported),
});

const requestColumns = `
  id, workspace_id, athlete_id, partner_id, request_kind, flow_version,
  status, moderation_status, athlete_response_enabled_at, responded_at,
  created_at, subject, message, partner_public_name_snapshot, athlete_public_name_snapshot,
  authorized_contact_channel, authorized_contact_value_snapshot,
  authorized_contact_reference, contact_consented_at
`;

const mapMutation = (rows: QueryRows<false>): IntroductionMutationResult => {
  const row = rows[0] as Row | undefined;
  if (!row) throw new Error("La transaction n’a retourné aucun résultat.");
  return {
    outcome: String(row.outcome ?? "conflict") as IntroductionMutationOutcome,
    request: row.id ? mapRequest(row) : null,
    retryAt: normalizeTimestamp(row.retry_at),
  };
};

const partnerLock = (
  tx: TransactionSql,
  workspaceId: string,
  partnerId: string,
) => tx`
  SELECT pg_advisory_xact_lock(
    hashtextextended(
      'partner-athlete-introduction:partner:' || ${workspaceId} || ':' || ${partnerId},
      0
    )
  )
`;

const pairLock = (
  tx: TransactionSql,
  workspaceId: string,
  partnerId: string,
  athleteId: string,
) => tx`
  SELECT pg_advisory_xact_lock(
    hashtextextended(
      'partner-athlete-introduction:pair:'
        || ${workspaceId} || ':' || ${partnerId} || ':' || ${athleteId},
      0
    )
  )
`;

const requestLock = (
  tx: TransactionSql,
  workspaceId: string,
  requestId: string,
) => tx`
  SELECT id
  FROM contact_requests
  WHERE workspace_id = ${workspaceId}
    AND id = ${requestId}
    AND request_kind = 'partner_athlete_introduction'
  FOR UPDATE
`;

export const createPartnerAthleteIntroductionRepository = (
  sql: Sql = createContentStorageClient(),
): PartnerAthleteIntroductionRepository => ({
  async create(input) {
    const requestId = randomUUID();
    const eventId = randomUUID();
    const outboxId = randomUUID();
    const results = await sql.transaction((tx) => {
      const lockPartner = partnerLock(tx, input.actor.workspaceId, input.actor.partnerId ?? "");
      const lockPair = pairLock(
        tx,
        input.actor.workspaceId,
        input.actor.partnerId ?? "",
        input.athleteId,
      );
      const mutation = tx`
        WITH actor_access AS (
          SELECT 1
          FROM user_access
          WHERE clerk_user_id = ${input.actor.clerkUserId}
            AND workspace_id = ${input.actor.workspaceId}
            AND role = 'partner_expert'
            AND status = 'active'
            AND partner_id = ${input.actor.partnerId}
        ),
        athlete_access AS (
          SELECT clerk_user_id
          FROM user_access
          WHERE workspace_id = ${input.actor.workspaceId}
            AND role = 'athlete'
            AND status = 'active'
            AND athlete_id = ${input.athleteId}
          ORDER BY clerk_user_id
          LIMIT 1
        ),
        solicitation AS (
          SELECT COALESCE(
            (
              SELECT can_solicit
              FROM partner_solicitation_controls
              WHERE workspace_id = ${input.actor.workspaceId}
                AND partner_id = ${input.actor.partnerId}
            ),
            TRUE
          ) AS allowed
        ),
        replay AS (
          SELECT id, creation_payload_hash
          FROM contact_requests
          WHERE workspace_id = ${input.actor.workspaceId}
            AND partner_id = ${input.actor.partnerId}
            AND request_kind = 'partner_athlete_introduction'
            AND creation_idempotency_key = ${input.idempotencyKey}
          LIMIT 1
        ),
        suspended AS (
          SELECT id
          FROM contact_requests
          WHERE workspace_id = ${input.actor.workspaceId}
            AND partner_id = ${input.actor.partnerId}
            AND athlete_id = ${input.athleteId}
            AND request_kind = 'partner_athlete_introduction'
            AND moderation_status = 'suspended'
          LIMIT 1
        ),
        unresolved AS (
          SELECT id
          FROM contact_requests
          WHERE workspace_id = ${input.actor.workspaceId}
            AND partner_id = ${input.actor.partnerId}
            AND athlete_id = ${input.athleteId}
            AND request_kind = 'partner_athlete_introduction'
            AND status IN ('pending', 'awaiting_athlete')
          LIMIT 1
        ),
        latest_decline AS (
          SELECT id, responded_at + INTERVAL '30 days' AS retry_at
          FROM contact_requests
          WHERE workspace_id = ${input.actor.workspaceId}
            AND partner_id = ${input.actor.partnerId}
            AND athlete_id = ${input.athleteId}
            AND request_kind = 'partner_athlete_introduction'
            AND status = 'declined'
          ORDER BY responded_at DESC NULLS FIRST
          LIMIT 1
        ),
        inserted AS (
          INSERT INTO contact_requests (
            id, workspace_id, athlete_id, partner_id, request_kind, category,
            subject, message, status, flow_version, athlete_response_enabled_at,
            partner_public_name_snapshot, athlete_public_name_snapshot,
            moderation_status, creation_idempotency_key, creation_payload_hash,
            created_at, updated_at
          )
          SELECT
            ${requestId}, ${input.actor.workspaceId}, ${input.athleteId},
            ${input.actor.partnerId}, 'partner_athlete_introduction', 'other',
            ${input.reason}, ${input.message}, 'awaiting_athlete',
            ${PARTNER_INTRODUCTION_FLOW_VERSION}, ${input.now}::timestamptz,
            ${input.partnerPublicName}, ${input.athletePublicName}, 'clear',
            ${input.idempotencyKey}, ${input.payloadHash},
            ${input.now}::timestamptz, ${input.now}::timestamptz
          WHERE EXISTS (SELECT 1 FROM actor_access)
            AND EXISTS (SELECT 1 FROM athlete_access)
            AND (SELECT allowed FROM solicitation)
            AND NOT EXISTS (SELECT 1 FROM replay)
            AND NOT EXISTS (SELECT 1 FROM suspended)
            AND NOT EXISTS (SELECT 1 FROM unresolved)
            AND NOT EXISTS (
              SELECT 1
              FROM latest_decline
              WHERE retry_at IS NULL OR retry_at > ${input.now}::timestamptz
            )
          RETURNING *
        ),
        inserted_event AS (
          INSERT INTO partner_athlete_introduction_events (
            id, workspace_id, request_id, event_type, actor_clerk_user_id,
            actor_role, request_status, moderation_status, idempotency_key,
            payload_hash, created_at
          )
          SELECT
            ${eventId}::uuid, workspace_id, id, 'request_created',
            ${input.actor.clerkUserId}, 'partner_expert', status,
            moderation_status, ${input.idempotencyKey}, ${input.payloadHash},
            ${input.now}::timestamptz
          FROM inserted
          RETURNING id, workspace_id
        ),
        inserted_outbox AS (
          INSERT INTO partner_athlete_introduction_notification_outbox (
            id, workspace_id, event_id, recipient_clerk_user_id,
            notification_type, title, body, action_href, created_at, updated_at
          )
          SELECT
            ${outboxId}::uuid, event.workspace_id, event.id,
            athlete.clerk_user_id,
            'partner_athlete_introduction.created',
            'Nouvelle demande de mise en relation',
            'Une demande attend votre réponse.',
            '/athlete/partner-contact-requests/' || ${requestId},
            ${input.now}::timestamptz, ${input.now}::timestamptz
          FROM inserted_event event
          CROSS JOIN athlete_access athlete
          ON CONFLICT (workspace_id, event_id, recipient_clerk_user_id) DO NOTHING
        ),
        outcome AS (
          SELECT CASE
            WHEN NOT EXISTS (SELECT 1 FROM actor_access) THEN 'forbidden'
            WHEN NOT EXISTS (SELECT 1 FROM athlete_access) THEN 'ineligible_athlete'
            WHEN NOT (SELECT allowed FROM solicitation) THEN 'solicitation_disabled'
            WHEN EXISTS (
              SELECT 1 FROM replay
              WHERE creation_payload_hash IS DISTINCT FROM ${input.payloadHash}
            ) THEN 'idempotency_conflict'
            WHEN EXISTS (SELECT 1 FROM replay) THEN 'replay'
            WHEN EXISTS (SELECT 1 FROM suspended) THEN 'suspended_request'
            WHEN EXISTS (SELECT 1 FROM unresolved) THEN 'unresolved_request'
            WHEN EXISTS (
              SELECT 1 FROM latest_decline
              WHERE retry_at IS NULL OR retry_at > ${input.now}::timestamptz
            ) THEN 'refusal_cooldown'
            WHEN EXISTS (SELECT 1 FROM inserted) THEN 'created'
            ELSE 'conflict'
          END AS value
        ),
        selected_request AS (
          SELECT * FROM inserted
          UNION ALL
          SELECT request.*
          FROM replay
          JOIN contact_requests request ON request.id = replay.id
          WHERE replay.creation_payload_hash = ${input.payloadHash}
          LIMIT 1
        )
        SELECT
          outcome.value AS outcome,
          selected_request.*,
          CASE
            WHEN outcome.value = 'refusal_cooldown'
              THEN (SELECT retry_at FROM latest_decline)
            ELSE NULL
          END AS retry_at
        FROM outcome
        LEFT JOIN selected_request ON TRUE
      `;
      return [lockPartner, lockPair, mutation];
    }, { isolationLevel: "ReadCommitted" });
    return mapMutation(results[2]);
  },

  async activateHistorical(input) {
    const eventId = randomUUID();
    const outboxId = randomUUID();
    const results = await sql.transaction((tx) => {
      const lock = requestLock(tx, input.actor.workspaceId, input.requestId);
      const mutation = tx`
        WITH candidate AS (
          SELECT *
          FROM contact_requests
          WHERE workspace_id = ${input.actor.workspaceId}
            AND id = ${input.requestId}
            AND request_kind = 'partner_athlete_introduction'
          LIMIT 1
        ),
        actor_access AS (
          SELECT 1
          FROM user_access
          WHERE clerk_user_id = ${input.actor.clerkUserId}
            AND workspace_id = ${input.actor.workspaceId}
            AND role = 'admin'
            AND status = 'active'
        ),
        partner_access AS (
          SELECT access.clerk_user_id
          FROM candidate request
          JOIN user_access access
            ON access.workspace_id = request.workspace_id
            AND access.partner_id = request.partner_id
          WHERE access.role = 'partner_expert'
            AND access.status = 'active'
        ),
        athlete_access AS (
          SELECT access.clerk_user_id
          FROM candidate request
          JOIN user_access access
            ON access.workspace_id = request.workspace_id
            AND access.athlete_id = request.athlete_id
          WHERE access.role = 'athlete'
            AND access.status = 'active'
        ),
        pair_lock AS (
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              'partner-athlete-introduction:pair:'
                || request.workspace_id || ':' || request.partner_id || ':' || request.athlete_id,
              0
            )
          )
          FROM candidate request
        ),
        solicitation AS (
          SELECT COALESCE(
            (
              SELECT control.can_solicit
              FROM candidate request
              JOIN partner_solicitation_controls control
                ON control.workspace_id = request.workspace_id
                AND control.partner_id = request.partner_id
            ),
            TRUE
          ) AS allowed
        ),
        replay AS (
          SELECT payload_hash
          FROM partner_athlete_introduction_events
          WHERE workspace_id = ${input.actor.workspaceId}
            AND request_id = ${input.requestId}
            AND idempotency_key = ${input.idempotencyKey}
          LIMIT 1
        ),
        incompatible AS (
          SELECT other.id
          FROM candidate request
          JOIN contact_requests other
            ON other.workspace_id = request.workspace_id
            AND other.partner_id = request.partner_id
            AND other.athlete_id = request.athlete_id
            AND other.request_kind = 'partner_athlete_introduction'
            AND other.id <> request.id
            AND other.status IN ('pending', 'awaiting_athlete')
          LIMIT 1
        ),
        transitioned AS (
          UPDATE contact_requests request
          SET
            flow_version = ${PARTNER_INTRODUCTION_FLOW_VERSION},
            status = 'awaiting_athlete',
            athlete_response_enabled_at = ${input.now}::timestamptz,
            partner_public_name_snapshot = ${input.partnerPublicName},
            athlete_public_name_snapshot = ${input.athletePublicName},
            updated_at = ${input.now}::timestamptz
          WHERE request.workspace_id = ${input.actor.workspaceId}
            AND request.id = ${input.requestId}
            AND request.request_kind = 'partner_athlete_introduction'
            AND request.flow_version < ${PARTNER_INTRODUCTION_FLOW_VERSION}
            AND request.status = 'pending'
            AND request.moderation_status = 'clear'
            AND EXISTS (SELECT 1 FROM actor_access)
            AND (SELECT COUNT(*) FROM partner_access) = 1
            AND (SELECT COUNT(*) FROM athlete_access) = 1
            AND EXISTS (SELECT 1 FROM pair_lock)
            AND (SELECT allowed FROM solicitation)
            AND NOT EXISTS (SELECT 1 FROM replay)
            AND NOT EXISTS (SELECT 1 FROM incompatible)
          RETURNING *
        ),
        inserted_event AS (
          INSERT INTO partner_athlete_introduction_events (
            id, workspace_id, request_id, event_type, actor_clerk_user_id,
            actor_role, request_status, moderation_status, idempotency_key,
            payload_hash, created_at
          )
          SELECT
            ${eventId}::uuid, workspace_id, id, 'request_created',
            ${input.actor.clerkUserId}, 'admin', status, moderation_status,
            ${input.idempotencyKey}, ${input.payloadHash}, ${input.now}::timestamptz
          FROM transitioned
          RETURNING id, workspace_id, request_id
        ),
        inserted_outbox AS (
          INSERT INTO partner_athlete_introduction_notification_outbox (
            id, workspace_id, event_id, recipient_clerk_user_id,
            notification_type, title, body, action_href, created_at, updated_at
          )
          SELECT
            ${outboxId}::uuid, event.workspace_id, event.id,
            athlete.clerk_user_id,
            'partner_athlete_introduction.created',
            'Nouvelle demande de mise en relation',
            'Une demande attend votre réponse.',
            '/athlete/partner-contact-requests/' || event.request_id,
            ${input.now}::timestamptz, ${input.now}::timestamptz
          FROM inserted_event event
          CROSS JOIN athlete_access athlete
          ON CONFLICT (workspace_id, event_id, recipient_clerk_user_id) DO NOTHING
        ),
        outcome AS (
          SELECT CASE
            WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_found'
            WHEN NOT EXISTS (SELECT 1 FROM actor_access) THEN 'forbidden'
            WHEN EXISTS (
              SELECT 1 FROM replay
              WHERE payload_hash IS DISTINCT FROM ${input.payloadHash}
            ) THEN 'idempotency_conflict'
            WHEN EXISTS (SELECT 1 FROM replay) THEN 'replay'
            WHEN (SELECT COUNT(*) FROM partner_access) > 1
              OR (SELECT COUNT(*) FROM athlete_access) > 1
              THEN 'identity_ambiguous'
            WHEN NOT EXISTS (SELECT 1 FROM partner_access) THEN 'forbidden'
            WHEN NOT EXISTS (SELECT 1 FROM athlete_access) THEN 'ineligible_athlete'
            WHEN NOT (SELECT allowed FROM solicitation) THEN 'solicitation_disabled'
            WHEN EXISTS (SELECT 1 FROM incompatible) THEN 'unresolved_request'
            WHEN EXISTS (
              SELECT 1 FROM candidate
              WHERE moderation_status = 'suspended'
            ) THEN 'suspended_request'
            WHEN EXISTS (
              SELECT 1 FROM candidate
              WHERE flow_version >= ${PARTNER_INTRODUCTION_FLOW_VERSION}
            ) THEN 'historical_request'
            WHEN EXISTS (
              SELECT 1 FROM candidate
              WHERE status <> 'pending'
            ) THEN 'already_answered'
            WHEN EXISTS (SELECT 1 FROM transitioned) THEN 'transitioned'
            ELSE 'conflict'
          END AS value
        ),
        selected_request AS (
          SELECT * FROM transitioned
          UNION ALL
          SELECT * FROM candidate
          WHERE EXISTS (
            SELECT 1 FROM replay
            WHERE payload_hash = ${input.payloadHash}
          )
          LIMIT 1
        )
        SELECT outcome.value AS outcome, selected_request.*, NULL::timestamptz AS retry_at
        FROM outcome
        LEFT JOIN selected_request ON TRUE
      `;
      return [lock, mutation];
    }, { isolationLevel: "ReadCommitted" });
    return mapMutation(results[1]);
  },

  async respond(input) {
    const eventId = randomUUID();
    const outboxId = randomUUID();
    const nextStatus = input.decision === "accept" ? "accepted" : "declined";
    const eventType = input.decision === "accept" ? "athlete_accepted" : "athlete_declined";
    const notificationType = input.decision === "accept"
      ? "partner_athlete_introduction.accepted"
      : "partner_athlete_introduction.declined";
    const title = input.decision === "accept"
      ? "Demande de mise en relation acceptée"
      : "Demande de mise en relation refusée";
    const body = input.decision === "accept"
      ? "L’athlète a accepté votre demande. Consultez le détail sécurisé."
      : "L’athlète a refusé votre demande.";
    const results = await sql.transaction((tx) => {
      const lock = requestLock(tx, input.actor.workspaceId, input.requestId);
      const mutation = tx`
        WITH candidate AS (
          SELECT *
          FROM contact_requests
          WHERE workspace_id = ${input.actor.workspaceId}
            AND id = ${input.requestId}
            AND request_kind = 'partner_athlete_introduction'
          LIMIT 1
        ),
        actor_access AS (
          SELECT 1
          FROM candidate request
          JOIN user_access access
            ON access.workspace_id = request.workspace_id
            AND access.athlete_id = request.athlete_id
          WHERE access.clerk_user_id = ${input.actor.clerkUserId}
            AND access.role = 'athlete'
            AND access.status = 'active'
        ),
        transitioned AS (
          UPDATE contact_requests request
          SET
            status = ${nextStatus},
            responded_at = ${input.now}::timestamptz,
            responded_by_clerk_user_id = ${input.actor.clerkUserId},
            authorized_contact_channel = ${
              input.decision === "accept" ? "instagram" : null
            },
            authorized_contact_value_snapshot = ${input.authorizedInstagram},
            authorized_contact_reference = ${input.contactReference},
            contact_consented_at = ${
              input.decision === "accept" ? input.now : null
            }::timestamptz,
            response_idempotency_key = ${input.idempotencyKey},
            response_payload_hash = ${input.payloadHash},
            updated_at = ${input.now}::timestamptz
          WHERE request.workspace_id = ${input.actor.workspaceId}
            AND request.id = ${input.requestId}
            AND request.request_kind = 'partner_athlete_introduction'
            AND request.flow_version >= ${PARTNER_INTRODUCTION_FLOW_VERSION}
            AND request.status = 'awaiting_athlete'
            AND request.moderation_status = 'clear'
            AND EXISTS (SELECT 1 FROM actor_access)
          RETURNING *
        ),
        inserted_event AS (
          INSERT INTO partner_athlete_introduction_events (
            id, workspace_id, request_id, event_type, actor_clerk_user_id,
            actor_role, request_status, moderation_status, idempotency_key,
            payload_hash, created_at
          )
          SELECT
            ${eventId}::uuid, workspace_id, id, ${eventType},
            ${input.actor.clerkUserId}, 'athlete', status, moderation_status,
            ${input.idempotencyKey}, ${input.payloadHash},
            ${input.now}::timestamptz
          FROM transitioned
          RETURNING id, workspace_id, request_id
        ),
        inserted_outbox AS (
          INSERT INTO partner_athlete_introduction_notification_outbox (
            id, workspace_id, event_id, recipient_clerk_user_id,
            notification_type, title, body, action_href, created_at, updated_at
          )
          SELECT
            ${outboxId}::uuid, event.workspace_id, event.id,
            access.clerk_user_id, ${notificationType}, ${title}, ${body},
            '/partner/contact-requests/' || event.request_id,
            ${input.now}::timestamptz, ${input.now}::timestamptz
          FROM inserted_event event
          JOIN contact_requests request
            ON request.workspace_id = event.workspace_id
            AND request.id = event.request_id
          JOIN user_access access
            ON access.workspace_id = request.workspace_id
            AND access.partner_id = request.partner_id
            AND access.role = 'partner_expert'
            AND access.status = 'active'
          ON CONFLICT (workspace_id, event_id, recipient_clerk_user_id) DO NOTHING
        ),
        outcome AS (
          SELECT CASE
            WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_found'
            WHEN NOT EXISTS (SELECT 1 FROM actor_access) THEN 'forbidden'
            WHEN EXISTS (
              SELECT 1 FROM candidate
              WHERE response_idempotency_key = ${input.idempotencyKey}
                AND response_payload_hash IS DISTINCT FROM ${input.payloadHash}
            ) THEN 'idempotency_conflict'
            WHEN EXISTS (
              SELECT 1 FROM candidate
              WHERE response_idempotency_key = ${input.idempotencyKey}
                AND response_payload_hash = ${input.payloadHash}
            ) THEN 'replay'
            WHEN EXISTS (
              SELECT 1 FROM candidate
              WHERE flow_version < ${PARTNER_INTRODUCTION_FLOW_VERSION}
                OR status = 'pending'
                OR athlete_response_enabled_at IS NULL
            ) THEN 'historical_request'
            WHEN EXISTS (
              SELECT 1 FROM candidate WHERE moderation_status = 'suspended'
            ) THEN 'suspended'
            WHEN EXISTS (
              SELECT 1 FROM candidate
              WHERE status IN ('accepted', 'declined')
            ) THEN 'already_answered'
            WHEN EXISTS (SELECT 1 FROM transitioned) THEN 'transitioned'
            ELSE 'conflict'
          END AS value
        ),
        selected_request AS (
          SELECT * FROM transitioned
          UNION ALL
          SELECT * FROM candidate
          WHERE EXISTS (
            SELECT 1 FROM candidate
            WHERE response_idempotency_key = ${input.idempotencyKey}
              AND response_payload_hash = ${input.payloadHash}
          )
          LIMIT 1
        )
        SELECT outcome.value AS outcome, selected_request.*, NULL::timestamptz AS retry_at
        FROM outcome
        LEFT JOIN selected_request ON TRUE
      `;
      return [lock, mutation];
    }, { isolationLevel: "ReadCommitted" });
    return mapMutation(results[1]);
  },

  async moderate(input) {
    const eventId = randomUUID();
    const targetModeration = input.action === "suspend" ? "suspended" : "clear";
    const eventType = input.action === "suspend"
      ? "moderation_suspended"
      : "moderation_reactivated";
    const notificationType = input.action === "suspend"
      ? "partner_athlete_introduction.suspended"
      : "partner_athlete_introduction.reactivated";
    const title = input.action === "suspend"
      ? "Demande de mise en relation suspendue"
      : "Demande de mise en relation réactivée";
    const body = input.action === "suspend"
      ? "Cette demande a été suspendue par KLIQUE."
      : "Cette demande a été réactivée par KLIQUE.";
    const results = await sql.transaction((tx) => {
      const lock = requestLock(tx, input.actor.workspaceId, input.requestId);
      const mutation = tx`
        WITH candidate AS (
          SELECT *
          FROM contact_requests
          WHERE workspace_id = ${input.actor.workspaceId}
            AND id = ${input.requestId}
            AND request_kind = 'partner_athlete_introduction'
            AND flow_version >= ${PARTNER_INTRODUCTION_FLOW_VERSION}
          LIMIT 1
        ),
        actor_access AS (
          SELECT 1
          FROM user_access
          WHERE clerk_user_id = ${input.actor.clerkUserId}
            AND workspace_id = ${input.actor.workspaceId}
            AND role = 'admin'
            AND status = 'active'
        ),
        replay AS (
          SELECT payload_hash
          FROM partner_athlete_introduction_events
          WHERE workspace_id = ${input.actor.workspaceId}
            AND request_id = ${input.requestId}
            AND idempotency_key = ${input.idempotencyKey}
          LIMIT 1
        ),
        transitioned AS (
          UPDATE contact_requests request
          SET
            moderation_status = ${targetModeration},
            moderated_at = ${input.now}::timestamptz,
            moderated_by_clerk_user_id = ${input.actor.clerkUserId},
            moderation_reason = ${input.reason},
            updated_at = ${input.now}::timestamptz
          WHERE request.workspace_id = ${input.actor.workspaceId}
            AND request.id = ${input.requestId}
            AND request.request_kind = 'partner_athlete_introduction'
            AND request.moderation_status <> ${targetModeration}
            AND EXISTS (SELECT 1 FROM actor_access)
            AND NOT EXISTS (SELECT 1 FROM replay)
          RETURNING *
        ),
        inserted_event AS (
          INSERT INTO partner_athlete_introduction_events (
            id, workspace_id, request_id, event_type, actor_clerk_user_id,
            actor_role, request_status, moderation_status, idempotency_key,
            payload_hash, created_at
          )
          SELECT
            ${eventId}::uuid, workspace_id, id, ${eventType},
            ${input.actor.clerkUserId}, 'admin', status, moderation_status,
            ${input.idempotencyKey}, ${input.payloadHash},
            ${input.now}::timestamptz
          FROM transitioned
          RETURNING id, workspace_id, request_id
        ),
        recipients AS (
          SELECT DISTINCT access.clerk_user_id
          FROM inserted_event event
          JOIN contact_requests request
            ON request.workspace_id = event.workspace_id
            AND request.id = event.request_id
          JOIN user_access access
            ON access.workspace_id = request.workspace_id
            AND access.status = 'active'
            AND (
              (access.role = 'athlete' AND access.athlete_id = request.athlete_id)
              OR (
                access.role = 'partner_expert'
                AND access.partner_id = request.partner_id
              )
            )
        ),
        inserted_outbox AS (
          INSERT INTO partner_athlete_introduction_notification_outbox (
            id, workspace_id, event_id, recipient_clerk_user_id,
            notification_type, title, body, action_href, created_at, updated_at
          )
          SELECT
            gen_random_uuid(), event.workspace_id, event.id,
            recipient.clerk_user_id, ${notificationType}, ${title}, ${body},
            CASE
              WHEN access.role = 'athlete'
                THEN '/athlete/partner-contact-requests/' || event.request_id
              ELSE '/partner/contact-requests/' || event.request_id
            END,
            ${input.now}::timestamptz, ${input.now}::timestamptz
          FROM inserted_event event
          CROSS JOIN recipients recipient
          JOIN user_access access
            ON access.clerk_user_id = recipient.clerk_user_id
            AND access.workspace_id = event.workspace_id
          ON CONFLICT (workspace_id, event_id, recipient_clerk_user_id) DO NOTHING
        ),
        outcome AS (
          SELECT CASE
            WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_found'
            WHEN NOT EXISTS (SELECT 1 FROM actor_access) THEN 'forbidden'
            WHEN EXISTS (
              SELECT 1 FROM replay
              WHERE payload_hash IS DISTINCT FROM ${input.payloadHash}
            ) THEN 'idempotency_conflict'
            WHEN EXISTS (SELECT 1 FROM replay) THEN 'replay'
            WHEN EXISTS (
              SELECT 1 FROM candidate
              WHERE moderation_status = ${targetModeration}
            ) THEN 'unchanged'
            WHEN EXISTS (SELECT 1 FROM transitioned) THEN 'transitioned'
            ELSE 'conflict'
          END AS value
        ),
        selected_request AS (
          SELECT * FROM transitioned
          UNION ALL
          SELECT * FROM candidate
          WHERE EXISTS (SELECT 1 FROM replay)
             OR moderation_status = ${targetModeration}
          LIMIT 1
        )
        SELECT outcome.value AS outcome, selected_request.*, NULL::timestamptz AS retry_at
        FROM outcome
        LEFT JOIN selected_request ON TRUE
      `;
      return [lock, mutation];
    }, { isolationLevel: "ReadCommitted" });
    return mapMutation(results[1]);
  },

  async setPartnerSolicitation(input) {
    const eventId = randomUUID();
    const results = await sql.transaction((tx) => {
      const lock = partnerLock(tx, input.actor.workspaceId, input.partnerId);
      const update = tx`
        WITH actor_access AS (
          SELECT 1
          FROM user_access
          WHERE clerk_user_id = ${input.actor.clerkUserId}
            AND workspace_id = ${input.actor.workspaceId}
            AND role = 'admin'
            AND status = 'active'
        ),
        replay AS (
          SELECT payload_hash
          FROM partner_solicitation_control_events
          WHERE workspace_id = ${input.actor.workspaceId}
            AND partner_id = ${input.partnerId}
            AND idempotency_key = ${input.idempotencyKey}
          LIMIT 1
        ),
        upserted AS (
          INSERT INTO partner_solicitation_controls (
            workspace_id, partner_id, can_solicit, disabled_at,
            disabled_by_clerk_user_id, disabled_reason, created_at, updated_at
          )
          SELECT
            ${input.actor.workspaceId}, ${input.partnerId}, ${input.canSolicit},
            CASE WHEN ${input.canSolicit} THEN NULL ELSE ${input.now}::timestamptz END,
            CASE WHEN ${input.canSolicit} THEN NULL ELSE ${input.actor.clerkUserId} END,
            CASE WHEN ${input.canSolicit} THEN NULL ELSE ${input.reason} END,
            ${input.now}::timestamptz, ${input.now}::timestamptz
          WHERE EXISTS (SELECT 1 FROM actor_access)
            AND NOT EXISTS (SELECT 1 FROM replay)
          ON CONFLICT (workspace_id, partner_id) DO UPDATE SET
            can_solicit = EXCLUDED.can_solicit,
            disabled_at = EXCLUDED.disabled_at,
            disabled_by_clerk_user_id = EXCLUDED.disabled_by_clerk_user_id,
            disabled_reason = EXCLUDED.disabled_reason,
            updated_at = EXCLUDED.updated_at
          RETURNING 1
        ),
        inserted_event AS (
          INSERT INTO partner_solicitation_control_events (
            id, workspace_id, partner_id, can_solicit, reason,
            actor_clerk_user_id, idempotency_key, payload_hash, created_at
          )
          SELECT ${eventId}::uuid, ${input.actor.workspaceId}, ${input.partnerId},
                 ${input.canSolicit}, ${input.reason}, ${input.actor.clerkUserId},
                 ${input.idempotencyKey}, ${input.payloadHash}, ${input.now}::timestamptz
          WHERE EXISTS (SELECT 1 FROM upserted)
        )
        SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM actor_access) THEN 'forbidden'
          WHEN EXISTS (
            SELECT 1 FROM replay
            WHERE payload_hash IS DISTINCT FROM ${input.payloadHash}
          ) THEN 'idempotency_conflict'
          WHEN EXISTS (SELECT 1 FROM replay) THEN 'replay'
          WHEN EXISTS (SELECT 1 FROM upserted) THEN 'updated'
          ELSE 'forbidden'
        END AS outcome
      `;
      return [lock, update];
    }, { isolationLevel: "ReadCommitted" });
    return String(results[1][0]?.outcome) as Awaited<
      ReturnType<PartnerAthleteIntroductionRepository["setPartnerSolicitation"]>
    >;
  },

  async getForAthlete(actor, requestId) {
    const rows = await sql.query(
      `
        SELECT ${requestColumns.replace(/\b([a-z_]+)\b/g, "request.$1")}
        FROM contact_requests request
        JOIN user_access access
          ON access.workspace_id = request.workspace_id
          AND access.athlete_id = request.athlete_id
        WHERE request.workspace_id = $1
          AND request.id = $2
          AND request.request_kind = 'partner_athlete_introduction'
          AND access.clerk_user_id = $3
          AND access.role = 'athlete'
          AND access.status = 'active'
        LIMIT 1
      `,
      [actor.workspaceId, requestId, actor.clerkUserId],
    );
    return rows[0] ? mapRequest(rows[0] as Row) : null;
  },

  async getForPartner(actor, requestId) {
    const rows = await sql.query(
      `
        SELECT ${requestColumns.replace(/\b([a-z_]+)\b/g, "request.$1")}
        FROM contact_requests request
        JOIN user_access access
          ON access.workspace_id = request.workspace_id
          AND access.partner_id = request.partner_id
        WHERE request.workspace_id = $1
          AND request.id = $2
          AND request.request_kind = 'partner_athlete_introduction'
          AND access.clerk_user_id = $3
          AND access.role = 'partner_expert'
          AND access.status = 'active'
        LIMIT 1
      `,
      [actor.workspaceId, requestId, actor.clerkUserId],
    );
    return rows[0] ? mapRequest(rows[0] as Row) : null;
  },

  async listForAthlete(actor) {
    const rows = await sql.query(
      `
        SELECT ${requestColumns.replace(/\b([a-z_]+)\b/g, "request.$1")}
        FROM contact_requests request
        JOIN user_access access
          ON access.workspace_id = request.workspace_id
          AND access.athlete_id = request.athlete_id
        WHERE request.workspace_id = $1
          AND request.request_kind = 'partner_athlete_introduction'
          AND request.flow_version >= $2
          AND request.athlete_response_enabled_at IS NOT NULL
          AND access.clerk_user_id = $3
          AND access.role = 'athlete'
          AND access.status = 'active'
        ORDER BY request.created_at DESC
      `,
      [actor.workspaceId, PARTNER_INTRODUCTION_FLOW_VERSION, actor.clerkUserId],
    );
    return rows.map((row) => mapRequest(row as Row));
  },

  async listForPartner(actor) {
    const rows = await sql.query(
      `
        SELECT ${requestColumns.replace(/\b([a-z_]+)\b/g, "request.$1")}
        FROM contact_requests request
        JOIN user_access access
          ON access.workspace_id = request.workspace_id
          AND access.partner_id = request.partner_id
        WHERE request.workspace_id = $1
          AND request.request_kind = 'partner_athlete_introduction'
          AND access.clerk_user_id = $2
          AND access.role = 'partner_expert'
          AND access.status = 'active'
        ORDER BY request.created_at DESC
      `,
      [actor.workspaceId, actor.clerkUserId],
    );
    return rows.map((row) => mapRequest(row as Row));
  },

  async listForAdmin(input) {
    const rows = await sql.query(
      `
        WITH admin_access AS (
          SELECT 1
          FROM user_access
          WHERE clerk_user_id = $1
            AND workspace_id = $2
            AND role = 'admin'
            AND status = 'active'
        ),
        scoped AS (
          SELECT
            request.id, request.partner_id, request.athlete_id,
            request.partner_public_name_snapshot, request.athlete_public_name_snapshot,
            request.flow_version, request.subject, request.status, request.moderation_status,
            request.created_at, request.responded_at,
            GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ($10::timestamptz - request.created_at)) / 86400))::int AS age_days,
            (
              request.flow_version >= $3
              AND request.status = 'awaiting_athlete'
              AND request.athlete_response_enabled_at <= $10::timestamptz - ($7 * interval '1 day')
            ) AS stale,
            EXISTS (
              SELECT 1
              FROM partner_athlete_introduction_reports report
              WHERE report.workspace_id = request.workspace_id
                AND report.request_id = request.id
                AND report.status IN ('open', 'reviewing')
            ) AS reported
          FROM contact_requests request
          WHERE request.workspace_id = $2
            AND request.request_kind = 'partner_athlete_introduction'
            AND (
              request.flow_version < $3
              OR (
                request.flow_version >= $3
                AND request.athlete_response_enabled_at IS NOT NULL
              )
            )
            AND EXISTS (SELECT 1 FROM admin_access)
        )
        SELECT *, COUNT(*) OVER()::int AS total_count
        FROM scoped
        WHERE ($4::text IS NULL OR status = $4)
          AND ($5::text IS NULL OR moderation_status = $5)
          AND (NOT $6::boolean OR stale)
          AND (NOT $8::boolean OR reported)
          AND (NOT $12::boolean OR flow_version < $3)
        ORDER BY created_at DESC
        LIMIT $9 OFFSET $11
      `,
      [
        input.actor.clerkUserId,
        input.actor.workspaceId,
        PARTNER_INTRODUCTION_FLOW_VERSION,
        input.status,
        input.moderationStatus,
        input.staleOnly,
        input.staleDays,
        input.reportedOnly,
        input.limit,
        input.now,
        input.offset,
        input.historicalOnly,
      ],
    );
    const countersRows = await sql.query(
      `
        WITH admin_access AS (
          SELECT 1 FROM user_access
          WHERE clerk_user_id = $1 AND workspace_id = $2
            AND role = 'admin' AND status = 'active'
        ),
        scoped AS (
          SELECT
            request.flow_version, request.status, request.moderation_status,
            request.created_at, request.athlete_response_enabled_at,
            EXISTS (
              SELECT 1 FROM partner_athlete_introduction_reports report
              WHERE report.workspace_id = request.workspace_id
                AND report.request_id = request.id
                AND report.status IN ('open', 'reviewing')
            ) AS reported
          FROM contact_requests request
          WHERE request.workspace_id = $2
            AND request.request_kind = 'partner_athlete_introduction'
            AND (
              request.flow_version < $3
              OR (
                request.flow_version >= $3
                AND request.athlete_response_enabled_at IS NOT NULL
              )
            )
            AND EXISTS (SELECT 1 FROM admin_access)
        )
        SELECT
          COUNT(*) FILTER (
            WHERE flow_version >= $3 AND status = 'awaiting_athlete'
          )::int AS awaiting,
          COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
          COUNT(*) FILTER (WHERE status = 'declined')::int AS declined,
          COUNT(*) FILTER (
            WHERE flow_version >= $3
              AND status = 'awaiting_athlete'
              AND athlete_response_enabled_at <= $4::timestamptz - ($5 * interval '1 day')
          )::int AS stale,
          COUNT(*) FILTER (WHERE flow_version < $3)::int AS historical,
          COUNT(*) FILTER (WHERE reported)::int AS reported,
          COUNT(*) FILTER (WHERE moderation_status = 'suspended')::int AS suspended
        FROM scoped
      `,
      [
        input.actor.clerkUserId,
        input.actor.workspaceId,
        PARTNER_INTRODUCTION_FLOW_VERSION,
        input.now,
        input.staleDays,
      ],
    );
    const counters = countersRows[0] as Row | undefined;
    return {
      items: rows.map((row) => mapAdminSummary(row as Row)),
      total: Number((rows[0] as Row | undefined)?.total_count ?? 0),
      counters: {
        awaiting: Number(counters?.awaiting ?? 0),
        accepted: Number(counters?.accepted ?? 0),
        declined: Number(counters?.declined ?? 0),
        stale: Number(counters?.stale ?? 0),
        historical: Number(counters?.historical ?? 0),
        reported: Number(counters?.reported ?? 0),
        suspended: Number(counters?.suspended ?? 0),
      },
    };
  },

  async getForAdmin(actor, requestId, staleDays, now) {
    const requestRows = await sql.query(
      `
        SELECT
          request.id, request.partner_id, request.athlete_id,
          request.partner_public_name_snapshot, request.athlete_public_name_snapshot,
          request.flow_version, request.subject, request.message, request.status, request.moderation_status,
          request.created_at, request.responded_at,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ($4::timestamptz - request.created_at)) / 86400))::int AS age_days,
          (
            request.flow_version >= $6
            AND request.status = 'awaiting_athlete'
            AND request.athlete_response_enabled_at <= $4::timestamptz - ($5 * interval '1 day')
          ) AS stale,
          EXISTS (
            SELECT 1 FROM partner_athlete_introduction_reports report
            WHERE report.workspace_id = request.workspace_id
              AND report.request_id = request.id
              AND report.status IN ('open', 'reviewing')
          ) AS reported,
          COALESCE(control.can_solicit, TRUE) AS solicitation_allowed
        FROM contact_requests request
        LEFT JOIN partner_solicitation_controls control
          ON control.workspace_id = request.workspace_id
          AND control.partner_id = request.partner_id
        WHERE request.workspace_id = $2
          AND request.id = $3
          AND request.request_kind = 'partner_athlete_introduction'
          AND (
            request.flow_version < $6
            OR (
              request.flow_version >= $6
              AND request.athlete_response_enabled_at IS NOT NULL
            )
          )
          AND EXISTS (
            SELECT 1 FROM user_access
            WHERE clerk_user_id = $1 AND workspace_id = $2
              AND role = 'admin' AND status = 'active'
          )
        LIMIT 1
      `,
      [actor.clerkUserId, actor.workspaceId, requestId, now, staleDays, PARTNER_INTRODUCTION_FLOW_VERSION],
    );
    const row = requestRows[0] as Row | undefined;
    if (!row) return null;
    const [eventRows, reportRows, solicitationRows] = await Promise.all([
      sql.query(
        `
          SELECT event.id, event.event_type, event.actor_role, event.request_status,
                 event.moderation_status, event.created_at
          FROM partner_athlete_introduction_events event
          WHERE event.workspace_id = $2 AND event.request_id = $3
            AND EXISTS (
              SELECT 1 FROM user_access
              WHERE clerk_user_id = $1 AND workspace_id = $2
                AND role = 'admin' AND status = 'active'
            )
          ORDER BY event.created_at ASC
        `,
        [actor.clerkUserId, actor.workspaceId, requestId],
      ),
      sql.query(
        `
          SELECT event.id, event.can_solicit, event.reason, event.created_at
          FROM partner_solicitation_control_events event
          WHERE event.workspace_id = $2
            AND event.partner_id = $3
            AND EXISTS (
              SELECT 1 FROM user_access
              WHERE clerk_user_id = $1 AND workspace_id = $2
                AND role = 'admin' AND status = 'active'
            )
          ORDER BY event.created_at DESC
        `,
        [actor.clerkUserId, actor.workspaceId, String(row.partner_id ?? "")],
      ),
      sql.query(
        `
          SELECT report.id, report.reason, report.comment, report.status,
                 report.reported_at, report.handled_at, report.handling_note
          FROM partner_athlete_introduction_reports report
          WHERE report.workspace_id = $2 AND report.request_id = $3
            AND EXISTS (
              SELECT 1 FROM user_access
              WHERE clerk_user_id = $1 AND workspace_id = $2
                AND role = 'admin' AND status = 'active'
            )
          ORDER BY report.reported_at DESC
        `,
        [actor.clerkUserId, actor.workspaceId, requestId],
      ),
    ]);
    return {
      ...mapAdminSummary(row),
      message: String(row.message ?? ""),
      solicitationAllowed: Boolean(row.solicitation_allowed),
      events: eventRows.map((event) => ({
        id: String(event.id ?? ""),
        eventType: String(event.event_type ?? "") as AdminIntroductionDetail["events"][number]["eventType"],
        actorRole: String(event.actor_role ?? "") as AdminIntroductionDetail["events"][number]["actorRole"],
        requestStatus: String(event.request_status ?? "") as AdminIntroductionDetail["events"][number]["requestStatus"],
        moderationStatus: String(event.moderation_status ?? "") as AdminIntroductionDetail["events"][number]["moderationStatus"],
        occurredAt: normalizeTimestamp(event.created_at) ?? "",
      })),
      reports: reportRows.map((report) => ({
        id: String(report.id ?? ""),
        reason: String(report.reason ?? ""),
        comment: String(report.comment ?? ""),
        status: String(report.status ?? "open") as AdminIntroductionDetail["reports"][number]["status"],
        reportedAt: normalizeTimestamp(report.reported_at) ?? "",
        handledAt: normalizeTimestamp(report.handled_at),
        handlingNote: String(report.handling_note ?? ""),
      })),
      solicitationEvents: solicitationRows.map((event) => ({
        id: String(event.id ?? ""),
        canSolicit: Boolean(event.can_solicit),
        reason: String(event.reason ?? ""),
        occurredAt: normalizeTimestamp(event.created_at) ?? "",
      })),
    };
  },

  async report(input) {
    const reportId = randomUUID();
    const eventId = randomUUID();
    const results = await sql.transaction((tx) => {
      const lock = requestLock(tx, input.actor.workspaceId, input.requestId);
      const mutation = tx`
        WITH candidate AS (
          SELECT * FROM contact_requests
          WHERE workspace_id = ${input.actor.workspaceId}
            AND id = ${input.requestId}
            AND request_kind = 'partner_athlete_introduction'
            AND flow_version >= ${PARTNER_INTRODUCTION_FLOW_VERSION}
            AND athlete_response_enabled_at IS NOT NULL
          LIMIT 1
        ),
        actor_access AS (
          SELECT 1 FROM user_access access
          JOIN candidate request
            ON request.workspace_id = access.workspace_id
            AND request.athlete_id = access.athlete_id
          WHERE access.clerk_user_id = ${input.actor.clerkUserId}
            AND access.role = 'athlete' AND access.status = 'active'
        ),
        replay AS (
          SELECT payload_hash FROM partner_athlete_introduction_events
          WHERE workspace_id = ${input.actor.workspaceId}
            AND request_id = ${input.requestId}
            AND idempotency_key = ${input.idempotencyKey}
          LIMIT 1
        ),
        existing_open AS (
          SELECT 1 FROM partner_athlete_introduction_reports
          WHERE workspace_id = ${input.actor.workspaceId}
            AND request_id = ${input.requestId}
            AND athlete_id = (SELECT athlete_id FROM candidate)
            AND status IN ('open', 'reviewing')
          LIMIT 1
        ),
        inserted_report AS (
          INSERT INTO partner_athlete_introduction_reports (
            id, workspace_id, request_id, reported_by_clerk_user_id,
            athlete_id, reason, comment, status, reported_at
          )
          SELECT ${reportId}::uuid, workspace_id, id, ${input.actor.clerkUserId},
                 athlete_id, ${input.reason}, ${input.comment}, 'open',
                 ${input.now}::timestamptz
          FROM candidate
          WHERE EXISTS (SELECT 1 FROM actor_access)
            AND NOT EXISTS (SELECT 1 FROM replay)
            AND NOT EXISTS (SELECT 1 FROM existing_open)
          RETURNING request_id
        ),
        inserted_event AS (
          INSERT INTO partner_athlete_introduction_events (
            id, workspace_id, request_id, event_type, actor_clerk_user_id,
            actor_role, request_status, moderation_status, idempotency_key,
            payload_hash, created_at
          )
          SELECT ${eventId}::uuid, request.workspace_id, request.id,
                 'athlete_reported', ${input.actor.clerkUserId}, 'athlete',
                 request.status, request.moderation_status,
                 ${input.idempotencyKey}, ${input.payloadHash}, ${input.now}::timestamptz
          FROM candidate request
          WHERE EXISTS (SELECT 1 FROM inserted_report)
        )
        SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_found'
          WHEN NOT EXISTS (SELECT 1 FROM actor_access) THEN 'forbidden'
          WHEN EXISTS (SELECT 1 FROM replay WHERE payload_hash IS DISTINCT FROM ${input.payloadHash})
            THEN 'idempotency_conflict'
          WHEN EXISTS (SELECT 1 FROM replay) THEN 'replay'
          WHEN EXISTS (SELECT 1 FROM existing_open) THEN 'duplicate'
          WHEN EXISTS (SELECT 1 FROM inserted_report) THEN 'created'
          ELSE 'forbidden'
        END AS outcome
      `;
      return [lock, mutation];
    }, { isolationLevel: "ReadCommitted" });
    return String(results[1][0]?.outcome) as Awaited<ReturnType<PartnerAthleteIntroductionRepository["report"]>>;
  },

  async handleReport(input) {
    const eventId = randomUUID();
    const eventType = `report_${input.status}`;
    const results = await sql.transaction((tx) => {
      const lock = requestLock(tx, input.actor.workspaceId, input.requestId);
      const mutation = tx`
        WITH candidate AS (
          SELECT report.*, request.status AS request_status,
                 request.moderation_status AS request_moderation_status
          FROM partner_athlete_introduction_reports report
          JOIN contact_requests request
            ON request.workspace_id = report.workspace_id
            AND request.id = report.request_id
          WHERE report.workspace_id = ${input.actor.workspaceId}
            AND report.request_id = ${input.requestId}
            AND report.id = ${input.reportId}::uuid
          LIMIT 1
        ),
        actor_access AS (
          SELECT 1 FROM user_access
          WHERE clerk_user_id = ${input.actor.clerkUserId}
            AND workspace_id = ${input.actor.workspaceId}
            AND role = 'admin' AND status = 'active'
        ),
        replay AS (
          SELECT payload_hash FROM partner_athlete_introduction_events
          WHERE workspace_id = ${input.actor.workspaceId}
            AND request_id = ${input.requestId}
            AND idempotency_key = ${input.idempotencyKey}
          LIMIT 1
        ),
        updated AS (
          UPDATE partner_athlete_introduction_reports report
          SET status = ${input.status},
              handled_at = CASE WHEN ${input.status} = 'reviewing' THEN NULL ELSE ${input.now}::timestamptz END,
              handled_by_clerk_user_id = CASE WHEN ${input.status} = 'reviewing' THEN NULL ELSE ${input.actor.clerkUserId} END,
              handling_note = ${input.note}
          WHERE report.id = ${input.reportId}::uuid
            AND report.workspace_id = ${input.actor.workspaceId}
            AND report.status IN ('open', 'reviewing')
            AND report.status <> ${input.status}
            AND EXISTS (SELECT 1 FROM actor_access)
            AND NOT EXISTS (SELECT 1 FROM replay)
          RETURNING report.request_id
        ),
        inserted_event AS (
          INSERT INTO partner_athlete_introduction_events (
            id, workspace_id, request_id, event_type, actor_clerk_user_id,
            actor_role, request_status, moderation_status, idempotency_key,
            payload_hash, created_at
          )
          SELECT ${eventId}::uuid, ${input.actor.workspaceId}, candidate.request_id,
                 ${eventType}, ${input.actor.clerkUserId}, 'admin',
                 candidate.request_status, candidate.request_moderation_status,
                 ${input.idempotencyKey}, ${input.payloadHash}, ${input.now}::timestamptz
          FROM candidate
          WHERE EXISTS (SELECT 1 FROM updated)
        )
        SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_found'
          WHEN NOT EXISTS (SELECT 1 FROM actor_access) THEN 'forbidden'
          WHEN EXISTS (SELECT 1 FROM replay WHERE payload_hash IS DISTINCT FROM ${input.payloadHash})
            THEN 'idempotency_conflict'
          WHEN EXISTS (SELECT 1 FROM replay) THEN 'replay'
          WHEN EXISTS (SELECT 1 FROM updated) THEN 'updated'
          ELSE 'conflict'
        END AS outcome
      `;
      return [lock, mutation];
    }, { isolationLevel: "ReadCommitted" });
    return String(results[1][0]?.outcome) as Awaited<ReturnType<PartnerAthleteIntroductionRepository["handleReport"]>>;
  },

  async getOutboxDiagnostics(input) {
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (
          WHERE status = 'pending'
            AND created_at < ${input.staleBefore}::timestamptz
        )::int AS stale_pending,
        COUNT(*) FILTER (
          WHERE status = 'processing'
            AND locked_at < ${input.staleBefore}::timestamptz
        )::int AS stale_processing
      FROM partner_athlete_introduction_notification_outbox
    `;
    return {
      failed: Number(rows[0]?.failed ?? 0),
      stalePending: Number(rows[0]?.stale_pending ?? 0),
      staleProcessing: Number(rows[0]?.stale_processing ?? 0),
    };
  },

  async claimOutbox(input) {
    const results = await sql.transaction((tx) => {
      const claim = tx`
        WITH candidates AS (
          SELECT id
          FROM partner_athlete_introduction_notification_outbox
          WHERE (
              status = 'pending'
              OR (
                status = 'processing'
                AND locked_at < ${input.staleLockBefore}::timestamptz
              )
            )
            AND attempt_count < ${input.maxAttempts}
            AND next_attempt_at <= ${input.now}::timestamptz
          ORDER BY created_at
          LIMIT ${input.batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE partner_athlete_introduction_notification_outbox outbox
        SET
          status = 'processing',
          attempt_count = outbox.attempt_count + 1,
          locked_at = ${input.now}::timestamptz,
          locked_by = ${input.workerId},
          updated_at = ${input.now}::timestamptz
        FROM candidates
        WHERE outbox.id = candidates.id
        RETURNING
          outbox.id, outbox.workspace_id, outbox.event_id,
          outbox.recipient_clerk_user_id, outbox.attempt_count
      `;
      return [claim];
    }, { isolationLevel: "ReadCommitted" });
    return results[0].map((row) => ({
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      eventId: String(row.event_id),
      recipientClerkUserId: String(row.recipient_clerk_user_id),
      attemptCount: Number(row.attempt_count),
    }));
  },

  async deliverOutbox(input) {
    const results = await sql.transaction((tx) => {
      const delivery = tx`
        WITH candidate AS (
          SELECT
            outbox.*,
            event.event_type,
            event.request_id,
            request.athlete_id,
            request.partner_id
          FROM partner_athlete_introduction_notification_outbox outbox
          JOIN partner_athlete_introduction_events event
            ON event.workspace_id = outbox.workspace_id
            AND event.id = outbox.event_id
          JOIN contact_requests request
            ON request.workspace_id = event.workspace_id
            AND request.id = event.request_id
          WHERE outbox.id = ${input.outboxId}::uuid
            AND outbox.status = 'processing'
            AND outbox.locked_by = ${input.workerId}
          FOR UPDATE OF outbox
        ),
        authorized AS (
          SELECT candidate.*
          FROM candidate
          JOIN user_access access
            ON access.workspace_id = candidate.workspace_id
            AND access.clerk_user_id = candidate.recipient_clerk_user_id
            AND access.status = 'active'
          WHERE
            (
              candidate.event_type = 'request_created'
              AND access.role = 'athlete'
              AND access.athlete_id = candidate.athlete_id
            )
            OR (
              candidate.event_type IN ('athlete_accepted', 'athlete_declined')
              AND access.role = 'partner_expert'
              AND access.partner_id = candidate.partner_id
            )
            OR (
              candidate.event_type IN (
                'moderation_suspended',
                'moderation_reactivated'
              )
              AND (
                (access.role = 'athlete' AND access.athlete_id = candidate.athlete_id)
                OR (
                  access.role = 'partner_expert'
                  AND access.partner_id = candidate.partner_id
                )
              )
            )
        ),
        inserted AS (
          INSERT INTO notifications (
            id, workspace_id, recipient_clerk_user_id, type, title, body,
            action_href, source_type, source_id, created_at
          )
          SELECT
            ${input.notificationId}::uuid, workspace_id,
            recipient_clerk_user_id, notification_type, title, body,
            action_href, 'partner_athlete_introduction_event',
            event_id::text, ${input.now}::timestamptz
          FROM authorized
          ON CONFLICT (
            workspace_id,
            recipient_clerk_user_id,
            source_type,
            source_id
          ) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
          DO NOTHING
          RETURNING id
        ),
        resolved_notification AS (
          SELECT id FROM inserted
          UNION ALL
          SELECT notification.id
          FROM authorized
          JOIN notifications notification
            ON notification.workspace_id = authorized.workspace_id
            AND notification.recipient_clerk_user_id =
              authorized.recipient_clerk_user_id
            AND notification.source_type =
              'partner_athlete_introduction_event'
            AND notification.source_id = authorized.event_id::text
          LIMIT 1
        ),
        updated AS (
          UPDATE partner_athlete_introduction_notification_outbox outbox
          SET
            status = CASE
              WHEN EXISTS (SELECT 1 FROM authorized) THEN 'delivered'
              ELSE 'discarded'
            END,
            delivered_at = CASE
              WHEN EXISTS (SELECT 1 FROM authorized)
                THEN ${input.now}::timestamptz
              ELSE NULL
            END,
            notification_id = (SELECT id FROM resolved_notification),
            last_error = CASE
              WHEN EXISTS (SELECT 1 FROM authorized)
                THEN NULL
              ELSE 'recipient_not_authorized'
            END,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = ${input.now}::timestamptz
          WHERE outbox.id = ${input.outboxId}::uuid
            AND EXISTS (SELECT 1 FROM candidate)
          RETURNING status, notification_id
        )
        SELECT status, notification_id FROM updated
      `;
      return [delivery];
    }, { isolationLevel: "ReadCommitted" });
    const row = results[0][0];
    if (!row) return { outcome: "not_found", notificationId: null };
    if (row.status === "discarded") {
      return { outcome: "discarded", notificationId: null };
    }
    return {
      outcome: "delivered",
      notificationId: String(row.notification_id),
    };
  },

  async failOutbox(input) {
    const results = await sql.transaction((tx) => {
      const failure = tx`
        UPDATE partner_athlete_introduction_notification_outbox
        SET
          status = CASE
            WHEN attempt_count >= ${input.maxAttempts} THEN 'failed'
            ELSE 'pending'
          END,
          next_attempt_at = ${input.retryAt}::timestamptz,
          locked_at = NULL,
          locked_by = NULL,
          last_error = ${input.errorCode},
          updated_at = ${input.now}::timestamptz
        WHERE id = ${input.outboxId}::uuid
          AND status = 'processing'
          AND locked_by = ${input.workerId}
        RETURNING status
      `;
      return [failure];
    }, { isolationLevel: "ReadCommitted" });
    const status = String(results[0][0]?.status ?? "");
    if (status === "pending" || status === "failed") return status;
    return "not_found";
  },
});
