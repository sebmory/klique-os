import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  calculateAthleteMembershipServiceSummary,
  type AthleteMembershipServiceSummaryProjection,
} from "@/lib/athlete-membership-service-summary";
import type { AthleteMembership } from "@/lib/athlete-memberships";
import type {
  AthleteCreditMovementSource,
  AthleteCreditType,
} from "@/lib/athlete-credits";
import type {
  AthleteServiceRequestFulfillmentMode,
  AthleteServiceRequestStatus,
} from "@/lib/athlete-service-requests";
import type { AssignmentCreativeSummary } from "@/lib/athlete-service-creative-assignments";

export type AthleteServicePlanningPriorityLevel = "urgent" | "plan" | "anticipate" | "future";
export type AthleteServicePlanningMissionState = "absent" | "draft" | "ready";

export type AthleteServicePlanningPriority = {
  athleteId: string;
  membershipId: string;
  endsAt: string;
  daysRemaining: number;
  level: AthleteServicePlanningPriorityLevel;
  availableTotal: number;
  remainingServices: Array<{
    creditType: AthleteCreditType;
    label: string;
    available: number;
  }>;
  assignedCreatives: AssignmentCreativeSummary[];
  missionState: AthleteServicePlanningMissionState;
};

export type AthleteServicePlanningPriorityProjection = {
  membership: AthleteMembership;
  projection: AthleteMembershipServiceSummaryProjection;
  assignedCreatives?: AssignmentCreativeSummary[];
  missionState?: AthleteServicePlanningMissionState;
};

export type AthleteServicePlanningPriorityRepository = {
  load: (input: {
    workspaceId: string;
    now: Date;
  }) => Promise<AthleteServicePlanningPriorityProjection[]>;
};

type PriorityRow = {
  id: string;
  workspace_id: string;
  athlete_id: string;
  membership_kind: AthleteMembership["membershipKind"];
  plan_code: string | null;
  status: AthleteMembership["status"];
  starts_at: string | Date;
  ends_at: string | Date;
  auto_renew: boolean;
  payment_installments: number | null;
  source: string;
  created_at: string | Date;
  updated_at: string | Date;
  movements: Array<{
    creditType: AthleteCreditType;
    quantity: number | string;
    source: AthleteCreditMovementSource;
    referenceId: string | null;
    expiresAt: string | null;
  }>;
  service_requests: Array<{
    status: AthleteServiceRequestStatus;
    fulfillmentMode: AthleteServiceRequestFulfillmentMode;
    creditType: AthleteCreditType | null;
    creditQuantity: number | string | null;
  }>;
  legacy_content: {
    quota: number | string;
    expiresAt: string;
    requests: Array<{
      id: string;
      status: "requested" | "accepted" | "in_progress" | "completed" | "declined" | "cancelled";
    }>;
  } | null;
  assigned_creatives: Array<{
    id: string;
    displayName: string;
    creativeType: AssignmentCreativeSummary["creativeType"];
    area: string;
  }>;
  mission_request_count: number | string;
  mission_missing_count: number | string;
  mission_draft_count: number | string;
  mission_ready_count: number | string;
};

const toIsoString = (value: string | Date): string => new Date(value).toISOString();

const createRepository = (): AthleteServicePlanningPriorityRepository => {
  const sql = createContentStorageClient();
  return {
    async load({ workspaceId, now }) {
      const rows = await sql`
        WITH active_memberships AS (
          SELECT membership.*
          FROM athlete_memberships membership
          WHERE membership.workspace_id = ${workspaceId}
            AND membership.status = 'active'
            AND membership.starts_at <= ${now.toISOString()}::timestamptz
            AND membership.ends_at > ${now.toISOString()}::timestamptz
        )
        SELECT membership.*,
               COALESCE(movement_projection.items, '[]'::jsonb) AS movements,
               COALESCE(request_projection.items, '[]'::jsonb) AS service_requests,
               COALESCE(assigned_creative_projection.items, '[]'::jsonb) AS assigned_creatives,
               COALESCE(mission_projection.request_count, 0) AS mission_request_count,
               COALESCE(mission_projection.missing_count, 0) AS mission_missing_count,
               COALESCE(mission_projection.draft_count, 0) AS mission_draft_count,
               COALESCE(mission_projection.ready_count, 0) AS mission_ready_count,
               CASE
                 WHEN legacy_projection.subscription_id IS NULL THEN NULL
                 ELSE jsonb_build_object(
                   'quota', legacy_projection.custom_contents_included,
                   'expiresAt', legacy_projection.ends_on,
                   'requests', legacy_projection.requests
                 )
               END AS legacy_content
        FROM active_memberships membership
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'creditType', movement.credit_type,
              'quantity', movement.quantity,
              'source', movement.source,
              'referenceId', movement.reference_id,
              'expiresAt', movement.expires_at
            )
            ORDER BY movement.created_at ASC, movement.id ASC
          ) AS items
          FROM athlete_credit_movements movement
          WHERE movement.workspace_id = ${workspaceId}
            AND movement.athlete_id = membership.athlete_id
            AND movement.membership_id = membership.id
        ) movement_projection ON TRUE
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'status', request.status,
              'fulfillmentMode', request.fulfillment_mode,
              'creditType', request.snapshot_credit_type,
              'creditQuantity', request.snapshot_credit_quantity
            )
            ORDER BY request.requested_at ASC, request.id ASC
          ) AS items
          FROM athlete_service_requests request
          WHERE request.workspace_id = ${workspaceId}
            AND request.athlete_id = membership.athlete_id
            AND (
              request.status IN ('received', 'to_confirm')
              OR (
                request.status IN ('scheduled', 'in_progress')
                AND request.fulfillment_mode IN ('included_right', 'paid_with_right')
              )
            )
        ) request_projection ON TRUE
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', assigned.id,
              'displayName', assigned.display_name,
              'creativeType', assigned.creative_type,
              'area', assigned.area
            )
            ORDER BY lower(assigned.display_name), assigned.id
          ) AS items
          FROM (
            SELECT DISTINCT creative.id, creative.display_name, creative.creative_type,
                   CASE
                     WHEN cardinality(creative.coverage_areas) > 0
                       THEN array_to_string(creative.coverage_areas, ', ')
                     WHEN NULLIF(concat_ws(', ', creative.city, creative.country), '') IS NOT NULL
                       THEN concat_ws(', ', creative.city, creative.country)
                     ELSE 'Zone non renseignée'
                   END AS area
            FROM athlete_service_requests request
            JOIN creative_profiles creative
              ON creative.workspace_id = request.workspace_id
             AND creative.id = request.assigned_creative_profile_id
            WHERE request.workspace_id = ${workspaceId}
              AND request.athlete_id = membership.athlete_id
              AND request.status IN ('received', 'to_confirm', 'scheduled', 'in_progress')
          ) assigned
        ) assigned_creative_projection ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS request_count,
                 COUNT(*) FILTER (
                   WHERE mission.id IS NULL OR mission.status = 'cancelled'
                 ) AS missing_count,
                 COUNT(*) FILTER (WHERE mission.status = 'draft') AS draft_count,
                 COUNT(*) FILTER (WHERE mission.status = 'ready') AS ready_count
          FROM athlete_service_requests request
          LEFT JOIN athlete_service_request_missions mission
            ON mission.workspace_id = request.workspace_id
           AND mission.service_request_id = request.id
          WHERE request.workspace_id = ${workspaceId}
            AND request.athlete_id = membership.athlete_id
            AND request.status IN ('received', 'to_confirm', 'scheduled', 'in_progress')
        ) mission_projection ON TRUE
        LEFT JOIN LATERAL (
          SELECT selected.id AS subscription_id,
                 selected.custom_contents_included,
                 selected.ends_on,
                 COALESCE(
                   jsonb_agg(
                     jsonb_build_object('id', request.id, 'status', request.status)
                     ORDER BY request.created_at ASC, request.id ASC
                   ) FILTER (WHERE request.id IS NOT NULL),
                   '[]'::jsonb
                 ) AS requests
          FROM (
            SELECT subscription.id, subscription.custom_contents_included, subscription.ends_on
            FROM athlete_subscriptions subscription
            WHERE subscription.workspace_id = ${workspaceId}
              AND subscription.athlete_id = membership.athlete_id
              AND (
                subscription.membership_id = membership.id
                OR (
                  subscription.membership_id IS NULL
                  AND subscription.starts_on <= membership.ends_at
                  AND subscription.ends_on >= membership.starts_at
                )
              )
            ORDER BY
              CASE WHEN subscription.membership_id = membership.id THEN 0 ELSE 1 END,
              subscription.starts_on DESC,
              subscription.created_at DESC
            LIMIT 1
          ) selected
          LEFT JOIN athlete_subscription_content_requests request
            ON request.workspace_id = ${workspaceId}
           AND request.athlete_id = membership.athlete_id
           AND request.subscription_id = selected.id
          GROUP BY selected.id, selected.custom_contents_included, selected.ends_on
        ) legacy_projection ON TRUE
        ORDER BY membership.ends_at ASC, membership.id ASC
      `;

      return (rows as PriorityRow[]).map((row) => ({
        membership: {
          id: row.id,
          workspaceId: row.workspace_id,
          athleteId: row.athlete_id,
          membershipKind: row.membership_kind,
          planCode: row.plan_code,
          status: row.status,
          startsAt: toIsoString(row.starts_at),
          endsAt: toIsoString(row.ends_at),
          autoRenew: row.auto_renew,
          paymentInstallments: row.payment_installments,
          source: row.source,
          createdAt: toIsoString(row.created_at),
          updatedAt: toIsoString(row.updated_at),
        },
        projection: {
          movements: row.movements.map((movement) => ({
            ...movement,
            quantity: Number(movement.quantity),
            expiresAt: movement.expiresAt ? toIsoString(movement.expiresAt) : null,
          })),
          serviceRequests: row.service_requests.map((request) => ({
            ...request,
            creditQuantity: request.creditQuantity === null ? null : Number(request.creditQuantity),
          })),
          legacyContent: row.legacy_content
            ? {
                quota: Number(row.legacy_content.quota),
                expiresAt: toIsoString(row.legacy_content.expiresAt),
                requests: row.legacy_content.requests,
              }
            : null,
          purchases: [],
        },
        assignedCreatives: row.assigned_creatives,
        missionState: Number(row.mission_request_count) === 0
          || Number(row.mission_missing_count) > 0
          ? "absent"
          : Number(row.mission_draft_count) > 0
            ? "draft"
            : "ready",
      }));
    },
  };
};

const getPriorityLevel = (daysRemaining: number): AthleteServicePlanningPriorityLevel => {
  if (daysRemaining <= 30) return "urgent";
  if (daysRemaining <= 90) return "plan";
  if (daysRemaining <= 180) return "anticipate";
  return "future";
};

export const calculateAthleteServicePlanningPriorities = ({
  projections,
  now,
}: {
  projections: AthleteServicePlanningPriorityProjection[];
  now: Date;
}): AthleteServicePlanningPriority[] => projections
  .flatMap(({ membership, projection, assignedCreatives = [], missionState = "absent" }) => {
    const summary = calculateAthleteMembershipServiceSummary({ membership, projection, now });
    const remainingServices = summary.included
      .filter((service) => service.available > 0)
      .map(({ creditType, label, available }) => ({ creditType, label, available }));
    const availableTotal = remainingServices.reduce((total, service) => total + service.available, 0);

    if (!membership.endsAt || summary.expiresInDays === null || availableTotal === 0) return [];
    const level = getPriorityLevel(summary.expiresInDays);
    return [{
      athleteId: membership.athleteId,
      membershipId: membership.id,
      endsAt: membership.endsAt,
      daysRemaining: summary.expiresInDays!,
      level,
      availableTotal,
      remainingServices,
      assignedCreatives,
      missionState,
    }];
  })
  .sort((left, right) => (
    new Date(left.endsAt).getTime() - new Date(right.endsAt).getTime()
    || right.availableTotal - left.availableTotal
    || left.membershipId.localeCompare(right.membershipId)
  ));

export const listAthleteServicePlanningPriorities = async ({
  workspaceId,
  now = new Date(),
  limit = 8,
  repository = createRepository(),
}: {
  workspaceId: string;
  now?: Date;
  limit?: number;
  repository?: AthleteServicePlanningPriorityRepository;
}): Promise<AthleteServicePlanningPriority[]> => {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) throw new Error("workspaceId est requis.");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit est invalide.");

  const projections = await repository.load({ workspaceId: normalizedWorkspaceId, now });
  if (projections.some(({ membership }) => membership.workspaceId !== normalizedWorkspaceId)) {
    throw new Error("Une adhésion ne correspond pas au workspace demandé.");
  }
  return calculateAthleteServicePlanningPriorities({ projections, now }).slice(0, limit);
};
