import type {
  AdminCreativeMissionQueueStatus,
  AdminCreativeMissionResponseStatus,
} from "@/lib/admin-creative-missions";
import type { AthleteServiceRequestStatus } from "@/lib/athlete-service-requests";
import type { CreativeApplicationModerationStatus } from "@/lib/creatives/applications-sheet";
import type {
  PartnerAthleteIntroductionModerationStatus,
  PartnerAthleteIntroductionStatus,
} from "@/lib/partner-athlete-introductions/contracts";
import type { SportsWatchAdminStatus } from "@/types/sports-watch";
import type { AthleteMonthReminderStatus } from "@/lib/athlete-month-reminder";

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export type StatusPresentation = {
  label: string;
  tone: StatusTone;
  description: string;
  nextAction: string;
  iconToken?: "clock" | "check" | "alert" | "play" | "archive";
};

export type MissionJourneyActor = "Admin" | "Athlète" | "Créatif" | null;

export type MissionJourneyStatus =
  | "request_review"
  | "mission_to_organize"
  | "proposal_sent"
  | "creative_response"
  | "creative_assigned"
  | "mission_confirmed"
  | "mission_in_progress"
  | "delivery_received"
  | "changes_requested"
  | "completed"
  | "refused"
  | "cancelled"
  | "closed_without_action";

export type MissionJourneyStatusPresentation = StatusPresentation & {
  expectedActor: MissionJourneyActor;
};

const definePresentations = <Status extends string>(
  values: Record<Status, StatusPresentation>,
): Record<Status, StatusPresentation> => values;

export const athleteRequestStatusPresentation = definePresentations<AthleteServiceRequestStatus>({
  received: { label: "Reçue", tone: "warning", description: "La demande attend une première lecture.", nextAction: "Examiner la demande", iconToken: "clock" },
  to_confirm: { label: "À confirmer", tone: "warning", description: "La demande attend une décision.", nextAction: "Confirmer ou refuser", iconToken: "alert" },
  scheduled: { label: "Planifiée", tone: "info", description: "La réalisation est planifiée.", nextAction: "Préparer la réalisation", iconToken: "clock" },
  in_progress: { label: "En cours", tone: "info", description: "La réalisation a commencé.", nextAction: "Suivre l’avancement", iconToken: "play" },
  completed: { label: "Terminée", tone: "success", description: "La demande est réalisée.", nextAction: "Aucune action", iconToken: "check" },
  refused: { label: "Refusée", tone: "neutral", description: "La demande a été refusée.", nextAction: "Aucune action", iconToken: "archive" },
});

export const creativeMissionQueueStatusPresentation = definePresentations<AdminCreativeMissionQueueStatus>({
  to_prepare: { label: "À préparer", tone: "warning", description: "La mission doit être préparée.", nextAction: "Préparer la mission", iconToken: "alert" },
  to_assign: { label: "À attribuer", tone: "warning", description: "Aucun créatif n’est encore attribué.", nextAction: "Attribuer un créatif", iconToken: "alert" },
  awaiting_creative: { label: "Réponse attendue", tone: "info", description: "Le créatif doit répondre.", nextAction: "Suivre la réponse", iconToken: "clock" },
  in_progress: { label: "En cours", tone: "info", description: "La mission est en réalisation.", nextAction: "Suivre la réalisation", iconToken: "play" },
  delivery_review: { label: "Livraison à vérifier", tone: "warning", description: "Une livraison attend la validation Admin.", nextAction: "Vérifier la livraison", iconToken: "alert" },
  changes_requested: { label: "Modifications demandées", tone: "info", description: "Le créatif prépare une nouvelle livraison.", nextAction: "Suivre les modifications", iconToken: "clock" },
  completed: { label: "Terminée", tone: "success", description: "La mission est terminée.", nextAction: "Aucune action", iconToken: "check" },
  cancelled: { label: "Annulée", tone: "neutral", description: "La mission est annulée.", nextAction: "Aucune action", iconToken: "archive" },
});

export const creativeMissionResponseStatusPresentation = definePresentations<AdminCreativeMissionResponseStatus>({
  pending: { label: "Réponse attendue", tone: "info", description: "Le créatif n’a pas encore répondu.", nextAction: "Suivre la réponse", iconToken: "clock" },
  accepted: { label: "Acceptée", tone: "success", description: "Le créatif a accepté la mission.", nextAction: "Préparer la réalisation", iconToken: "check" },
  refused: { label: "Refusée", tone: "warning", description: "Le créatif a refusé la mission.", nextAction: "Attribuer un autre créatif", iconToken: "alert" },
});

export const creativeApplicationStatusPresentation = definePresentations<CreativeApplicationModerationStatus>({
  pending: { label: "À valider", tone: "warning", description: "La candidature attend une décision.", nextAction: "Examiner la candidature", iconToken: "clock" },
  approved: { label: "Acceptée", tone: "success", description: "La candidature est acceptée.", nextAction: "Préparer l’accès", iconToken: "check" },
  rejected: { label: "Refusée", tone: "neutral", description: "La candidature est refusée.", nextAction: "Aucune action", iconToken: "archive" },
});

export const partnerIntroductionStatusPresentation = definePresentations<PartnerAthleteIntroductionStatus>({
  awaiting_athlete: { label: "Réponse athlète attendue", tone: "warning", description: "L’athlète doit répondre à la demande.", nextAction: "Suivre la demande", iconToken: "clock" },
  accepted: { label: "Acceptée", tone: "success", description: "La mise en relation est acceptée.", nextAction: "Aucune action", iconToken: "check" },
  declined: { label: "Refusée", tone: "neutral", description: "La mise en relation est refusée.", nextAction: "Aucune action", iconToken: "archive" },
});

export const partnerIntroductionModerationStatusPresentation = definePresentations<PartnerAthleteIntroductionModerationStatus>({
  clear: { label: "Active", tone: "success", description: "La demande suit son cours.", nextAction: "Suivre la demande", iconToken: "check" },
  suspended: { label: "Suspendue", tone: "danger", description: "La demande nécessite une décision Admin.", nextAction: "Examiner la suspension", iconToken: "alert" },
});

export const sportsWatchStatusPresentation = definePresentations<SportsWatchAdminStatus>({
  pending: { label: "À vérifier", tone: "warning", description: "Le résultat attend une décision.", nextAction: "Examiner le résultat", iconToken: "clock" },
  validated: { label: "À exploiter", tone: "success", description: "Le résultat est prêt à être utilisé.", nextAction: "Créer ou enrichir un contenu", iconToken: "check" },
  exploited: { label: "Exploité", tone: "success", description: "Le résultat a été utilisé.", nextAction: "Aucune action", iconToken: "check" },
  rejected: { label: "Rejeté", tone: "neutral", description: "Le résultat a été refusé.", nextAction: "Aucune action", iconToken: "archive" },
  dismissed: { label: "Non exploitée", tone: "neutral", description: "Le résultat a été écarté.", nextAction: "Aucune action", iconToken: "archive" },
});

export const athleteMonthVoteStatusPresentation = definePresentations<AthleteMonthReminderStatus>({
  prepare: { label: "À préparer", tone: "warning", description: "Le vote du mois récompensé doit être préparé.", nextAction: "Sélectionner les nominés", iconToken: "clock" },
  draft: { label: "Brouillon", tone: "warning", description: "Le vote est commencé mais pas encore prêt.", nextAction: "Finaliser les nominations", iconToken: "alert" },
  published: { label: "En cours", tone: "info", description: "Le vote est ouvert avec trois nominés.", nextAction: "Suivre le vote", iconToken: "play" },
  announce: { label: "À annoncer", tone: "warning", description: "Le vainqueur du mois récompensé doit être annoncé.", nextAction: "Désigner le vainqueur", iconToken: "clock" },
  overdue: { label: "En retard", tone: "danger", description: "La date cible d’annonce est dépassée.", nextAction: "Annoncer le vainqueur", iconToken: "alert" },
});

export const missionJourneyStatusPresentation: Record<
  MissionJourneyStatus,
  MissionJourneyStatusPresentation
> = {
  request_review: {
    label: "Demande à examiner",
    tone: "warning",
    description: "La demande attend une décision de KLIQUE.",
    expectedActor: "Admin",
    nextAction: "Examiner la demande",
    iconToken: "clock",
  },
  mission_to_organize: {
    label: "Mission à organiser",
    tone: "warning",
    description: "Les modalités et le Créatif doivent être préparés.",
    expectedActor: "Admin",
    nextAction: "Organiser la mission",
    iconToken: "alert",
  },
  proposal_sent: {
    label: "Proposition envoyée",
    tone: "info",
    description: "La proposition attend une réponse du réseau créatif.",
    expectedActor: "Créatif",
    nextAction: "Répondre à la proposition",
    iconToken: "clock",
  },
  creative_response: {
    label: "Réponse reçue",
    tone: "warning",
    description: "Une réponse créative attend la décision de KLIQUE.",
    expectedActor: "Admin",
    nextAction: "Choisir le Créatif",
    iconToken: "alert",
  },
  creative_assigned: {
    label: "Créatif affecté",
    tone: "info",
    description: "Le Créatif retenu doit confirmer les conditions.",
    expectedActor: "Créatif",
    nextAction: "Confirmer la prise en charge",
    iconToken: "clock",
  },
  mission_confirmed: {
    label: "Mission confirmée",
    tone: "success",
    description: "La mission est confirmée et peut être réalisée.",
    expectedActor: "Créatif",
    nextAction: "Réaliser la mission",
    iconToken: "check",
  },
  mission_in_progress: {
    label: "Mission en cours",
    tone: "info",
    description: "La réalisation ou la préparation des contenus est en cours.",
    expectedActor: "Créatif",
    nextAction: "Transmettre la livraison",
    iconToken: "play",
  },
  delivery_received: {
    label: "Livraison reçue",
    tone: "warning",
    description: "La livraison attend la validation de KLIQUE.",
    expectedActor: "Admin",
    nextAction: "Vérifier la livraison",
    iconToken: "alert",
  },
  changes_requested: {
    label: "Modifications demandées",
    tone: "info",
    description: "Une nouvelle version est attendue.",
    expectedActor: "Créatif",
    nextAction: "Transmettre une nouvelle version",
    iconToken: "clock",
  },
  completed: {
    label: "Terminée",
    tone: "success",
    description: "La mission est terminée.",
    expectedActor: null,
    nextAction: "Aucune action",
    iconToken: "check",
  },
  refused: {
    label: "Refusée",
    tone: "neutral",
    description: "La demande ou la proposition a été refusée.",
    expectedActor: null,
    nextAction: "Aucune action",
    iconToken: "archive",
  },
  cancelled: {
    label: "Annulée",
    tone: "neutral",
    description: "La mission a été annulée.",
    expectedActor: null,
    nextAction: "Aucune action",
    iconToken: "archive",
  },
  closed_without_action: {
    label: "Classée sans suite",
    tone: "neutral",
    description: "Le parcours est conservé dans l’historique sans réalisation.",
    expectedActor: null,
    nextAction: "Aucune action",
    iconToken: "archive",
  },
};
