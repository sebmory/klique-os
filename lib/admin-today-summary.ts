import { getDefaultWorkspaceId, createContentStorageClient } from "@/lib/content-storage/db";
import { summarizeCreativeApplicationsModeration } from "@/lib/creatives/applications-sheet";
import { resolveIntroductionStaleDays } from "@/lib/partner-athlete-introductions/domain";
import { PostgresSportsWatchRepository } from "@/lib/sports-watch/repository";

export type TodayActionSummaryItem = {
  id: "creative-applications" | "athlete-requests" | "session-reviews" | "creative-missions" | "introductions" | "sports-watch";
  label: string;
  count: number;
  actionCount?: number;
  priority: "urgente" | "haute" | "normale";
  oldestAt: string | null;
  ageLabel: string | null;
  href: string;
  details?: Array<{ label: string; count: number }>;
};

export type TodayDeadline = {
  id: string;
  label: string;
  date: string;
  href: string;
  kind: "Séance" | "Mission";
};

export type TodaySourceError = { source: string; message: string };

export type TodayActionsSummary = {
  items: TodayActionSummaryItem[];
  errors: TodaySourceError[];
};

const sourceError = (source: string): TodaySourceError => ({
  source,
  message: "Ce résumé est momentanément indisponible.",
});

type CountSummaryRow = {
  count?: number | string;
  oldest_at?: string | Date | null;
};

const ageLabelFor = (oldestAt: string | null, now = new Date()): string | null => {
  if (!oldestAt) return null;
  const parsed = new Date(oldestAt);
  if (Number.isNaN(parsed.getTime())) return null;
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86_400_000));
  if (elapsedDays === 0) return "Depuis moins d’un jour";
  return `Depuis ${elapsedDays} jour${elapsedDays === 1 ? "" : "s"}`;
};

const normalizeOldestAt = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const countRows = async (
  workspaceId: string,
  query: string,
  parameters: unknown[] = [workspaceId],
): Promise<{ count: number; oldestAt: string | null; ageLabel: string | null }> => {
  const rows = await createContentStorageClient().query(query, parameters);
  const row = rows[0] as CountSummaryRow | undefined;
  const oldestAt = normalizeOldestAt(
    row?.oldest_at as string | Date | null | undefined,
  );
  return {
    count: Number(row?.count ?? 0),
    oldestAt,
    ageLabel: ageLabelFor(oldestAt),
  };
};

const countCreativeApplications = async (workspaceId: string): Promise<TodayActionSummaryItem> => {
  const summary = workspaceId === getDefaultWorkspaceId()
    ? await summarizeCreativeApplicationsModeration()
    : { counts: { pending: 0, approved: 0, rejected: 0 }, oldestPendingAt: null };
  const count = summary.counts.pending;
  return {
    id: "creative-applications",
    label: "Candidatures créatives",
    count,
    actionCount: count,
    priority: "normale",
    oldestAt: summary.oldestPendingAt,
    ageLabel: ageLabelFor(summary.oldestPendingAt),
    href: "/crm/creatifs",
  };
};

const countAthleteRequests = async (workspaceId: string): Promise<TodayActionSummaryItem> => {
  const summary = await countRows(
    workspaceId,
    `SELECT COUNT(*)::int AS count, MIN(requested_at) AS oldest_at
       FROM athlete_service_requests
      WHERE workspace_id = $1
        AND status IN ('received', 'to_confirm')
        AND NOT is_admin_membership_realization`,
  );
  return {
    id: "athlete-requests",
    label: "Demandes Athlètes",
    ...summary,
    priority: "haute",
    href: "/crm/demandes",
  };
};

const countSessionReviews = async (workspaceId: string): Promise<TodayActionSummaryItem> => {
  const summary = await countRows(
    workspaceId,
    `SELECT COUNT(*)::int AS count, MIN(created_at) AS oldest_at
       FROM athlete_session_requests
      WHERE workspace_id = $1
        AND workflow_status IN ('submitted', 'admin_review')`,
  );
  return {
    id: "session-reviews",
    label: "Séances à revoir",
    ...summary,
    priority: "haute",
    href: "/missions",
  };
};

const countCreativeMissions = async (workspaceId: string): Promise<TodayActionSummaryItem> => {
  const summary = await countRows(
    workspaceId,
    `SELECT COUNT(*)::int AS count, MIN(created_at) AS oldest_at
       FROM creative_missions
      WHERE workspace_id = $1
        AND business_state IN ('review', 'organize', 'review_delivery')`,
  );
  return {
    id: "creative-missions",
    label: "Missions avec action Admin",
    ...summary,
    priority: "haute",
    href: "/missions",
  };
};

const countIntroductions = async (workspaceId: string): Promise<TodayActionSummaryItem> => {
  const staleDays = resolveIntroductionStaleDays(process.env.PARTNER_INTRODUCTION_STALE_DAYS);
  const rows = await createContentStorageClient().query(
    `SELECT
       COUNT(*) FILTER (WHERE request.status = 'awaiting_athlete')::int AS awaiting,
       COUNT(*) FILTER (
         WHERE request.status = 'awaiting_athlete'
           AND request.athlete_response_enabled_at IS NOT NULL
           AND request.athlete_response_enabled_at <= NOW() - ($2 * interval '1 day')
       )::int AS stale,
       COUNT(*) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM partner_athlete_introduction_reports report
            WHERE report.workspace_id = request.workspace_id
              AND report.request_id = request.id
              AND report.status IN ('open', 'reviewing')
         )
       )::int AS reported,
       COUNT(*) FILTER (WHERE request.moderation_status = 'suspended')::int AS suspended,
       COUNT(*) FILTER (
         WHERE request.status = 'awaiting_athlete'
            OR request.moderation_status = 'suspended'
            OR EXISTS (
              SELECT 1 FROM partner_athlete_introduction_reports report
               WHERE report.workspace_id = request.workspace_id
                 AND report.request_id = request.id
                 AND report.status IN ('open', 'reviewing')
            )
       )::int AS count,
       MIN(request.created_at) FILTER (
         WHERE request.status = 'awaiting_athlete'
            OR request.moderation_status = 'suspended'
            OR EXISTS (
              SELECT 1 FROM partner_athlete_introduction_reports report
               WHERE report.workspace_id = request.workspace_id
                 AND report.request_id = request.id
                 AND report.status IN ('open', 'reviewing')
            )
       ) AS oldest_at
     FROM contact_requests request
    WHERE request.workspace_id = $1
      AND request.request_kind = 'partner_athlete_introduction'`,
    [workspaceId, staleDays],
  );
  const row = rows[0] as Record<string, number | string> | undefined;
  const oldestAt = normalizeOldestAt(
    row?.oldest_at as string | Date | null | undefined,
  );
  const reported = Number(row?.reported ?? 0);
  const suspended = Number(row?.suspended ?? 0);
  const stale = Number(row?.stale ?? 0);
  return {
    id: "introductions",
    label: "Mises en relation",
    count: Number(row?.count ?? 0),
    priority: reported > 0 || suspended > 0 ? "urgente" : stale > 0 ? "haute" : "normale",
    oldestAt,
    ageLabel: ageLabelFor(oldestAt),
    href: "/ecosysteme",
    details: [
      { label: "En attente", count: Number(row?.awaiting ?? 0) },
      { label: "Sans réponse récente", count: stale },
      { label: "Signalées", count: reported },
      { label: "Suspendues", count: suspended },
    ],
  };
};

const countSportsWatch = async (workspaceId: string): Promise<TodayActionSummaryItem> => {
  const [totals, oldestAt] = await Promise.all([
    PostgresSportsWatchRepository.countCandidates(workspaceId),
    PostgresSportsWatchRepository.getOldestActiveCandidateAt?.(workspaceId)
      ?? Promise.resolve(null),
  ]);
  const pending = Math.max(0, totals.pending - totals.supersededPending);
  const validated = Math.max(0, totals.validated - totals.supersededValidated);
  return {
    id: "sports-watch",
    label: "Sports Watch",
    count: pending + validated,
    actionCount: pending + validated,
    priority: pending > 0 ? "haute" : "normale",
    oldestAt,
    ageLabel: ageLabelFor(oldestAt),
    href: "/sports-watch",
    details: [
      { label: "À examiner", count: pending },
      { label: "À exploiter", count: validated },
    ],
  };
};

const actionSources = [
  ["Candidatures créatives", countCreativeApplications],
  ["Demandes Athlètes", countAthleteRequests],
  ["Séances", countSessionReviews],
  ["Missions", countCreativeMissions],
  ["Mises en relation", countIntroductions],
  ["Sports Watch", countSportsWatch],
] as const;

export const getTodayActionsSummary = async (workspaceId: string): Promise<TodayActionsSummary> => {
  const settled = await Promise.allSettled(
    actionSources.map(([, load]) => load(workspaceId)),
  );
  return settled.reduce<TodayActionsSummary>(
    (summary, result, index) => {
      if (result.status === "fulfilled") summary.items.push(result.value);
      else summary.errors.push(sourceError(actionSources[index][0]));
      return summary;
    },
    { items: [], errors: [] },
  );
};

export const getTodayDeadlines = async (workspaceId: string): Promise<TodayDeadline[]> => {
  const rows = await createContentStorageClient().query(
    `SELECT id, label, due_at, kind
       FROM (
         SELECT request.id::text AS id,
                COALESCE(NULLIF(request.opponent_or_event, ''), NULLIF(request.objective, ''), 'Séance Athlète') AS label,
                request.event_starts_at AS due_at,
                'Séance'::text AS kind
           FROM athlete_session_requests request
          WHERE request.workspace_id = $1
            AND request.event_starts_at IS NOT NULL
            AND request.workflow_status NOT IN ('completed', 'cancelled', 'refused')
         UNION ALL
         SELECT mission.id::text,
                mission.title,
                mission.scheduled_at,
                'Mission'::text
           FROM creative_missions mission
          WHERE mission.workspace_id = $1
            AND mission.scheduled_at IS NOT NULL
            AND mission.business_state NOT IN ('completed', 'closed_without_action')
       ) deadlines
      WHERE due_at >= NOW()
      ORDER BY due_at ASC, id ASC
      LIMIT 5`,
    [workspaceId],
  );
  return rows.map((row) => {
    const value = row as { id: string; label: string; due_at: string | Date; kind: TodayDeadline["kind"] };
    return {
      id: `${value.kind}-${value.id}`,
      label: value.label,
      date: new Date(value.due_at).toISOString(),
      href: "/missions",
      kind: value.kind,
    };
  });
};
