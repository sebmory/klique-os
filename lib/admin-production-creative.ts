import { createHash } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { parseCompensation, requireUuid } from "@/lib/production-creative-validation";
import { getShootingsFromGoogleSheets } from "@/lib/google-sheets";

const text = (value: unknown, field: string, max = 4000): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${field} invalide.`);
  }
  return value.trim();
};

const nullableText = (value: unknown, max = 4000): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new Error("Champ invalide.");
  return value.trim() || null;
};

const isoDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Date invalide.");
  return value;
};

export type ProductionSourceSnapshot = {
  date: string;
  type: string;
  athlete: string;
  sport: string;
  location: string;
  objective: string;
};

const normalizeSourceValue = (value: unknown): string => String(value ?? "").trim();

export const normalizeProductionSourceSnapshot = (
  value: Record<string, unknown>,
): ProductionSourceSnapshot => ({
  date: normalizeSourceValue(value.date),
  type: normalizeSourceValue(value.type),
  athlete: normalizeSourceValue(value.athlete),
  sport: normalizeSourceValue(value.sport),
  location: normalizeSourceValue(value.location),
  objective: normalizeSourceValue(value.objective),
});

export const buildProductionSourceFingerprint = (
  snapshot: ProductionSourceSnapshot,
): string => createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

export type ProductionSourceAnchorState =
  | "exact"
  | "source_changed"
  | "source_missing"
  | "ambiguous";

export const classifyProductionSourceAnchor = (
  anchors: Array<{ row: number | undefined; fingerprint: string }>,
  sourceRow: number,
  expectedFingerprint: string,
): ProductionSourceAnchorState => {
  const atRow = anchors.find((item) => item.row === sourceRow);
  if (!atRow) return "source_missing";
  if (atRow.fingerprint !== expectedFingerprint) return "source_changed";
  return anchors.filter((item) => item.fingerprint === expectedFingerprint).length === 1
    ? "exact"
    : "ambiguous";
};

export const verifyProductionSourceAnchor = async (
  sourceRow: number,
  expectedFingerprint: string,
): Promise<ProductionSourceAnchorState> => {
  const shootings = await getShootingsFromGoogleSheets();
  const fingerprints = shootings.map((shooting) => ({
    row: shooting.row,
    fingerprint: buildProductionSourceFingerprint(normalizeProductionSourceSnapshot({
      date: shooting.date,
      type: shooting.type,
      athlete: shooting.athlete,
      sport: shooting.sport,
      location: shooting.place,
      objective: shooting.objective,
    })),
  }));
  return classifyProductionSourceAnchor(fingerprints, sourceRow, expectedFingerprint);
};

export type AdminBriefInput = ReturnType<typeof parseAdminBriefInput>;

const conditionsSnapshotSql = `
  jsonb_build_object(
    'version', conditions_version,
    'compensationType', compensation_type,
    'amountMinor', compensation_amount_minor,
    'currency', compensation_currency,
    'expensesCovered', expenses_covered,
    'expenseTerms', expense_terms,
    'deliverables', deliverables,
    'creditsAndUsage', credits_and_usage,
    'scheduledDate', scheduled_date,
    'dateToAgree', date_to_agree,
    'region', region,
    'locationDetails', location_details,
    'deliveryDueDate', delivery_due_date
  )
`;

export const parseAdminBriefInput = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Requête invalide.");
  const input = value as Record<string, unknown>;
  const allowed = [
    "productionSourceRow", "productionSnapshot", "title", "creativeType", "athletes",
    "scheduledDate", "dateToAgree", "region", "locationDetails", "objective",
    "deliverables", "deliveryDueDate", "compensation", "expensesCovered",
    "expenseTerms", "creditsAndUsage", "necessaryContactDetails", "recipientIds",
  ];
  if (!Object.keys(input).every((key) => allowed.includes(key))) throw new Error("Requête invalide.");
  if (!Number.isInteger(input.productionSourceRow) || Number(input.productionSourceRow) < 4) {
    throw new Error("Production source invalide.");
  }
  if (!input.productionSnapshot || typeof input.productionSnapshot !== "object" || Array.isArray(input.productionSnapshot)) {
    throw new Error("Instantané de production invalide.");
  }
  const snapshot = input.productionSnapshot as Record<string, unknown>;
  const snapshotAllowed = ["date", "type", "athlete", "sport", "location", "objective"];
  if (!Object.keys(snapshot).every((key) => snapshotAllowed.includes(key))) {
    throw new Error("L’instantané contient des données non autorisées.");
  }
  if (!["photo", "video", "photo_video"].includes(String(input.creativeType))) {
    throw new Error("Type créatif invalide.");
  }
  const athletes = Array.isArray(input.athletes) ? input.athletes.map((athlete) => {
    if (!athlete || typeof athlete !== "object" || Array.isArray(athlete)) throw new Error("Athlète invalide.");
    const item = athlete as Record<string, unknown>;
    return { id: text(item.id, "Identifiant athlète", 200), name: text(item.name, "Nom athlète", 200) };
  }) : [];
  if (athletes.length === 0) throw new Error("Au moins un athlète identifié est obligatoire.");
  const recipientIds = Array.isArray(input.recipientIds)
    ? [...new Set(input.recipientIds.map((id) => requireUuid(id, "Destinataire")))]
    : [];
  if (recipientIds.length === 0) throw new Error("Sélectionnez au moins un destinataire.");
  const dateToAgree = input.dateToAgree === true;
  const scheduledDate = isoDate(input.scheduledDate);
  if (!dateToAgree && !scheduledDate) throw new Error("La date ou « à convenir » est obligatoire.");
  return {
    productionSourceRow: Number(input.productionSourceRow),
    productionSnapshot: normalizeProductionSourceSnapshot(snapshot),
    productionSourceFingerprint: buildProductionSourceFingerprint(
      normalizeProductionSourceSnapshot(snapshot),
    ),
    title: text(input.title, "Titre", 200),
    creativeType: input.creativeType as "photo" | "video" | "photo_video",
    athletes,
    scheduledDate,
    dateToAgree,
    region: text(input.region, "Région", 200),
    locationDetails: nullableText(input.locationDetails, 500),
    objective: text(input.objective, "Objectif"),
    deliverables: text(input.deliverables, "Livrables"),
    deliveryDueDate: isoDate(input.deliveryDueDate),
    compensation: parseCompensation(input.compensation),
    expensesCovered: input.expensesCovered === true,
    expenseTerms: text(input.expenseTerms, "Conditions de frais", 1000),
    creditsAndUsage: text(input.creditsAndUsage, "Crédits et utilisation"),
    necessaryContactDetails: nullableText(input.necessaryContactDetails, 1000),
    recipientIds,
  };
};

export const createProductionCreativeBrief = async (context: {
  workspaceId: string;
  clerkUserId: string;
}, input: AdminBriefInput): Promise<string> => {
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH valid_recipients AS (
      SELECT id
      FROM creative_profiles
      WHERE workspace_id = $1 AND status = 'active' AND id = ANY($23::uuid[])
    ), inserted AS (
      INSERT INTO production_creative_briefs (
        workspace_id, production_source_row, production_source_fingerprint,
        production_snapshot, title, creative_type, athlete_refs, scheduled_date,
        date_to_agree, region, location_details, objective, deliverables,
        delivery_due_date, compensation_type, compensation_amount_minor,
        compensation_currency, expenses_covered, expense_terms, credits_and_usage,
        necessary_contact_details, created_by_clerk_user_id
      )
      SELECT $1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8::date, $9, $10,
             $11, $12, $13, $14::date, $15, $16, $17, $18, $19, $20, $21, $22
      WHERE (SELECT count(*) FROM valid_recipients) = cardinality($23::uuid[])
      RETURNING *
    ), recipients AS (
      INSERT INTO production_creative_recipients (workspace_id, brief_id, creative_profile_id)
      SELECT $1, inserted.id, valid_recipients.id FROM inserted CROSS JOIN valid_recipients
    ), condition_version AS (
      INSERT INTO production_creative_condition_versions (
        workspace_id, brief_id, version, conditions_snapshot, created_by_clerk_user_id
      )
      SELECT $1, id, conditions_version, ${conditionsSnapshotSql}, $22
      FROM inserted
    ), event AS (
      INSERT INTO production_creative_events (
        workspace_id, brief_id, action, actor_clerk_user_id, details
      )
      SELECT $1, id, 'brief_created', $22,
             jsonb_build_object('productionSourceRow', $2, 'recipientCount', cardinality($23::uuid[]))
      FROM inserted
    )
    SELECT id FROM inserted
  `, [
    context.workspaceId,
    input.productionSourceRow,
    input.productionSourceFingerprint,
    JSON.stringify(input.productionSnapshot),
    input.title,
    input.creativeType,
    JSON.stringify(input.athletes),
    input.scheduledDate,
    input.dateToAgree,
    input.region,
    input.locationDetails,
    input.objective,
    input.deliverables,
    input.deliveryDueDate,
    input.compensation.type,
    input.compensation.amountMinor,
    input.compensation.currency,
    input.expensesCovered,
    input.expenseTerms,
    input.creditsAndUsage,
    input.necessaryContactDetails,
    context.clerkUserId,
    input.recipientIds,
  ]) as Array<{ id: string }>;
  if (!rows[0]) throw new Error("Un destinataire est introuvable ou inactif.");
  return rows[0].id;
};

export const createProductionCreativeBriefFromCanonicalMission = async (
  context: {
    workspaceId: string;
    clerkUserId: string;
  },
  input: {
    missionId: string;
    recipientIds: string[];
  },
): Promise<{
  outcome: "changed" | "unchanged" | "not_found" | "incomplete" | "invalid_recipients";
  briefId: string | null;
  status: "draft" | "published" | "assigned" | "cancelled" | null;
}> => {
  const missionId = requireUuid(input.missionId, "Mission");
  const recipientIds = [...new Set(
    input.recipientIds.map((id) => requireUuid(id, "Destinataire")),
  )];
  if (recipientIds.length === 0) throw new Error("Sélectionnez au moins un destinataire.");
  const fingerprint = createHash("sha256")
    .update(`canonical-mission:${context.workspaceId}:${missionId}`)
    .digest("hex");
  const sql = createContentStorageClient();
  const rows = await sql.query(`
    WITH target AS MATERIALIZED (
      SELECT mission.*,
             COALESCE(athletes.items, '[]'::jsonb) AS athlete_refs
      FROM creative_missions mission
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', athlete.athlete_id,
            'name', athlete.athlete_name_snapshot
          )
          ORDER BY athlete.athlete_name_snapshot NULLS LAST, athlete.athlete_id
        ) AS items
        FROM creative_mission_athletes athlete
        WHERE athlete.workspace_id = mission.workspace_id
          AND athlete.mission_id = mission.id
      ) athletes ON TRUE
      WHERE mission.workspace_id = $1
        AND mission.id = $2::uuid
      FOR UPDATE OF mission
    ),
    existing AS MATERIALIZED (
      SELECT brief.id, brief.status
      FROM production_creative_briefs brief
      WHERE brief.workspace_id = $1
        AND brief.origin_type = 'canonical_mission'
        AND brief.origin_request_id = $2::uuid
    ),
    valid_recipients AS MATERIALIZED (
      SELECT profile.id
      FROM creative_profiles profile
      WHERE profile.workspace_id = $1
        AND profile.status = 'active'
        AND profile.id = ANY($4::uuid[])
    ),
    inserted AS MATERIALIZED (
      INSERT INTO production_creative_briefs (
        workspace_id, production_source, production_source_row,
        production_source_fingerprint, production_snapshot,
        origin_type, origin_request_id, planning_timezone,
        title, creative_type, athlete_refs, scheduled_date, date_to_agree,
        region, location_details, objective, deliverables, delivery_due_date,
        compensation_type, compensation_amount_minor, compensation_currency,
        expenses_covered, expense_terms, credits_and_usage,
        necessary_contact_details, response_deadline, created_by_clerk_user_id
      )
      SELECT
        $1,
        'canonical_mission',
        NULL,
        $3,
        jsonb_build_object(
          'missionId', target.id,
          'missionType', target.mission_type,
          'originKind', target.origin_kind
        ),
        'canonical_mission',
        target.id,
        'Europe/Zurich',
        target.title,
        CASE target.mission_type
          WHEN 'match_competition' THEN 'photo'
          WHEN 'video' THEN 'video'
          WHEN 'interview' THEN 'video'
          ELSE 'photo_video'
        END,
        target.athlete_refs,
        (target.scheduled_at AT TIME ZONE 'Europe/Zurich')::date,
        target.scheduled_at IS NULL,
        target.region,
        target.location_name,
        target.context_notes,
        target.expected_deliverables,
        NULL,
        CASE WHEN target.budget_amount_minor IS NULL
          THEN 'unpaid_collaboration'
          ELSE 'paid_mandate'
        END,
        target.budget_amount_minor,
        CASE WHEN target.budget_amount_minor IS NULL THEN NULL ELSE 'CHF' END,
        COALESCE(target.expenses_covered, FALSE),
        target.expense_terms,
        target.usage_rights,
        NULL,
        target.response_deadline,
        $5
      FROM target
      WHERE target.origin_kind = 'admin'
        AND target.business_state = 'organize'
        AND target.region IS NOT NULL
        AND target.context_notes IS NOT NULL
        AND target.expected_deliverables IS NOT NULL
        AND target.usage_rights IS NOT NULL
        AND target.expense_terms IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM existing)
        AND (SELECT count(*) FROM valid_recipients) = cardinality($4::uuid[])
      RETURNING id, status, conditions_version, compensation_type,
                compensation_amount_minor, compensation_currency,
                expenses_covered, expense_terms, deliverables,
                credits_and_usage, scheduled_date, date_to_agree, region,
                location_details, delivery_due_date
    ),
    recipients AS (
      INSERT INTO production_creative_recipients (
        workspace_id, brief_id, creative_profile_id
      )
      SELECT $1, inserted.id, valid_recipients.id
      FROM inserted
      CROSS JOIN valid_recipients
    ),
    conditions AS (
      INSERT INTO production_creative_condition_versions (
        workspace_id, brief_id, version, conditions_snapshot,
        created_by_clerk_user_id
      )
      SELECT
        $1,
        inserted.id,
        inserted.conditions_version,
        jsonb_build_object(
          'version', inserted.conditions_version,
          'compensationType', inserted.compensation_type,
          'amountMinor', inserted.compensation_amount_minor,
          'currency', inserted.compensation_currency,
          'expensesCovered', inserted.expenses_covered,
          'expenseTerms', inserted.expense_terms,
          'deliverables', inserted.deliverables,
          'creditsAndUsage', inserted.credits_and_usage,
          'scheduledDate', inserted.scheduled_date,
          'dateToAgree', inserted.date_to_agree,
          'region', inserted.region,
          'locationDetails', inserted.location_details,
          'deliveryDueDate', inserted.delivery_due_date
        ),
        $5
      FROM inserted
    ),
    event AS (
      INSERT INTO production_creative_events (
        workspace_id, brief_id, action, actor_clerk_user_id, details
      )
      SELECT
        $1,
        inserted.id,
        'brief_created',
        $5,
        jsonb_build_object(
          'originType', 'canonical_mission',
          'originRequestId', $2,
          'recipientCount', cardinality($4::uuid[])
        )
      FROM inserted
    )
    SELECT 'changed' AS outcome, id, status FROM inserted
    UNION ALL
    SELECT 'unchanged', id, status FROM existing
    UNION ALL
    SELECT
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
        WHEN (SELECT count(*) FROM valid_recipients) <> cardinality($4::uuid[])
          THEN 'invalid_recipients'
        ELSE 'incomplete'
      END,
      NULL::uuid,
      NULL::text
    WHERE NOT EXISTS (SELECT 1 FROM inserted)
      AND NOT EXISTS (SELECT 1 FROM existing)
    LIMIT 1
  `, [
    context.workspaceId,
    missionId,
    fingerprint,
    recipientIds,
    context.clerkUserId,
  ]) as Array<{
    outcome: "changed" | "unchanged" | "not_found" | "incomplete" | "invalid_recipients";
    id: string | null;
    status: "draft" | "published" | "assigned" | "cancelled" | null;
  }>;
  const row = rows[0];
  if (!row) throw new Error("Le brief Production n’a pas pu être préparé.");
  return { outcome: row.outcome, briefId: row.id, status: row.status };
};

export const listProductionCreativeBriefsForSource = async (
  workspaceId: string,
  productionSourceRow: number,
  productionSourceFingerprint: string,
) => {
  const sql = createContentStorageClient();
  return sql.query(`
    SELECT brief.id, brief.title, brief.status, brief.conditions_version AS "conditionsVersion",
           brief.compensation_type AS "compensationType",
           brief.compensation_amount_minor AS "compensationAmountMinor",
           brief.compensation_currency AS "compensationCurrency",
           brief.expenses_covered AS "expensesCovered",
           brief.expense_terms AS "expenseTerms", brief.deliverables,
           brief.credits_and_usage AS "creditsAndUsage",
           brief.scheduled_date::text AS "scheduledDate",
           brief.date_to_agree AS "dateToAgree",
           brief.region, brief.location_details AS "locationDetails",
           brief.delivery_due_date::text AS "deliveryDueDate",
           brief.assigned_creative_profile_id AS "assignedCreativeProfileId",
           assignment.confirmation_status AS "confirmationStatus",
           assignment.delivery_status AS "deliveryStatus",
           assignment.delivery_links AS "deliveryLinks",
           assignment.delivery_comment AS "deliveryComment",
           assignment.review_comment AS "reviewComment",
           CASE
             WHEN brief.production_source_fingerprint = $3 THEN 'exact'
             ELSE 'source_changed'
           END AS "sourceLinkStatus",
           COALESCE(applications.items, '[]'::jsonb) AS applications,
           COALESCE(assignment_history.items, '[]'::jsonb) AS "assignmentHistory"
    FROM production_creative_briefs brief
    LEFT JOIN production_creative_assignments assignment
      ON assignment.workspace_id = brief.workspace_id AND assignment.brief_id = brief.id
     AND assignment.status = 'active'
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'creativeProfileId', application.creative_profile_id,
        'displayName', profile.display_name,
        'message', application.message,
        'status', application.status
      ) ORDER BY application.updated_at DESC) AS items
      FROM production_creative_applications application
      JOIN creative_profiles profile
        ON profile.workspace_id = application.workspace_id
       AND profile.id = application.creative_profile_id
      WHERE application.workspace_id = brief.workspace_id
        AND application.brief_id = brief.id
    ) applications ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', historic.id,
        'creativeProfileId', historic.creative_profile_id,
        'displayName', profile.display_name,
        'status', historic.status,
        'confirmationStatus', historic.confirmation_status,
        'conditionsVersion', historic.conditions_version,
        'refusalReason', historic.refusal_reason,
        'deliveryStatus', historic.delivery_status,
        'deliveryLinks', historic.delivery_links,
        'deliveryComment', historic.delivery_comment,
        'createdAt', historic.created_at,
        'refusedAt', historic.refused_at
      ) ORDER BY historic.created_at DESC) AS items
      FROM production_creative_assignments historic
      JOIN creative_profiles profile
        ON profile.workspace_id = historic.workspace_id
       AND profile.id = historic.creative_profile_id
      WHERE historic.workspace_id = brief.workspace_id
        AND historic.brief_id = brief.id
    ) assignment_history ON TRUE
    WHERE brief.workspace_id = $1 AND brief.production_source_row = $2
    ORDER BY brief.created_at DESC
  `, [workspaceId, productionSourceRow, productionSourceFingerprint]);
};

export const transitionProductionCreativeBrief = async (context: {
  workspaceId: string;
  clerkUserId: string;
}, input: {
  briefId: string;
  action: "publish" | "assign" | "request_changes" | "validate_delivery";
  creativeProfileId?: string;
  comment?: string;
}): Promise<"changed" | "not_found" | "conflict"> => {
  const sql = createContentStorageClient();
  const briefId = requireUuid(input.briefId, "briefId");
  const creativeProfileId = input.creativeProfileId
    ? requireUuid(input.creativeProfileId, "creativeProfileId")
    : null;
  const comment = nullableText(input.comment, 2000);
  if (input.action === "assign" && !creativeProfileId) throw new Error("Créatif obligatoire.");
  if (input.action === "request_changes" && !comment) throw new Error("Commentaire obligatoire.");
  const rows = await sql.query(`
    WITH target AS (
      SELECT brief.*
      FROM production_creative_briefs brief
      WHERE brief.workspace_id = $1 AND brief.id = $2::uuid
      FOR UPDATE
    ), eligible AS (
      SELECT application.creative_profile_id
      FROM production_creative_applications application
      JOIN target ON target.workspace_id = application.workspace_id
                 AND target.id = application.brief_id
      WHERE application.status = 'interested'
        AND application.creative_profile_id = $5::uuid
    ), brief_change AS (
      UPDATE production_creative_briefs brief
      SET status = CASE
            WHEN $3 = 'publish' THEN 'published'
            WHEN $3 = 'assign' THEN 'assigned'
            ELSE brief.status END,
          published_at = CASE WHEN $3 = 'publish' THEN NOW() ELSE brief.published_at END,
          assigned_creative_profile_id = CASE WHEN $3 = 'assign' THEN $5::uuid ELSE brief.assigned_creative_profile_id END,
          assigned_at = CASE WHEN $3 = 'assign' THEN NOW() ELSE brief.assigned_at END,
          updated_at = NOW()
      FROM target
      WHERE brief.id = target.id
        AND (($3 = 'publish' AND target.status = 'draft')
          OR ($3 = 'assign' AND target.status = 'published'
            AND target.assigned_creative_profile_id IS NULL
            AND EXISTS (SELECT 1 FROM eligible))
          OR ($3 IN ('request_changes', 'validate_delivery') AND target.status = 'assigned'))
      RETURNING brief.*
    ), assignment AS (
      INSERT INTO production_creative_assignments (
        workspace_id, brief_id, creative_profile_id, conditions_version, conditions_snapshot
      )
      SELECT $1, id, $5::uuid, conditions_version,
             ${conditionsSnapshotSql}
      FROM brief_change WHERE $3 = 'assign'
      RETURNING brief_id
    ), application_change AS (
      UPDATE production_creative_applications application
      SET status = 'selected',
          updated_at = NOW()
      FROM brief_change
      WHERE $3 = 'assign' AND application.workspace_id = $1
        AND application.brief_id = brief_change.id
        AND application.creative_profile_id = $5::uuid
    ), delivery_change AS (
      UPDATE production_creative_assignments assignment
      SET delivery_status = CASE WHEN $3 = 'request_changes' THEN 'changes_requested' ELSE 'validated' END,
          review_comment = $6,
          validated_at = CASE WHEN $3 = 'validate_delivery' THEN NOW() ELSE assignment.validated_at END,
          updated_at = NOW()
      FROM brief_change
      WHERE $3 IN ('request_changes', 'validate_delivery')
        AND assignment.workspace_id = $1 AND assignment.brief_id = brief_change.id
        AND assignment.delivery_status IN ('delivered', 'changes_requested')
      RETURNING assignment.brief_id
    ), event AS (
      INSERT INTO production_creative_events (
        workspace_id, brief_id, creative_profile_id, action, actor_clerk_user_id, details
      )
      SELECT $1, id, $5::uuid,
             CASE $3 WHEN 'publish' THEN 'brief_published'
               WHEN 'assign' THEN 'creative_assigned'
               WHEN 'request_changes' THEN 'delivery_changes_requested'
               ELSE 'delivery_validated' END,
             $4, jsonb_build_object('comment', $6)
      FROM brief_change
      WHERE $3 IN ('publish', 'assign')
         OR EXISTS (SELECT 1 FROM delivery_change)
      RETURNING id
    ), session_target AS (
      SELECT request.id, request.workflow_status AS previous_status,
             brief_change.id AS brief_id
      FROM athlete_session_requests request
      JOIN brief_change
        ON brief_change.origin_type = 'athlete_session_request'
       AND brief_change.origin_request_id = request.id
      WHERE request.workspace_id = $1
      FOR UPDATE OF request
    ), session_change AS (
      UPDATE athlete_session_requests request
      SET workflow_status = CASE
            WHEN $3 = 'publish' THEN 'proposed_to_creatives'
            WHEN $3 = 'assign' THEN 'assigned'
            WHEN $3 = 'validate_delivery' THEN 'completed'
            ELSE request.workflow_status
          END,
          updated_at = NOW()
      FROM session_target
      WHERE session_target.id = request.id
        AND (
          ($3 = 'publish' AND session_target.previous_status = 'production_linked')
          OR ($3 = 'assign' AND session_target.previous_status IN ('proposed_to_creatives', 'candidate_received'))
          OR ($3 = 'validate_delivery' AND session_target.previous_status = 'confirmed'
            AND EXISTS (SELECT 1 FROM delivery_change))
        )
      RETURNING request.id, session_target.brief_id,
                session_target.previous_status,
                request.workflow_status
    ), session_event AS (
      INSERT INTO athlete_session_request_events (
        workspace_id, request_id, from_status, to_status, action,
        actor_clerk_user_id, actor_role, details, idempotency_key
      )
      SELECT $1, session_change.id, session_change.previous_status,
             session_change.workflow_status,
             CASE
               WHEN $3 = 'publish' THEN 'proposed_to_creatives'
               WHEN $3 = 'assign' THEN 'creative_assigned'
               ELSE 'mission_completed'
             END,
             $4, 'admin', jsonb_build_object('briefId', session_change.brief_id),
             'production:' || $3 || ':' || session_change.brief_id::text
      FROM session_change
      ON CONFLICT DO NOTHING
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      WHEN EXISTS (SELECT 1 FROM event) THEN 'changed'
      ELSE 'conflict'
    END AS outcome
  `, [
    context.workspaceId,
    briefId,
    input.action,
    context.clerkUserId,
    creativeProfileId,
    comment,
  ]) as Array<{ outcome: "changed" | "not_found" | "conflict" }>;
  return rows[0]?.outcome ?? "not_found";
};

export type AdminConditionsInput = ReturnType<typeof parseAdminConditionsInput>;

export const parseAdminConditionsInput = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Conditions invalides.");
  }
  const input = value as Record<string, unknown>;
  const allowed = [
    "compensation", "expensesCovered", "expenseTerms", "deliverables",
    "creditsAndUsage", "scheduledDate", "dateToAgree", "region",
    "locationDetails", "deliveryDueDate",
  ];
  if (!Object.keys(input).every((key) => allowed.includes(key))) {
    throw new Error("Conditions invalides.");
  }
  const dateToAgree = input.dateToAgree === true;
  const scheduledDate = isoDate(input.scheduledDate);
  if (!dateToAgree && !scheduledDate) throw new Error("La date ou « à convenir » est obligatoire.");
  return {
    compensation: parseCompensation(input.compensation),
    expensesCovered: input.expensesCovered === true,
    expenseTerms: text(input.expenseTerms, "Conditions de frais", 1000),
    deliverables: text(input.deliverables, "Livrables"),
    creditsAndUsage: text(input.creditsAndUsage, "Crédits et utilisation"),
    scheduledDate,
    dateToAgree,
    region: text(input.region, "Région", 200),
    locationDetails: nullableText(input.locationDetails, 500),
    deliveryDueDate: isoDate(input.deliveryDueDate),
  };
};

export const updateProductionCreativeConditions = async (context: {
  workspaceId: string;
  clerkUserId: string;
}, briefIdValue: string, input: AdminConditionsInput): Promise<"changed" | "not_found" | "unchanged"> => {
  const sql = createContentStorageClient();
  const briefId = requireUuid(briefIdValue, "briefId");
  const rows = await sql.query(`
    WITH target AS (
      SELECT brief.*, ${conditionsSnapshotSql} AS old_snapshot
      FROM production_creative_briefs brief
      WHERE brief.workspace_id = $1 AND brief.id = $2::uuid
        AND brief.status IN ('published', 'assigned')
      FOR UPDATE
    ), proposed AS (
      SELECT target.*,
        jsonb_build_object(
          'version', target.conditions_version + 1,
          'compensationType', $3::text, 'amountMinor', $4::integer, 'currency', $5::text,
          'expensesCovered', $6::boolean, 'expenseTerms', $7::text,
          'deliverables', $8::text, 'creditsAndUsage', $9::text,
          'scheduledDate', $10::date, 'dateToAgree', $11::boolean,
          'region', $12::text, 'locationDetails', $13::text,
          'deliveryDueDate', $14::date
        ) AS new_snapshot
      FROM target
    ), changed_brief AS (
      UPDATE production_creative_briefs brief
      SET compensation_type = $3, compensation_amount_minor = $4,
          compensation_currency = $5, expenses_covered = $6,
          expense_terms = $7, deliverables = $8, credits_and_usage = $9,
          scheduled_date = $10::date, date_to_agree = $11, region = $12,
          location_details = $13, delivery_due_date = $14::date,
          conditions_version = proposed.conditions_version + 1, updated_at = NOW()
      FROM proposed
      WHERE brief.id = proposed.id AND proposed.old_snapshot - 'version'
        IS DISTINCT FROM proposed.new_snapshot - 'version'
      RETURNING brief.*, proposed.old_snapshot, proposed.new_snapshot
    ), version_record AS (
      INSERT INTO production_creative_condition_versions (
        workspace_id, brief_id, version, conditions_snapshot, created_by_clerk_user_id
      )
      SELECT $1, id, conditions_version, new_snapshot, $15
      FROM changed_brief
      RETURNING brief_id
    ), assignment_change AS (
      UPDATE production_creative_assignments assignment
      SET conditions_version = changed_brief.conditions_version,
          conditions_snapshot = changed_brief.new_snapshot,
          confirmation_status = 'confirmation_required',
          confirmed_at = NULL,
          delivery_status = CASE
            WHEN assignment.delivery_status = 'validated' THEN 'delivered'
            ELSE assignment.delivery_status
          END,
          updated_at = NOW()
      FROM changed_brief
      WHERE assignment.workspace_id = $1 AND assignment.brief_id = changed_brief.id
        AND assignment.status = 'active'
      RETURNING assignment.brief_id, assignment.delivery_status
    ), event AS (
      INSERT INTO production_creative_events (
        workspace_id, brief_id, creative_profile_id, action,
        actor_clerk_user_id, details
      )
      SELECT $1, changed_brief.id, assignment.creative_profile_id,
             'conditions_changed', $15,
             jsonb_build_object(
               'oldVersion', changed_brief.conditions_version - 1,
               'newVersion', changed_brief.conditions_version,
               'oldConditions', changed_brief.old_snapshot,
               'newConditions', changed_brief.new_snapshot,
               'previousConfirmationStatus', assignment.confirmation_status,
               'previousDeliveryStatus', assignment.delivery_status
             )
      FROM changed_brief
      LEFT JOIN production_creative_assignments assignment
        ON assignment.workspace_id = $1 AND assignment.brief_id = changed_brief.id
       AND assignment.status = 'active'
      RETURNING id
    ), session_target AS (
      SELECT request.id, request.workflow_status AS previous_status, changed_brief.id AS brief_id
      FROM changed_brief
      JOIN athlete_session_requests request
        ON changed_brief.origin_type = 'athlete_session_request'
       AND changed_brief.origin_request_id = request.id
       AND request.workspace_id = $1
      WHERE request.workflow_status IN ('creative_agreed', 'confirmed')
      FOR UPDATE OF request
    ), session_change AS (
      UPDATE athlete_session_requests request
      SET workflow_status = 'assigned',
          final_confirmed_at = NULL,
          updated_at = NOW()
      FROM session_target
      WHERE request.id = session_target.id
      RETURNING request.id, session_target.previous_status, session_target.brief_id
    ), session_event AS (
      INSERT INTO athlete_session_request_events (
        workspace_id, request_id, from_status, to_status, action,
        actor_clerk_user_id, actor_role, details, idempotency_key
      )
      SELECT $1, session_change.id, session_change.previous_status, 'assigned',
             'conditions_changed', $15, 'admin',
             jsonb_build_object('briefId', session_change.brief_id),
             'conditions:' || session_change.brief_id::text || ':' ||
               (SELECT conditions_version::text FROM changed_brief LIMIT 1)
      FROM session_change
      ON CONFLICT DO NOTHING
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'not_found'
      WHEN EXISTS (SELECT 1 FROM changed_brief) THEN 'changed'
      ELSE 'unchanged'
    END AS outcome
  `, [
    context.workspaceId, briefId,
    input.compensation.type, input.compensation.amountMinor, input.compensation.currency,
    input.expensesCovered, input.expenseTerms, input.deliverables, input.creditsAndUsage,
    input.scheduledDate, input.dateToAgree, input.region, input.locationDetails,
    input.deliveryDueDate, context.clerkUserId,
  ]) as Array<{ outcome: "changed" | "not_found" | "unchanged" }>;
  return rows[0]?.outcome ?? "not_found";
};
