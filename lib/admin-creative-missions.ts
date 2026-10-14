import {
  listAthleteServiceCreativeAssignments,
  type AthleteServiceCreativeAssignment,
} from "@/lib/athlete-service-creative-assignments";
import {
  listAthleteServiceMissions,
} from "@/lib/athlete-service-missions";
import type { AthleteServiceMissionRecord } from "@/lib/athlete-service-mission-domain";
import {
  listAdminAthleteServiceRequests,
  type AdminAthleteServiceRequest,
} from "@/lib/athlete-service-requests";
import {
  listAdminCreativeMissionExecutions,
  type AdminCreativeMissionExecutionSummary,
  type CreativeMissionExecutionStatus,
} from "@/lib/creative-mission-execution";

export type AdminCreativeMissionQueueStatus =
  | "to_prepare"
  | "to_assign"
  | "awaiting_creative"
  | "in_progress"
  | "delivery_review"
  | "changes_requested"
  | "completed"
  | "cancelled";

export type AdminCreativeMissionResponseStatus = "pending" | "accepted" | "refused";

export type AdminCreativeMissionListItem = {
  requestId: string;
  athleteId: string;
  reference: string | null;
  title: string;
  discipline: string | null;
  missionDate: string | null;
  startTime: string | null;
  locationName: string | null;
  creative: {
    id: string;
    displayName: string;
  } | null;
  missionStatus: "draft" | "ready" | "cancelled" | null;
  responseStatus: AdminCreativeMissionResponseStatus;
  executionStatus: CreativeMissionExecutionStatus | null;
  queueStatus: AdminCreativeMissionQueueStatus;
  nextAction: string;
  lastUpdatedAt: string;
};

type AdminCreativeMissionDependencies = {
  listRequests: (input: { workspaceId: string }) => Promise<AdminAthleteServiceRequest[]>;
  listMissions: (input: { workspaceId: string }) => Promise<AthleteServiceMissionRecord[]>;
  listAssignments: (input: { workspaceId: string }) => Promise<AthleteServiceCreativeAssignment[]>;
  listExecutions: (input: { workspaceId: string }) => Promise<AdminCreativeMissionExecutionSummary[]>;
};

const defaultDependencies: AdminCreativeMissionDependencies = {
  listRequests: listAdminAthleteServiceRequests,
  listMissions: listAthleteServiceMissions,
  listAssignments: listAthleteServiceCreativeAssignments,
  listExecutions: listAdminCreativeMissionExecutions,
};

const queuePriority: Record<AdminCreativeMissionQueueStatus, number> = {
  delivery_review: 0,
  to_prepare: 1,
  to_assign: 2,
  awaiting_creative: 3,
  changes_requested: 4,
  in_progress: 5,
  completed: 6,
  cancelled: 7,
};

const responseStatus = (
  record: AthleteServiceMissionRecord,
): AdminCreativeMissionResponseStatus => {
  const state = record.creativeResponse?.state;
  return state === "accepted" || state === "refused" ? state : "pending";
};

const resolveOperationalState = ({
  record,
  assignment,
  execution,
}: {
  record: AthleteServiceMissionRecord;
  assignment: AthleteServiceCreativeAssignment | null;
  execution: AdminCreativeMissionExecutionSummary | null;
}): Pick<AdminCreativeMissionListItem, "queueStatus" | "nextAction" | "executionStatus"> => {
  const mission = record.mission;
  if (mission?.status === "cancelled") {
    return { queueStatus: "cancelled", nextAction: "Aucune action", executionStatus: execution?.status ?? null };
  }
  if (!mission) {
    return { queueStatus: "to_prepare", nextAction: "Préparer la mission", executionStatus: null };
  }
  if (mission.status === "draft") {
    return { queueStatus: "to_prepare", nextAction: "Finaliser la fiche mission", executionStatus: null };
  }
  if (!assignment?.creative) {
    return { queueStatus: "to_assign", nextAction: "Affecter un créatif", executionStatus: null };
  }

  const response = responseStatus(record);
  if (response === "refused") {
    return { queueStatus: "to_assign", nextAction: "Réaffecter la mission", executionStatus: null };
  }
  if (response === "pending") {
    return { queueStatus: "awaiting_creative", nextAction: "Attendre la réponse du créatif", executionStatus: null };
  }

  const executionStatus = execution?.status ?? "accepted";
  if (executionStatus === "delivered") {
    return { queueStatus: "delivery_review", nextAction: "Vérifier la livraison", executionStatus };
  }
  if (executionStatus === "changes_requested") {
    return { queueStatus: "changes_requested", nextAction: "Attendre les modifications", executionStatus };
  }
  if (executionStatus === "completed") {
    return { queueStatus: "completed", nextAction: "Aucune action", executionStatus };
  }
  return {
    queueStatus: "in_progress",
    nextAction: executionStatus === "accepted"
      ? "Attendre le démarrage du créatif"
      : "Attendre la livraison",
    executionStatus,
  };
};

const latestTimestamp = (values: Array<string | null | undefined>): string => {
  const valid = values
    .filter((value): value is string => (
      typeof value === "string" && !Number.isNaN(new Date(value).getTime())
    ))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime());
  return valid[0] ?? new Date(0).toISOString();
};

export const buildAdminCreativeMissionList = ({
  requests,
  records,
  assignments,
  executions,
}: {
  requests: AdminAthleteServiceRequest[];
  records: AthleteServiceMissionRecord[];
  assignments: AthleteServiceCreativeAssignment[];
  executions: AdminCreativeMissionExecutionSummary[];
}): AdminCreativeMissionListItem[] => {
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const assignmentByRequest = new Map(assignments.map((assignment) => [assignment.requestId, assignment]));
  const executionByRequest = new Map(executions.map((execution) => [execution.requestId, execution]));

  return records
    .map((record) => {
      const request = requestById.get(record.requestId);
      const assignment = assignmentByRequest.get(record.requestId) ?? null;
      const candidateExecution = executionByRequest.get(record.requestId) ?? null;
      const execution = candidateExecution?.creativeProfileId === assignment?.creative?.id
        ? candidateExecution
        : null;
      const operationalState = resolveOperationalState({ record, assignment, execution });
      const mission = record.mission;
      return {
        requestId: record.requestId,
        athleteId: record.athleteId,
        reference: mission?.referenceCode ?? null,
        title: mission?.title ?? record.productName,
        discipline: mission?.sportDiscipline ?? null,
        missionDate: mission?.missionDate ?? null,
        startTime: mission?.startTime ?? null,
        locationName: mission?.locationName ?? null,
        creative: assignment?.creative
          ? { id: assignment.creative.id, displayName: assignment.creative.displayName }
          : null,
        missionStatus: mission?.status ?? null,
        responseStatus: responseStatus(record),
        ...operationalState,
        lastUpdatedAt: latestTimestamp([
          mission?.updatedAt,
          record.creativeResponse?.respondedAt,
          execution?.updatedAt,
          assignment?.history[0]?.createdAt,
          request?.completedAt,
          request?.startedAt,
          request?.scheduledAt,
          request?.refusedAt,
          request?.requestedAt,
        ]),
      };
    })
    .sort((left, right) => (
      queuePriority[left.queueStatus] - queuePriority[right.queueStatus]
      || (left.missionDate ?? "9999-12-31").localeCompare(right.missionDate ?? "9999-12-31")
      || left.title.localeCompare(right.title, "fr")
    ));
};

export const listAdminCreativeMissions = async ({
  workspaceId,
  dependencies = defaultDependencies,
}: {
  workspaceId: string;
  dependencies?: AdminCreativeMissionDependencies;
}): Promise<AdminCreativeMissionListItem[]> => {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) throw new Error("workspaceId est requis.");
  const scope = { workspaceId: normalizedWorkspaceId };
  const [requests, records, assignments, executions] = await Promise.all([
    dependencies.listRequests(scope),
    dependencies.listMissions(scope),
    dependencies.listAssignments(scope),
    dependencies.listExecutions(scope),
  ]);
  return buildAdminCreativeMissionList({ requests, records, assignments, executions });
};
