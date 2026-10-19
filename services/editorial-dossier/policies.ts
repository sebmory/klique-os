import type {
  EditorialFactCategory,
  EditorialFreshness,
  EditorialFreshnessPolicy,
} from "@/types/editorial-dossier";

export const DEFAULT_EDITORIAL_FRESHNESS_POLICIES: Record<EditorialFactCategory, EditorialFreshnessPolicy> = {
  profile: {
    policyId: "profile-180d",
    category: "profile",
    currentForDays: 180,
    historical: false,
    description: "Profil public a revalider semestriellement.",
  },
  club_position: {
    policyId: "club-position-60d",
    category: "club_position",
    currentForDays: 60,
    historical: false,
    description: "Club, organisation et poste sont volatils.",
  },
  sports_result: {
    policyId: "sports-result-14d",
    category: "sports_result",
    currentForDays: 14,
    historical: false,
    description: "Un resultat recent perd rapidement son caractere actuel sans devenir faux.",
  },
  news: {
    policyId: "news-30d",
    category: "news",
    currentForDays: 30,
    historical: false,
    description: "Une actualite doit etre revalidee apres trente jours.",
  },
  production: {
    policyId: "production-30d",
    category: "production",
    currentForDays: 30,
    historical: false,
    description: "Le statut d une production doit etre revalide mensuellement.",
  },
  citation: {
    policyId: "citation-365d",
    category: "citation",
    currentForDays: 365,
    historical: false,
    description: "La citation reste attribuable mais son contexte doit etre revalide.",
  },
  objective: {
    policyId: "objective-90d",
    category: "objective",
    currentForDays: 90,
    historical: false,
    description: "Un objectif public doit etre revalide trimestriellement.",
  },
  historical_record: {
    policyId: "historical-record",
    category: "historical_record",
    currentForDays: null,
    historical: true,
    description: "Un palmares historique reste valide sans etre qualifie de recent.",
  },
  schedule: {
    policyId: "schedule-7d",
    category: "schedule",
    currentForDays: 7,
    historical: false,
    description: "Un calendrier est tres volatil.",
  },
  health: {
    policyId: "health-1d",
    category: "health",
    currentForDays: 1,
    historical: false,
    description: "Une information de sante est sensible et tres volatile.",
  },
  contact_request: {
    policyId: "contact-request-7d",
    category: "contact_request",
    currentForDays: 7,
    historical: false,
    description: "Une demande de contact doit etre traitee comme temporaire.",
  },
  appointment: {
    policyId: "appointment-7d",
    category: "appointment",
    currentForDays: 7,
    historical: false,
    description: "Un rendez-vous doit etre revalide chaque semaine.",
  },
  generated_reference: {
    policyId: "generated-reference",
    category: "generated_reference",
    currentForDays: null,
    historical: true,
    description: "Un contenu genere est une reference editoriale, pas une preuve factuelle.",
  },
  other: {
    policyId: "other-90d",
    category: "other",
    currentForDays: 90,
    historical: false,
    description: "Politique prudente par defaut.",
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const calculateEditorialFreshness = (
  category: EditorialFactCategory,
  asOf: string,
  referenceDate?: string,
  policies = DEFAULT_EDITORIAL_FRESHNESS_POLICIES,
): EditorialFreshness => {
  const policy = policies[category];
  const asOfTime = Date.parse(asOf);
  const referenceTime = referenceDate ? Date.parse(referenceDate) : Number.NaN;

  if (policy.historical) {
    return {
      status: "historical",
      asOf,
      referenceDate: Number.isFinite(referenceTime) ? new Date(referenceTime).toISOString() : undefined,
      policyId: policy.policyId,
      reasons: [policy.description, "Une information historique n est pas assimilee a une information fausse."],
    };
  }

  if (!Number.isFinite(asOfTime) || !Number.isFinite(referenceTime) || policy.currentForDays === null) {
    return {
      status: "unknown",
      asOf,
      policyId: policy.policyId,
      reasons: [policy.description, "Date de reference absente ou invalide."],
    };
  }

  const ageDays = Math.max(0, Math.floor((asOfTime - referenceTime) / DAY_MS));
  const validUntil = new Date(referenceTime + policy.currentForDays * DAY_MS).toISOString();
  const current = ageDays <= policy.currentForDays;

  return {
    status: current ? "current" : "stale",
    asOf,
    referenceDate: new Date(referenceTime).toISOString(),
    validUntil,
    ageDays,
    policyId: policy.policyId,
    reasons: [
      policy.description,
      current
        ? `Age ${ageDays} jour(s), dans la limite de ${policy.currentForDays} jour(s).`
        : `Age ${ageDays} jour(s), au-dela de la limite de ${policy.currentForDays} jour(s).`,
    ],
  };
};
