import type { AthleteSessionRequest } from "@/lib/athlete-session-requests";
import type { CanonicalCreativeMission } from "@/lib/canonical-creative-missions";
import {
  missionJourneyStatusPresentation,
  type MissionJourneyActor,
  type MissionJourneyStatus,
} from "@/lib/status-presentation";
import type { ProductionCreativeBrief } from "@/types/production-creative";

export type MissionJourneyStage =
  | "request_received"
  | "request_reviewed"
  | "mission_to_organize"
  | "proposal_sent"
  | "creative_response"
  | "creative_assigned"
  | "mission_confirmed"
  | "mission_in_progress"
  | "delivery_received"
  | "changes_requested"
  | "historical_regularization"
  | "known_realization"
  | "completed"
  | "refused"
  | "cancelled"
  | "closed_without_action";

export type MissionJourneyTimelineItem = {
  id: string;
  stage: MissionJourneyStage;
  label: string;
  description: string;
  status: "completed" | "current" | "next";
  occurredAt: string | null;
};

export type MissionJourneyProjection = {
  status: MissionJourneyStatus;
  label: string;
  description: string;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
  expectedActor: MissionJourneyActor;
  nextAction: string;
  timeline: MissionJourneyTimelineItem[];
  warnings: string[];
};

export type AthleteMissionJourney = MissionJourneyProjection & {
  id: string;
  title: string;
  requestType: AthleteSessionRequest["requestType"];
  scheduledAt: string | null;
  region: string;
  objective: string;
  adminMessage: string | null;
  complementRequired: boolean;
  canCancel: boolean;
};

const stageCopy: Record<MissionJourneyStage, { label: string; description: string }> = {
  request_received: {
    label: "Demande reçue",
    description: "La demande a été enregistrée.",
  },
  request_reviewed: {
    label: "Demande examinée",
    description: "KLIQUE a examiné la demande.",
  },
  mission_to_organize: {
    label: "Mission à organiser",
    description: "Les modalités opérationnelles doivent être préparées.",
  },
  proposal_sent: {
    label: "Proposition envoyée",
    description: "La proposition a été transmise au réseau créatif.",
  },
  creative_response: {
    label: "Réponse du Créatif",
    description: "Une réponse ou une candidature a été reçue.",
  },
  creative_assigned: {
    label: "Créatif affecté",
    description: "Un Créatif a été retenu pour la mission.",
  },
  mission_confirmed: {
    label: "Mission confirmée",
    description: "La prise en charge de la mission est confirmée.",
  },
  mission_in_progress: {
    label: "Mission en cours",
    description: "La réalisation est en cours.",
  },
  delivery_received: {
    label: "Livraison reçue",
    description: "Une livraison a été transmise.",
  },
  changes_requested: {
    label: "Modifications demandées",
    description: "Une nouvelle version est attendue.",
  },
  historical_regularization: {
    label: "Régularisation historique",
    description: "L’entrée a été rapprochée de l’historique existant.",
  },
  known_realization: {
    label: "Réalisation connue",
    description: "La réalisation est attestée par la donnée historique disponible.",
  },
  completed: {
    label: "Mission terminée",
    description: "Le parcours est terminé.",
  },
  refused: {
    label: "Refusée",
    description: "La demande ou la proposition a été refusée.",
  },
  cancelled: {
    label: "Annulée",
    description: "La mission a été annulée.",
  },
  closed_without_action: {
    label: "Classée sans suite",
    description: "Le parcours a été classé sans suite.",
  },
};

const timelineItem = (
  id: string,
  stage: MissionJourneyStage,
  status: MissionJourneyTimelineItem["status"],
  occurredAt: string | null,
): MissionJourneyTimelineItem => ({
  id,
  stage,
  ...stageCopy[stage],
  status,
  occurredAt,
});

const canonicalStatus: Record<CanonicalCreativeMission["state"], MissionJourneyStatus> = {
  review: "request_review",
  organize: "mission_to_organize",
  proposed: "proposal_sent",
  confirmation_pending: "creative_assigned",
  confirmed: "mission_confirmed",
  in_progress: "mission_in_progress",
  review_delivery: "delivery_received",
  changes_requested: "changes_requested",
  completed: "completed",
  closed_without_action: "closed_without_action",
  cancelled: "cancelled",
};

const currentStage: Record<MissionJourneyStatus, MissionJourneyStage> = {
  request_review: "request_received",
  mission_to_organize: "mission_to_organize",
  proposal_sent: "proposal_sent",
  creative_response: "creative_response",
  creative_assigned: "creative_assigned",
  mission_confirmed: "mission_confirmed",
  mission_in_progress: "mission_in_progress",
  delivery_received: "delivery_received",
  changes_requested: "changes_requested",
  completed: "completed",
  refused: "refused",
  cancelled: "cancelled",
  closed_without_action: "closed_without_action",
};

const nextStage: Partial<Record<MissionJourneyStatus, MissionJourneyStage>> = {
  request_review: "request_reviewed",
  mission_to_organize: "proposal_sent",
  proposal_sent: "creative_response",
  creative_response: "creative_assigned",
  creative_assigned: "mission_confirmed",
  mission_confirmed: "mission_in_progress",
  mission_in_progress: "delivery_received",
  delivery_received: "completed",
  changes_requested: "delivery_received",
};

const presentation = (
  status: MissionJourneyStatus,
): Omit<MissionJourneyProjection, "status" | "timeline" | "warnings"> =>
  missionJourneyStatusPresentation[status];

const sourceActionStage = (action: unknown): MissionJourneyStage | null => {
  if (typeof action !== "string") return null;
  const stages: Record<string, MissionJourneyStage> = {
    submitted: "request_received",
    start_review: "request_reviewed",
    accepted: "mission_to_organize",
    production_linked: "mission_to_organize",
    brief_created: "mission_to_organize",
    brief_published: "proposal_sent",
    proposed_to_creatives: "proposal_sent",
    application_submitted: "creative_response",
    creative_application_received: "creative_response",
    creative_assigned: "creative_assigned",
    assignment_confirmed: "mission_confirmed",
    final_confirmation: "mission_confirmed",
    delivery_submitted: "delivery_received",
    delivery_changes_requested: "changes_requested",
    request_changes: "changes_requested",
    delivery_validated: "completed",
    mission_completed: "completed",
    refused: "refused",
    creative_refused: "refused",
    assignment_refused: "refused",
    cancel: "cancelled",
    cancelled: "cancelled",
    closed_without_action: "closed_without_action",
  };
  return stages[action] ?? null;
};

const stageFromCanonicalEvent = (
  event: CanonicalCreativeMission["events"][number],
): MissionJourneyStage | null => {
  if (event.action === "admin_mission_created") return "mission_to_organize";
  if (event.action === "closed_without_action") return "closed_without_action";
  if (event.action === "source_event") {
    return sourceActionStage(event.details?.sourceAction);
  }
  if (event.action === "production_projection_updated") {
    const briefStatus = event.details?.briefStatus;
    if (briefStatus === "published") return "proposal_sent";
    if (briefStatus === "assigned") return "creative_assigned";
    if (briefStatus === "cancelled") return "cancelled";
    if (briefStatus === "draft") return "mission_to_organize";
  }
  if (event.action === "assignment_projection_updated") {
    const deliveryStatus = event.details?.deliveryStatus;
    const confirmationStatus = event.details?.confirmationStatus;
    const assignmentStatus = event.details?.assignmentStatus;
    if (deliveryStatus === "validated") return "completed";
    if (deliveryStatus === "changes_requested") return "changes_requested";
    if (deliveryStatus === "delivered") return "delivery_received";
    if (confirmationStatus === "confirmed") return "mission_confirmed";
    if (assignmentStatus === "active") return "creative_assigned";
  }
  return sourceActionStage(event.action);
};

const withCurrentAndNext = (
  status: MissionJourneyStatus,
  completed: MissionJourneyTimelineItem[],
): MissionJourneyTimelineItem[] => {
  const current = currentStage[status];
  const lastCurrentIndex = completed.map((item) => item.stage).lastIndexOf(current);
  const timeline = completed.map((item, index) => (
    index === lastCurrentIndex ? { ...item, status: "current" as const } : item
  ));
  if (lastCurrentIndex < 0) {
    timeline.push(timelineItem(`current:${current}`, current, "current", null));
  }
  const next = nextStage[status];
  if (next) timeline.push(timelineItem(`next:${next}`, next, "next", null));
  return timeline;
};

const canonicalWarnings = (mission: CanonicalCreativeMission): string[] => {
  const warnings: string[] = [];
  if (mission.athletes.length === 0) warnings.push("Aucun Athlète n’est rattaché à la mission.");
  if (
    !mission.scheduledAt
    && !mission.occurredAt
    && !["review", "closed_without_action", "cancelled"].includes(mission.state)
  ) {
    warnings.push("La date de mission est manquante.");
  }
  if (
    !mission.creative
    && ["confirmation_pending", "confirmed", "in_progress", "review_delivery", "changes_requested", "completed"].includes(mission.state)
    && mission.regularizationStatus === "none"
  ) {
    warnings.push("Aucun Créatif n’est rattaché à cet état.");
  }
  if (
    ["proposed", "confirmation_pending", "confirmed", "in_progress", "review_delivery", "changes_requested", "completed"].includes(mission.state)
    && mission.regularizationStatus === "none"
    && !mission.sources.some((source) => source.type === "production_brief")
  ) {
    warnings.push("Le brief Production source est manquant.");
  }
  if (mission.state === "completed" && !mission.occurredAt) {
    warnings.push("La mission est terminée sans date de réalisation connue.");
  }
  const latestStateEvent = [...mission.events]
    .reverse()
    .find((event) => event.fromState !== event.toState);
  if (latestStateEvent && latestStateEvent.toState !== mission.state) {
    warnings.push("Le dernier événement métier contredit l’état actuel.");
  }
  return warnings;
};

export const projectCanonicalMissionJourney = (
  mission: CanonicalCreativeMission,
): MissionJourneyProjection => {
  const status = canonicalStatus[mission.state];
  const base = presentation(status);
  if (mission.regularizationStatus !== "none") {
    const terminalStage = mission.regularizationStatus === "historical_completed"
      ? "completed"
      : "closed_without_action";
    return {
      status,
      ...base,
      timeline: [
        timelineItem(
          `regularization:${mission.id}`,
          "historical_regularization",
          "completed",
          mission.events[0]?.createdAt ?? null,
        ),
        timelineItem(
          `realization:${mission.id}`,
          "known_realization",
          "completed",
          mission.occurredAt,
        ),
        timelineItem(
          `terminal:${mission.id}`,
          terminalStage,
          "current",
          mission.occurredAt,
        ),
      ],
      warnings: [],
    };
  }

  const completed = mission.events.flatMap((event, index) => {
    const stage = stageFromCanonicalEvent(event);
    return stage
      ? [timelineItem(`${event.action}:${event.createdAt}:${index}`, stage, "completed", event.createdAt)]
      : [];
  });
  return {
    status,
    ...base,
    timeline: withCurrentAndNext(status, completed),
    warnings: canonicalWarnings(mission),
  };
};

const athleteStatus = (
  request: AthleteSessionRequest,
): MissionJourneyStatus => {
  if (request.workflowStatus === "refused") return "refused";
  if (request.workflowStatus === "cancelled") return "cancelled";
  if (request.workflowStatus === "changes_requested") return "changes_requested";
  if (request.workflowStatus === "completed" || request.deliveryStatus === "validated") {
    return "completed";
  }
  if (request.deliveryStatus === "delivered") return "delivery_received";
  if (request.deliveryStatus === "changes_requested") return "mission_in_progress";
  if (request.workflowStatus === "confirmed") return "mission_confirmed";
  if (["assigned", "creative_agreed"].includes(request.workflowStatus)) return "creative_assigned";
  if (request.workflowStatus === "candidate_received") return "creative_response";
  if (request.workflowStatus === "proposed_to_creatives") return "proposal_sent";
  if (["accepted", "production_linked"].includes(request.workflowStatus)) {
    return "mission_to_organize";
  }
  return "request_review";
};

const athleteStageFromEvent = (
  event: AthleteSessionRequest["events"][number],
): MissionJourneyStage | null =>
  sourceActionStage(event.action)
  ?? sourceActionStage(event.toStatus);

const athleteCopy: Partial<Record<
  MissionJourneyStatus,
  Pick<MissionJourneyProjection, "label" | "description" | "nextAction" | "expectedActor">
>> = {
  request_review: {
    label: "À examiner",
    description: "KLIQUE examine votre demande.",
    nextAction: "KLIQUE examine votre demande",
    expectedActor: "Admin",
  },
  mission_to_organize: {
    label: "À organiser",
    description: "KLIQUE organise la mission.",
    nextAction: "Nous organisons la mission",
    expectedActor: "Admin",
  },
  proposal_sent: {
    label: "Créatif recherché",
    description: "KLIQUE recherche le Créatif adapté.",
    nextAction: "Nous recherchons un Créatif",
    expectedActor: "Créatif",
  },
  creative_response: {
    label: "Créatif recherché",
    description: "KLIQUE étudie les réponses reçues.",
    nextAction: "Nous finalisons le choix du Créatif",
    expectedActor: "Admin",
  },
  creative_assigned: {
    label: "Créatif recherché",
    description: "La confirmation de la mission est en cours.",
    nextAction: "Nous confirmons les derniers détails",
    expectedActor: "Créatif",
  },
  mission_confirmed: {
    label: "Mission confirmée",
    description: "Votre séance est confirmée.",
    nextAction: "Votre séance est confirmée",
    expectedActor: "Créatif",
  },
  mission_in_progress: {
    label: "Réalisation en cours",
    description: "Vos contenus sont en préparation.",
    nextAction: "Vos contenus sont en préparation",
    expectedActor: "Créatif",
  },
  delivery_received: {
    label: "Livré",
    description: "La livraison est en cours de validation.",
    nextAction: "KLIQUE vérifie la livraison",
    expectedActor: "Admin",
  },
  changes_requested: {
    label: "À examiner — complément demandé",
    description: "KLIQUE attend votre complément.",
    nextAction: "Répondre à la demande de complément",
    expectedActor: "Athlète",
  },
  completed: {
    label: "Terminé",
    description: "La mission est terminée.",
    nextAction: "Aucune action",
    expectedActor: null,
  },
};

export const projectAthleteSessionJourney = (
  request: AthleteSessionRequest,
): AthleteMissionJourney => {
  const status = athleteStatus(request);
  const base = presentation(status);
  const roleCopy = athleteCopy[status];
  const completed = request.events.flatMap((event, index) => {
    const stage = athleteStageFromEvent(event);
    return stage
      ? [timelineItem(`${event.id}:${index}`, stage, "completed", event.createdAt)]
      : [];
  });
  return {
    id: request.id,
    title: request.requestType === "media_day"
      ? "Media Day"
      : [request.eventType, request.sport].filter(Boolean).join(" · ") || "Match ou compétition",
    requestType: request.requestType,
    scheduledAt: request.eventStartsAt ?? request.periods[0]?.startsAt ?? null,
    region: request.region,
    objective: request.objective,
    adminMessage: request.adminReason,
    complementRequired: request.workflowStatus === "changes_requested",
    canCancel: !["confirmed", "completed", "cancelled", "refused"].includes(request.workflowStatus),
    status,
    ...base,
    ...roleCopy,
    timeline: withCurrentAndNext(status, completed),
    warnings: [],
  };
};

const creativeStatus = (project: ProductionCreativeBrief): MissionJourneyStatus => {
  if (project.status === "cancelled") return "cancelled";
  if (!project.assignment) {
    return project.applicationStatus === "interested" || project.applicationStatus === "selected"
      ? "creative_response"
      : "proposal_sent";
  }
  if (project.assignment.deliveryStatus === "validated") return "completed";
  if (project.assignment.deliveryStatus === "changes_requested") return "changes_requested";
  if (project.assignment.deliveryStatus === "delivered") return "delivery_received";
  if (project.assignment.confirmationStatus === "confirmed") return "mission_in_progress";
  return "creative_assigned";
};

const creativeCopy: Partial<Record<MissionJourneyStatus, Pick<MissionJourneyProjection, "label" | "description" | "nextAction">>> = {
  proposal_sent: {
    label: "Proposition reçue",
    description: "KLIQUE vous propose cette mission.",
    nextAction: "Répondre à la proposition",
  },
  creative_response: {
    label: "Réponse envoyée",
    description: "Votre candidature a été transmise.",
    nextAction: "Attendre la décision de KLIQUE",
  },
  creative_assigned: {
    label: "Confirmation attendue",
    description: "La mission vous est attribuée sous réserve de votre confirmation.",
    nextAction: "Confirmer la prise en charge",
  },
  mission_in_progress: {
    label: "Livraison attendue",
    description: "La mission est confirmée et la livraison est attendue.",
    nextAction: "Transmettre la livraison",
  },
  delivery_received: {
    label: "Livraison transmise",
    description: "KLIQUE vérifie votre livraison.",
    nextAction: "Attendre la validation de KLIQUE",
  },
  changes_requested: {
    label: "Modifications demandées",
    description: "Une nouvelle livraison est attendue.",
    nextAction: "Transmettre une nouvelle version",
  },
  completed: {
    label: "Terminée",
    description: "La livraison a été validée.",
    nextAction: "Aucune action",
  },
};

export const projectCreativeMissionJourney = (
  project: ProductionCreativeBrief,
): MissionJourneyProjection => {
  const status = creativeStatus(project);
  const base = presentation(status);
  const roleCopy = creativeCopy[status];
  const persistedStages: MissionJourneyStage[] = ["proposal_sent"];
  if (["interested", "selected"].includes(project.applicationStatus)) {
    persistedStages.push("creative_response");
  }
  if (project.assignment) persistedStages.push("creative_assigned");
  if (project.assignment?.confirmationStatus === "confirmed") {
    persistedStages.push("mission_confirmed");
  }
  if (project.assignment?.deliveryStatus === "delivered") {
    persistedStages.push("delivery_received");
  }
  if (project.assignment?.deliveryStatus === "changes_requested") {
    persistedStages.push("changes_requested");
  }
  if (project.assignment?.deliveryStatus === "validated") {
    persistedStages.push("delivery_received", "completed");
  }
  return {
    status,
    ...base,
    ...roleCopy,
    timeline: withCurrentAndNext(
      status,
      persistedStages.map((stage, index) => (
        timelineItem(`persisted:${stage}:${index}`, stage, "completed", null)
      )),
    ),
    warnings: [],
  };
};
