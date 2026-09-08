import type {
  AthleteMemberService,
  AthleteServiceProductCode,
} from "@/lib/athlete-service-catalog";
import type {
  AthleteServiceRequestClientFulfillmentMode,
  AthleteServiceRequestStatus,
} from "@/lib/athlete-service-requests";

export type AthleteServiceRequestOption = {
  mode: AthleteServiceRequestClientFulfillmentMode;
  label: string;
  description: string;
};

const includedOption = (service: AthleteMemberService): AthleteServiceRequestOption => ({
  mode: "included_right",
  label: "Utiliser un droit inclus",
  description: service.creditOption
    ? `${service.creditOption.creditsRequired} droit${service.creditOption.creditsRequired === 1 ? "" : "s"} inclus`
    : "Droit inclus",
});

const paidOption = (service: AthleteMemberService): AthleteServiceRequestOption => ({
  mode: "paid_extra",
  label: "Acheter une prestation supplémentaire",
  description: service.memberPriceLabel,
});

export const getAthleteServiceRequestOptions = (
  service: AthleteMemberService,
  membershipActive: boolean,
): AthleteServiceRequestOption[] => {
  if (!membershipActive || service.creditOption?.eligibleWithPlan === false) return [];

  if (service.code === "match_coverage_upgrade") {
    return service.creditOption?.sufficient
      ? [{
          mode: "paid_with_right",
          label: "Utiliser une production incluse",
          description: `1 production incluse + ${service.memberPriceLabel}`,
        }]
      : [];
  }

  if (service.code === "custom_content_pack_5") return [paidOption(service)];

  return [
    ...(service.creditOption?.sufficient ? [includedOption(service)] : []),
    paidOption(service),
  ];
};

const statusLabels: Record<AthleteServiceRequestStatus, string> = {
  received: "Reçue",
  to_confirm: "À confirmer",
  scheduled: "Planifiée",
  in_progress: "En cours",
  completed: "Terminée",
  refused: "Refusée",
};

export const getAthleteServiceRequestStatusLabel = (
  status: AthleteServiceRequestStatus,
): string => statusLabels[status];

const fallbackProductLabels: Record<AthleteServiceProductCode, string> = {
  photo_session_standard: "Session photo KLIQUE",
  match_coverage_individual: "Couverture individuelle d’un match",
  match_coverage_upgrade: "Conversion en couverture de match",
  editorial_interview: "Interview éditoriale",
  custom_content_single: "Contenu personnalisé",
  custom_content_pack_5: "Pack de 5 contenus personnalisés",
  simple_video_capsule: "Capsule vidéo simple",
};

export const getAthleteServiceRequestProductLabel = (
  productCode: AthleteServiceProductCode,
): string => fallbackProductLabels[productCode];