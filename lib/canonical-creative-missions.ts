import { createContentStorageClient } from "@/lib/content-storage/db";

export type CanonicalCreativeMissionState =
  | "review"
  | "organize"
  | "proposed"
  | "confirmation_pending"
  | "confirmed"
  | "in_progress"
  | "review_delivery"
  | "changes_requested"
  | "completed"
  | "closed_without_action"
  | "cancelled";

export type CanonicalCreativeMissionView =
  | "to_process"
  | "to_organize"
  | "in_progress"
  | "history";

export type CanonicalCreativeMission = {
  id: string;
  recordKind: "mission" | "historical_entry";
  originKind: "projection" | "athlete_request" | "admin" | "production" | "historical";
  state: CanonicalCreativeMissionState;
  view: CanonicalCreativeMissionView;
  title: string;
  missionType:
    | "media_day"
    | "match_competition"
    | "video"
    | "interview"
    | "production"
    | "other";
  scheduledAt: string | null;
  periodEndsAt: string | null;
  locationName: string | null;
  region: string | null;
  deliverables: string | null;
  contextNotes: string | null;
  usageRights: string | null;
  budgetAmountMinor: number | null;
  expensesCovered: boolean | null;
  expenseTerms: string | null;
  responseDeadline: string | null;
  searchMode: "single_creative" | "targeted_creatives" | "direct_assignment" | null;
  blockingReason: string | null;
  occurredAt: string | null;
  occurredAtSource: string | null;
  regularizationStatus:
    | "none"
    | "historical_completed"
    | "historical_closed_without_action";
  regularizationNote: string | null;
  athletes: Array<{ id: string; name: string | null }>;
  services: Array<{
    requestId: string;
    productName: string;
    status: string;
    requestedDetails: Record<string, unknown>;
  }>;
  sources: Array<{
    type: "athlete_service_request" | "athlete_session_request" | "production_brief" | "production_sheet";
    relation: "origin" | "service" | "production";
    id: string;
    snapshot: Record<string, unknown>;
  }>;
  creative: {
    kind: "operational" | "historical";
    name: string;
    profileId: string | null;
  } | null;
  nextAction: string;
  nextActor: "Admin" | "Créatif" | "Athlète" | null;
  events: Array<{
    action: string;
    fromState: CanonicalCreativeMissionState | null;
    toState: CanonicalCreativeMissionState;
    actor: string;
    note: string | null;
    createdAt: string;
  }>;
  updatedAt: string;
};

export type CanonicalCreativeMissionCounts = Record<CanonicalCreativeMissionView, number>;

export type CanonicalCreativeMissionListResult = {
  missions: CanonicalCreativeMission[];
  counts: CanonicalCreativeMissionCounts;
};

type MissionRow = {
  id: string;
  record_kind: CanonicalCreativeMission["recordKind"];
  origin_kind: CanonicalCreativeMission["originKind"];
  business_state: CanonicalCreativeMissionState;
  title: string;
  mission_type: CanonicalCreativeMission["missionType"];
  scheduled_at: string | Date | null;
  period_ends_at: string | Date | null;
  location_name: string | null;
  region: string | null;
  expected_deliverables: string | null;
  context_notes: string | null;
  usage_rights: string | null;
  budget_amount_minor: number | null;
  expenses_covered: boolean | null;
  expense_terms: string | null;
  response_deadline: string | Date | null;
  search_mode: CanonicalCreativeMission["searchMode"];
  blocking_reason: string | null;
  occurred_at: string | Date | null;
  occurred_at_source: string | null;
  regularization_status: CanonicalCreativeMission["regularizationStatus"];
  regularization_note: string | null;
  historical_creative_name: string | null;
  historical_creative_profile_id: string | null;
  operational_creative_profile_id: string | null;
  historical_profile_name: string | null;
  operational_profile_name: string | null;
  athletes: unknown;
  sources: unknown;
  events: unknown;
  updated_at: string | Date;
};

type CountRow = {
  view: CanonicalCreativeMissionView;
  count: number;
};

export type CanonicalCreativeMissionRepository = {
  list: (workspaceId: string) => Promise<MissionRow[]>;
  countByView: (workspaceId: string) => Promise<CountRow[]>;
};

const viewByState: Record<CanonicalCreativeMissionState, CanonicalCreativeMissionView> = {
  review: "to_process",
  organize: "to_organize",
  proposed: "in_progress",
  confirmation_pending: "in_progress",
  confirmed: "in_progress",
  in_progress: "in_progress",
  review_delivery: "in_progress",
  changes_requested: "in_progress",
  completed: "history",
  closed_without_action: "history",
  cancelled: "history",
};

const nextActionByState: Record<CanonicalCreativeMissionState, string> = {
  review: "Examiner la demande",
  organize: "Organiser la mission",
  proposed: "Suivre les propositions",
  confirmation_pending: "Attendre la confirmation du créatif",
  confirmed: "Préparer la réalisation",
  in_progress: "Suivre la réalisation",
  review_delivery: "Valider la livraison",
  changes_requested: "Attendre une nouvelle livraison",
  completed: "Aucune action",
  closed_without_action: "Aucune action",
  cancelled: "Aucune action",
};

const nextActorByState: Record<
  CanonicalCreativeMissionState,
  CanonicalCreativeMission["nextActor"]
> = {
  review: "Admin",
  organize: "Admin",
  proposed: "Créatif",
  confirmation_pending: "Créatif",
  confirmed: "Créatif",
  in_progress: "Créatif",
  review_delivery: "Admin",
  changes_requested: "Créatif",
  completed: null,
  closed_without_action: null,
  cancelled: null,
};

const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

const toIso = (value: string | Date | null): string | null =>
  value === null ? null : new Date(value).toISOString();

export const mapCanonicalCreativeMission = (row: MissionRow): CanonicalCreativeMission => {
  const sources = asArray<CanonicalCreativeMission["sources"][number]>(row.sources);
  const services = sources
    .filter((source) => source.type === "athlete_service_request")
    .map((source) => ({
      requestId: source.id,
      productName: String(source.snapshot.productName ?? "Prestation"),
      status: String(source.snapshot.status ?? "unknown"),
      requestedDetails: (
        source.snapshot.requestedDetails
        && typeof source.snapshot.requestedDetails === "object"
        && !Array.isArray(source.snapshot.requestedDetails)
      )
        ? source.snapshot.requestedDetails as Record<string, unknown>
        : {},
    }));

  const operationalName = row.operational_profile_name?.trim();
  const historicalName = row.historical_creative_name?.trim();
  const creative = operationalName
    ? {
        kind: "operational" as const,
        name: operationalName,
        profileId: row.operational_creative_profile_id,
      }
    : historicalName
      ? {
          kind: "historical" as const,
          name: historicalName,
          profileId: row.historical_creative_profile_id,
        }
      : null;

  return {
    id: row.id,
    recordKind: row.record_kind,
    originKind: row.origin_kind,
    state: row.business_state,
    view: viewByState[row.business_state],
    title: row.title,
    missionType: row.mission_type,
    scheduledAt: toIso(row.scheduled_at),
    periodEndsAt: toIso(row.period_ends_at),
    locationName: row.location_name,
    region: row.region,
    deliverables: row.expected_deliverables,
    contextNotes: row.context_notes,
    usageRights: row.usage_rights,
    budgetAmountMinor: row.budget_amount_minor,
    expensesCovered: row.expenses_covered,
    expenseTerms: row.expense_terms,
    responseDeadline: toIso(row.response_deadline),
    searchMode: row.search_mode,
    blockingReason: row.blocking_reason,
    occurredAt: toIso(row.occurred_at),
    occurredAtSource: row.occurred_at_source,
    regularizationStatus: row.regularization_status,
    regularizationNote: row.regularization_note,
    athletes: asArray<CanonicalCreativeMission["athletes"][number]>(row.athletes),
    services,
    sources,
    creative,
    nextAction: nextActionByState[row.business_state],
    nextActor: nextActorByState[row.business_state],
    events: asArray<CanonicalCreativeMission["events"][number]>(row.events),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
};

export const createCanonicalCreativeMissionRepository = (): CanonicalCreativeMissionRepository => {
  const sql = createContentStorageClient();
  return {
    async list(workspaceId) {
      const rows = await sql.query(`
        SELECT
          mission.id,
          mission.record_kind,
          mission.origin_kind,
          mission.business_state,
          mission.title,
          mission.mission_type,
          mission.scheduled_at,
          mission.period_ends_at,
          mission.location_name,
          mission.region,
          mission.expected_deliverables,
          mission.context_notes,
          mission.usage_rights,
          mission.budget_amount_minor,
          mission.expenses_covered,
          mission.expense_terms,
          mission.response_deadline,
          mission.search_mode,
          mission.blocking_reason,
          mission.occurred_at,
          mission.occurred_at_source,
          mission.regularization_status,
          mission.regularization_note,
          mission.historical_creative_name,
          mission.historical_creative_profile_id,
          mission.operational_creative_profile_id,
          historical_profile.display_name AS historical_profile_name,
          operational_profile.display_name AS operational_profile_name,
          COALESCE(athletes.items, '[]'::jsonb) AS athletes,
          COALESCE(sources.items, '[]'::jsonb) AS sources,
          COALESCE(events.items, '[]'::jsonb) AS events,
          mission.updated_at
        FROM creative_missions mission
        LEFT JOIN creative_profiles historical_profile
          ON historical_profile.workspace_id = mission.workspace_id
         AND historical_profile.id = mission.historical_creative_profile_id
        LEFT JOIN creative_profiles operational_profile
          ON operational_profile.workspace_id = mission.workspace_id
         AND operational_profile.id = mission.operational_creative_profile_id
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
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'type', link.source_type,
              'relation', link.relation_type,
              'id', link.source_id,
              'snapshot', link.source_snapshot
            )
            ORDER BY link.created_at, link.id
          ) AS items
          FROM creative_mission_links link
          WHERE link.workspace_id = mission.workspace_id
            AND link.mission_id = mission.id
        ) sources ON TRUE
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'action', event.action,
              'fromState', event.from_state,
              'toState', event.to_state,
              'actor', event.actor,
              'note', event.note,
              'createdAt', event.created_at
            )
            ORDER BY event.created_at, event.id
          ) AS items
          FROM creative_mission_events event
          WHERE event.workspace_id = mission.workspace_id
            AND event.mission_id = mission.id
        ) events ON TRUE
        WHERE mission.workspace_id = $1
        ORDER BY
          CASE mission.business_state
            WHEN 'review' THEN 0
            WHEN 'organize' THEN 1
            WHEN 'review_delivery' THEN 2
            WHEN 'changes_requested' THEN 3
            WHEN 'confirmation_pending' THEN 4
            WHEN 'confirmed' THEN 5
            WHEN 'in_progress' THEN 6
            WHEN 'proposed' THEN 7
            WHEN 'completed' THEN 8
            WHEN 'closed_without_action' THEN 9
            WHEN 'cancelled' THEN 10
          END,
          COALESCE(mission.scheduled_at, mission.occurred_at) DESC NULLS LAST,
          mission.id
      `, [workspaceId]) as MissionRow[];
      return rows;
    },
    async countByView(workspaceId) {
      const rows = await sql.query(`
        SELECT
          CASE
            WHEN business_state = 'review' THEN 'to_process'
            WHEN business_state = 'organize' THEN 'to_organize'
            WHEN business_state IN (
              'proposed', 'confirmation_pending', 'confirmed', 'in_progress',
              'review_delivery', 'changes_requested'
            ) THEN 'in_progress'
            ELSE 'history'
          END AS view,
          count(*)::int AS count
        FROM creative_missions
        WHERE workspace_id = $1
        GROUP BY view
      `, [workspaceId]) as CountRow[];
      return rows;
    },
  };
};

export const listCanonicalCreativeMissions = async ({
  workspaceId,
  repository = createCanonicalCreativeMissionRepository(),
}: {
  workspaceId: string;
  repository?: CanonicalCreativeMissionRepository;
}): Promise<CanonicalCreativeMissionListResult> => {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) throw new Error("workspaceId est requis.");

  const [rows, countRows] = await Promise.all([
    repository.list(normalizedWorkspaceId),
    repository.countByView(normalizedWorkspaceId),
  ]);
  const counts: CanonicalCreativeMissionCounts = {
    to_process: 0,
    to_organize: 0,
    in_progress: 0,
    history: 0,
  };
  for (const row of countRows) counts[row.view] = row.count;

  return {
    missions: rows.map(mapCanonicalCreativeMission),
    counts,
  };
};
