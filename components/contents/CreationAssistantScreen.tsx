"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Circle,
  Clapperboard,
  FileText,
  Loader2,
  Megaphone,
  MessageSquareQuote,
  Mic,
  Radio,
  UserRound,
  Users,
  Building2,
  CalendarDays,
  Handshake,
  Shapes,
} from "lucide-react";
import type { Athlete, AthletesResponse } from "@/types/athlete";
import type { GenerateContentApiResponse, PublicationAngleSuggestion } from "@/types/content-generation";
import type {
  ContextCollectionResponse,
  ContextConnectorId,
  ContextConnectorReport,
  ContextDateRange,
  ContextItem,
} from "@/types/context-intelligence";
import { EntitySelector } from "@/components/ui/EntitySelector";
import { getMediaSubscriptionPlan } from "@/lib/media-subscriptions/plans";
import {
  CREATION_MAX_QUESTION_COUNT,
  CREATION_MIN_QUESTION_COUNT,
  ContentCreationAssistantService,
  createInitialAssistantDraft,
  NEW_CONTRACT_TYPE_OPTIONS,
  resolveNewContractTypeLabel,
  type AfterMatchPresetDraft,
  type AfterMatchStoryPresetDraft,
  type BeforeMatchPresetDraft,
  type MatchDayStoryPresetDraft,
  type NewContractPresetDraft,
  type CreationAssistantDraft,
  type CreationObjectiveType,
  type CreationOption,
  type CreationSubjectType,
} from "@/services/content-creation-assistant";
import { buildResultUrl, saveInterviewResultSession } from "@/services/content-result-sessions";
import { CONTENT_AUDIENCE_OPTIONS, CONTENT_TONE_OPTIONS, getSharedOptionLabel } from "@/services/content-shared-options";
import type { ContentCreationContext, ContentPresetId } from "@/services/contents-hub";
import { buildDateRange, formatDateRangeLabel, formatDateTimeLabel } from "@/services/context-intelligence/utils";
import { runContentsBackfill } from "@/services/content-backfill";

type CreationAssistantScreenProps = {
  context: ContentCreationContext;
};

type CreationGenerateState = {
  loading: boolean;
  errorMessage: string | null;
};

type StepValidationResult = {
  ok: boolean;
  message?: string;
  focusSelector?: string;
};

type ContextCollectState = {
  loading: boolean;
  errorMessage: string | null;
  items: ContextItem[];
  reports: ContextConnectorReport[];
  researchedAt?: string;
  dateRange?: ContextDateRange;
  hasCollected: boolean;
};

type ContextCategoryGroup = {
  category: string;
  items: ContextItem[];
};

type StepId = "subject" | "objective" | "match" | "match-day" | "after-match-story" | "contract" | "angle" | "parameters" | "context" | "summary";

const interviewSteps: Array<{ id: StepId; label: string }> = [
  { id: "subject", label: "Etape 1" },
  { id: "objective", label: "Etape 2" },
  { id: "parameters", label: "Etape 3" },
  { id: "context", label: "Etape 4" },
  { id: "summary", label: "Etape 5" },
];

const publicationSteps: Array<{ id: StepId; label: string }> = [
  { id: "subject", label: "Etape 1" },
  { id: "objective", label: "Etape 2" },
  { id: "parameters", label: "Etape 3" },
  { id: "context", label: "Etape 4" },
  { id: "angle", label: "Etape 5" },
  { id: "summary", label: "Etape 6" },
];

const reelSteps: Array<{ id: StepId; label: string }> = [
  { id: "subject", label: "Etape 1" },
  { id: "objective", label: "Etape 2" },
  { id: "angle", label: "Etape 3" },
  { id: "parameters", label: "Etape 4" },
  { id: "context", label: "Etape 5" },
  { id: "summary", label: "Etape 6" },
];

const storySteps: Array<{ id: StepId; label: string }> = [
  { id: "subject", label: "Etape 1" },
  { id: "objective", label: "Etape 2" },
  { id: "angle", label: "Etape 3" },
  { id: "parameters", label: "Etape 4" },
  { id: "context", label: "Etape 5" },
  { id: "summary", label: "Etape 6" },
];

const afterMatchSteps: Array<{ id: StepId; label: string }> = [
  { id: "subject", label: "Etape 1" },
  { id: "match", label: "Etape 2" },
  { id: "angle", label: "Etape 3" },
  { id: "parameters", label: "Etape 4" },
  { id: "context", label: "Etape 5" },
  { id: "summary", label: "Etape 6" },
];

const newContractSteps: Array<{ id: StepId; label: string }> = [
  { id: "subject", label: "Etape 1" },
  { id: "contract", label: "Etape 2" },
  { id: "parameters", label: "Etape 3" },
  { id: "context", label: "Etape 4" },
  { id: "summary", label: "Etape 5" },
];

const matchDayStorySteps: Array<{ id: StepId; label: string }> = [
  { id: "subject", label: "Etape 1" },
  { id: "match-day", label: "Etape 2" },
  { id: "parameters", label: "Etape 3" },
  { id: "context", label: "Etape 4" },
  { id: "summary", label: "Etape 5" },
];

const afterMatchStorySteps: Array<{ id: StepId; label: string }> = [
  { id: "subject", label: "Etape 1" },
  { id: "after-match-story", label: "Etape 2" },
  { id: "parameters", label: "Etape 3" },
  { id: "context", label: "Etape 4" },
  { id: "summary", label: "Etape 5" },
];

const getStepsForObjective = (
  objective: CreationObjectiveType | null,
  hasPreselectedObjective = false,
  presetId?: ContentPresetId
): Array<{ id: StepId; label: string }> => {
  // Les presets match remplacent entierement l etape objective par une etape match dediee.
  if (objective === "publication" && (presetId === "after-match" || presetId === "before-match")) {
    return afterMatchSteps.map((item, index) => ({ id: item.id, label: `Etape ${index + 1}` }));
  }

  // Le preset Nouveau contrat remplace entierement l etape objective par une etape contrat dediee.
  if (objective === "publication" && presetId === "new-contract") {
    return newContractSteps.map((item, index) => ({ id: item.id, label: `Etape ${index + 1}` }));
  }

  if (objective === "story" && presetId === "match-day-story") {
    return matchDayStorySteps.map((item, index) => ({ id: item.id, label: `Etape ${index + 1}` }));
  }

  if (objective === "story" && presetId === "after-match-story") {
    return afterMatchStorySteps.map((item, index) => ({ id: item.id, label: `Etape ${index + 1}` }));
  }

  const baseSteps = objective === "publication"
    ? publicationSteps
    : objective === "reel"
      ? reelSteps
      : objective === "story"
        ? storySteps
        : interviewSteps;

  // Reel et Story: l objective preselectionne rend l etape entierement redondante.
  // Publication et Interview: l etape reste necessaire (choix dedie), elle n est jamais retiree.
  const skipObjectiveStep = hasPreselectedObjective && (objective === "reel" || objective === "story");
  const effectiveSteps = skipObjectiveStep ? baseSteps.filter((item) => item.id !== "objective") : baseSteps;

  return effectiveSteps.map((item, index) => ({ id: item.id, label: `Etape ${index + 1}` }));
};

const preselectableObjectives: CreationObjectiveType[] = ["interview", "publication", "reel", "story"];

const publicationObjectiveOptions: Array<{ id: string; label: string; description: string }> = [
  { id: "announce", label: "Annoncer", description: "Annoncer une information importante." },
  { id: "inform", label: "Informer", description: "Partager une information utile et claire." },
  { id: "narrate", label: "Raconter", description: "Raconter une histoire autour du sujet." },
  { id: "highlight", label: "Valoriser", description: "Mettre en valeur une personne, equipe ou action." },
  { id: "engage", label: "Engager", description: "Creer de l interaction avec la communaute." },
  { id: "inspire", label: "Inspirer", description: "Transmettre un message motivant." },
  { id: "promote", label: "Promouvoir", description: "Promouvoir une offre, un evenement ou une initiative." },
  { id: "congratulate", label: "Feliciter", description: "Feliciter une performance ou une reussite." },
  { id: "thank", label: "Remercier", description: "Remercier partenaires, equipe ou audience." },
  { id: "introduce", label: "Presenter", description: "Presenter une nouveaute ou un profil." },
  { id: "build_expectation", label: "Creer de l attente", description: "Faire monter l anticipation avant un moment cle." },
  { id: "free", label: "Libre", description: "Definir librement votre objectif editorial." },
];

const subjectOptions: Array<{
  id: CreationSubjectType;
  title: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: "person", title: "Personne", description: "Selection depuis le CRM ou sujet temporaire.", icon: UserRound },
  { id: "team", title: "Equipe", description: "Creation centree sur un collectif.", icon: Users },
  { id: "club", title: "Club", description: "Communication autour d un club.", icon: Building2 },
  { id: "organization", title: "Organisation", description: "Sujet institutionnel ou structurel.", icon: Shapes },
  { id: "partner", title: "Partenaire", description: "Activation de contenus de partenariat.", icon: Handshake },
  { id: "event", title: "Evenement", description: "Tournoi, match, conference ou activite.", icon: CalendarDays },
  { id: "free_topic", title: "Sujet libre", description: "Entrez un sujet sans categorie imposee.", icon: FileText },
];

const objectiveIconById: Record<CreationObjectiveType, ComponentType<{ size?: number; className?: string }>> = {
  interview: MessageSquareQuote,
  publication: FileText,
  reel: Clapperboard,
  story: Radio,
  podcast: Mic,
  article: FileText,
  newsletter: FileText,
  campaign: Megaphone,
  sponsoring_file: Handshake,
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const matchDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const formatMatchDate = (value: string): string => {
  if (!value) return "Non definie";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Non definie" : matchDateFormatter.format(date);
};

const resolveSelectedToneLabel = (toneId: string, customTone: string): string => {
  if (toneId === "free") return normalize(customTone) || "Libre";
  return getSharedOptionLabel(CONTENT_TONE_OPTIONS, toneId);
};

const resolveSelectedAudienceLabel = (audienceId: string, customAudience: string): string => {
  if (audienceId === "free") return normalize(customAudience) || "Libre";
  return getSharedOptionLabel(CONTENT_AUDIENCE_OPTIONS, audienceId);
};

const findOption = (options: CreationOption[], id: string): CreationOption | undefined => {
  return options.find((option) => option.id === id);
};

const formatSubjectType = (value: CreationSubjectType | null): string => {
  const item = subjectOptions.find((option) => option.id === value);
  return item?.title ?? "Non defini";
};

const getInitials = (value: string): string => {
  const parts = value
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "--";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
};

const formatDateRangePresetLabel = (preset: ContextDateRange["preset"]): string => {
  if (preset === "last_7_days") return "7 derniers jours";
  if (preset === "last_30_days") return "30 derniers jours";
  if (preset === "last_90_days") return "90 derniers jours";
  if (preset === "last_12_months") return "12 derniers mois";
  return "Personnalisee";
};

const connectorLabels: Record<ContextConnectorId, string> = {
  crm: "CRM",
  productions: "Productions",
  manual: "Contexte manuel",
  external_news: "Actualite externe",
  calendar: "Calendrier",
  results: "Resultats",
  official_website: "Site officiel",
  rss: "Flux RSS",
  social: "Reseaux sociaux",
  documents: "Documents",
  previous_content: "Contenu precedent",
};

const getConnectorLabel = (connectorId: ContextConnectorId): string => connectorLabels[connectorId] ?? connectorId;

const generationFailureMessage = (objective: CreationObjectiveType | null): string => {
  if (objective === "publication") return "Impossible de creer la publication.";
  if (objective === "reel") return "Impossible de creer le Reel.";
  return "Impossible de creer l interview.";
};

const getConnectorStatusLabel = (status: ContextConnectorReport["status"]): string => {
  if (status === "completed") return "Donnees recuperees";
  if (status === "empty") return "Aucune donnee recue";
  if (status === "unavailable") return "Non disponible";
  if (status === "running") return "Recherche en cours";
  if (status === "pending") return "En attente";
  return "Erreur";
};

const getConnectorStatusMessage = (report: ContextConnectorReport): string => {
  if (report.message) return report.message;
  if (report.connectorId === "manual") return "Aucun contexte manuel fourni.";
  if (report.connectorId === "crm") return "Sujet CRM introuvable.";
  if (report.connectorId === "productions") return "Aucune production liee.";
  if (report.connectorId === "external_news" && report.status === "empty") return "Aucune actualite recente verifiable n a ete trouvee pour cette periode.";
  if (report.connectorId === "external_news" && report.status === "unavailable") return "La recherche externe n est pas configuree ou n a pas pu demarrer.";
  if (report.connectorId === "external_news" && report.status === "error") return "L actualite externe a rencontre une erreur.";
  return "Aucune information disponible.";
};

const DRAFT_STORAGE_KEY = "klique.contents.creation-assistant.draft.v1";
const RESULT_STORAGE_KEY = "klique.contents.creation-assistant.interview-result.v1";

type PersonSelectorItem = {
  id: string;
  displayName: string;
  sport: string;
  organization: string;
  status: string;
  initials: string;
  hasPhoto: boolean;
};

type PublicationAngleState = {
  loading: boolean;
  errorMessage: string | null;
  suggestions: PublicationAngleSuggestion[];
};

export function CreationAssistantScreen({ context }: CreationAssistantScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const summaryStepRequested = searchParams.get("step") === "summary";

  useEffect(() => {
    void runContentsBackfill();
  }, []);
  // Un objective valide fourni par l URL rend l etape "objective" redondante et la retire du parcours.
  const hasPreselectedObjective = preselectableObjectives.includes(context.objective as CreationObjectiveType);
  const initialSteps = getStepsForObjective(
    (context.objective as CreationObjectiveType | undefined) ?? "interview",
    hasPreselectedObjective,
    context.presetId
  );
  const initialStepCount = initialSteps.length;
  const template = useMemo(() => ContentCreationAssistantService.template(), []);
  const [draft, setDraft] = useState<CreationAssistantDraft>(() => createInitialAssistantDraft(context));
  const isPublicationFlow = draft.objective.objective === "publication";
  const steps = useMemo(
    () => getStepsForObjective(draft.objective.objective, hasPreselectedObjective, draft.presetId),
    [draft.objective.objective, hasPreselectedObjective, draft.presetId]
  );
  const [stepIndex, setStepIndex] = useState(summaryStepRequested ? initialStepCount - 1 : 0);

  useEffect(() => {
    if (draft.presetId !== "new-contract" || draft.subject.type === "person") return;
    setDraft((current) => ({
      ...current,
      subject: { ...current.subject, type: "person", source: "crm" },
    }));
  }, [draft.presetId, draft.subject.type]);
  const [people, setPeople] = useState<Athlete[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [generateState, setGenerateState] = useState<CreationGenerateState>({ loading: false, errorMessage: null });
  const [contextState, setContextState] = useState<ContextCollectState>({
    loading: false,
    errorMessage: null,
    items: [],
    reports: [],
    hasCollected: false,
  });
  const [stepErrorMessage, setStepErrorMessage] = useState<string | null>(null);
  const [publicationAnglesState, setPublicationAnglesState] = useState<PublicationAngleState>({
    loading: false,
    errorMessage: null,
    suggestions: [],
  });
  const generationAbortRef = useRef<AbortController | null>(null);

  // Detecte le role media via la reponse de /api/ai-credits/balance, sans dependre d une autre source.
  const [mediaCreditRole, setMediaCreditRole] = useState<"unknown" | "media" | "other">("unknown");
  const [creditBalance, setCreditBalance] = useState<{ hasActivePeriod: boolean; balance: number } | null>(null);
  const [creditModal, setCreditModal] = useState<null | { kind: "external_search" | "publication_angles" | "generation"; cost: number }>(null);
  const [creditModalBusy, setCreditModalBusy] = useState(false);
  const [mediaSubscription, setMediaSubscription] = useState<
    | { planCode: string; status: string; currentPeriodEnd: string }
    | null
  >(null);
  const [mediaSubscriptionLoaded, setMediaSubscriptionLoaded] = useState(false);

  const loadCreditBalance = useCallback(async () => {
    try {
      const response = await fetch("/api/ai-credits/balance", { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | { ok: boolean; balance?: number; period?: { id: string } | null }
        | null;

      if (!response.ok || !payload || !payload.ok) {
        setMediaCreditRole("other");
        setCreditBalance(null);
        return;
      }

      setMediaCreditRole("media");
      setCreditBalance({
        hasActivePeriod: Boolean(payload.period),
        balance: typeof payload.balance === "number" ? payload.balance : 0,
      });
    } catch {
      setMediaCreditRole("other");
      setCreditBalance(null);
    }
  }, []);

  useEffect(() => {
    void loadCreditBalance();
  }, [loadCreditBalance]);

  useEffect(() => {
    if (mediaCreditRole !== "media") return;

    let active = true;

    // Information secondaire: un echec ne doit jamais bloquer l assistant ni masquer les erreurs de credits.
    const loadMediaSubscription = async () => {
      try {
        const response = await fetch("/api/media-subscriptions", { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; subscription?: { planCode: string; status: string; currentPeriodEnd: string } | null }
          | null;

        if (!active) return;

        if (!response.ok || !payload?.ok) {
          setMediaSubscription(null);
          setMediaSubscriptionLoaded(false);
          return;
        }

        setMediaSubscription(payload.subscription ?? null);
        setMediaSubscriptionLoaded(true);
      } catch {
        if (!active) return;
        setMediaSubscription(null);
        setMediaSubscriptionLoaded(false);
      }
    };

    void loadMediaSubscription();

    return () => {
      active = false;
    };
  }, [mediaCreditRole]);

  const getGenerationCreditCost = (): number => {
    return 1;
  };

  const formatCreditCount = (count: number): string => (count === 1 ? "1 crédit" : `${count} crédits`);

  const formatSubscriptionStatus = (status: string): string =>
    ({
      trialing: "Essai",
      active: "Active",
      past_due: "Paiement en retard",
      canceled: "Annulée",
      expired: "Expirée",
    })[status] ?? status;

  const formatSubscriptionDate = (value: string): string => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const isCreditCostBlocked = (cost: number): boolean => {
    if (mediaCreditRole !== "media" || creditBalance === null) return false;
    return !creditBalance.hasActivePeriod || creditBalance.balance < cost;
  };

  const isExternalSearchBlocked = isCreditCostBlocked(1);
  const isGenerationBlocked = isCreditCostBlocked(getGenerationCreditCost());
  const isPublicationAnglesBlocked = isCreditCostBlocked(1);

  const effectiveStepIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[effectiveStepIndex];
  const objectiveParameters = useMemo(
    () => ContentCreationAssistantService.parametersForObjective(draft.objective.objective),
    [draft.objective.objective]
  );

  useEffect(() => {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as CreationAssistantDraft;
      if (parsed && parsed.subject && parsed.objective && parsed.parameters) {
        window.requestAnimationFrame(() => {
          setDraft(parsed);
        });
      }
    } catch {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  const loadPeople = async () => {
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const response = await fetch("/api/athletes", { cache: "no-store" });
      const payload = (await response.json()) as AthletesResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "Impossible de charger les personnes" : "Impossible de charger les personnes");
      }

      if (!("athletes" in payload)) {
        throw new Error("Impossible de charger les personnes");
      }

      if (payload.source !== "google-sheets") {
        throw new Error("Impossible de charger les personnes");
      }

      setPeople(payload.athletes);
    } catch {
      setPeople([]);
      setPeopleError("Impossible de charger les personnes");
    } finally {
      setPeopleLoading(false);
    }
  };

  const personItems = useMemo<PersonSelectorItem[]>(() => {
    return people
      .map((athlete) => ({
        id: athlete.key,
        displayName: normalize(athlete.name) || "Sans nom",
        sport: normalize(athlete.sport),
        organization: normalize(athlete.club),
        status: normalize(athlete.status),
        initials: normalize(athlete.initials) || getInitials(athlete.name),
        hasPhoto: Boolean(athlete.competitionPhoto),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr", { sensitivity: "base" }));
  }, [people]);

  const validateStep = useCallback((stepId: StepId): StepValidationResult => {
    if (stepId === "subject") {
      if (!draft.subject.type) {
        return { ok: false, message: "Selectionnez un type de sujet.", focusSelector: ".creation-choice-card" };
      }
      if (draft.subject.type === "person") {
        if (draft.subject.source === "crm") {
          if (!draft.subject.id || !normalize(draft.subject.displayName)) {
            return { ok: false, message: "Selectionnez une personne CRM.", focusSelector: ".creation-entity-selector button" };
          }
          return { ok: true };
        }
        if (!normalize(draft.subject.displayName)) {
          return { ok: false, message: "Renseignez le nom du sujet temporaire.", focusSelector: "input[type='text']" };
        }
        return { ok: true };
      }

      if (!normalize(draft.subject.displayName)) {
        return { ok: false, message: "Renseignez le nom du sujet.", focusSelector: "input[type='text']" };
      }
      return { ok: true };
    }

    if (stepId === "objective") {
      if (!draft.objective.objective) {
        return { ok: false, message: "Selectionnez un objectif de contenu.", focusSelector: ".creation-objective-card" };
      }

      if (draft.objective.objective === "publication") {
        if (!draft.parameters.publicationObjectiveId) {
          return { ok: false, message: "Selectionnez un objectif de publication.", focusSelector: ".creation-option-card" };
        }
        if (draft.parameters.publicationObjectiveId === "free" && !normalize(draft.parameters.publicationCustomObjective)) {
          return { ok: false, message: "Renseignez votre objectif libre.", focusSelector: "[data-publication-objective-free='true']" };
        }
        return { ok: true };
      }

      if (draft.objective.objective === "reel") {
        return { ok: true };
      }

      if (draft.objective.objective === "story") {
        return { ok: true };
      }

      if (!objectiveParameters) {
        return { ok: false, message: "Objectif indisponible pour la configuration actuelle." };
      }
      if (!draft.objective.subtypeId) {
        return { ok: false, message: "Selectionnez un type d interview.", focusSelector: "[data-param-group='subtype'] .creation-option-card" };
      }
      return { ok: true };
    }

    if (stepId === "match") {
      const matchDraft = draft.presetId === "before-match" ? draft.beforeMatch : draft.afterMatch;
      if (!normalize(matchDraft?.opponent)) {
        return { ok: false, message: "Renseignez l adversaire.", focusSelector: "[data-match-opponent='true']" };
      }
      if (draft.presetId !== "before-match" && !normalize(draft.afterMatch?.result)) {
        return { ok: false, message: "Renseignez le resultat.", focusSelector: "[data-match-result='true']" };
      }
      if (!normalize(matchDraft?.competition)) {
        return { ok: false, message: "Renseignez la competition.", focusSelector: "[data-match-competition='true']" };
      }
      if (!normalize(matchDraft?.matchDate)) {
        return { ok: false, message: "Renseignez la date du match.", focusSelector: "[data-match-date='true']" };
      }
      return { ok: true };
    }

    if (stepId === "contract") {
      if (!normalize(draft.newContract?.organization)) {
        return { ok: false, message: "Renseignez l organisation ou le club.", focusSelector: "[data-contract-organization='true']" };
      }
      if (!normalize(draft.newContract?.contractType)) {
        return { ok: false, message: "Selectionnez la nature de l annonce.", focusSelector: "[data-contract-type='true']" };
      }
      if (draft.newContract?.contractType === "other" && !normalize(draft.newContract?.customContractType)) {
        return { ok: false, message: "Precisez la nature de l annonce.", focusSelector: "[data-contract-custom-type='true']" };
      }
      if (!normalize(draft.newContract?.role)) {
        return { ok: false, message: "Renseignez le role.", focusSelector: "[data-contract-role='true']" };
      }
      return { ok: true };
    }

    if (stepId === "match-day") {
      if (!normalize(draft.matchDayStory?.opponent)) {
        return { ok: false, message: "Renseignez l adversaire.", focusSelector: "[data-match-day-opponent='true']" };
      }
      if (!normalize(draft.matchDayStory?.matchDate)) {
        return { ok: false, message: "Renseignez la date du match.", focusSelector: "[data-match-day-date='true']" };
      }
      if (!normalize(draft.matchDayStory?.matchTime)) {
        return { ok: false, message: "Renseignez l heure du match.", focusSelector: "[data-match-day-time='true']" };
      }
      if (!draft.matchDayStory?.homeAway) {
        return { ok: false, message: "Selectionnez domicile ou exterieur.", focusSelector: "[data-match-day-home-away='true']" };
      }
      return { ok: true };
    }

    if (stepId === "after-match-story") {
      if (!normalize(draft.afterMatchStory?.opponent)) {
        return { ok: false, message: "Renseignez l adversaire.", focusSelector: "[data-after-match-story-opponent='true']" };
      }
      if (!normalize(draft.afterMatchStory?.matchDate)) {
        return { ok: false, message: "Renseignez la date du match.", focusSelector: "[data-after-match-story-date='true']" };
      }
      if (!normalize(draft.afterMatchStory?.score)) {
        return { ok: false, message: "Renseignez le score.", focusSelector: "[data-after-match-story-score='true']" };
      }
      if (!draft.afterMatchStory?.result) {
        return { ok: false, message: "Selectionnez le resultat.", focusSelector: "[data-after-match-story-result='true']" };
      }
      return { ok: true };
    }

    if (stepId === "angle") {
      if (draft.objective.objective === "publication" && !normalize(draft.parameters.publicationSelectedAngle)) {
        return { ok: false, message: "Selectionnez ou saisissez un angle editorial.", focusSelector: ".creation-option-card, [data-publication-custom-angle='true']" };
      }
      if (draft.objective.objective === "reel" && !normalize(draft.parameters.reelSelectedAngle)) {
        return { ok: false, message: "Renseignez un angle editorial Reel.", focusSelector: "[data-reel-custom-angle='true']" };
      }
      if (draft.objective.objective === "story" && !normalize(draft.parameters.storySelectedAngle)) {
        return { ok: false, message: "Renseignez un angle editorial Story.", focusSelector: "[data-story-custom-angle='true']" };
      }
      return { ok: true };
    }

    if (stepId === "parameters") {
      if (draft.objective.objective === "publication") {
        if (!draft.parameters.publicationPlatform) {
          return { ok: false, message: "Selectionnez une plateforme.", focusSelector: "[data-publication-platform='true']" };
        }
        if (!draft.parameters.toneId) {
          return { ok: false, message: "Selectionnez un ton.", focusSelector: "[data-publication-tone='true']" };
        }
        if (!draft.parameters.audienceId) {
          return { ok: false, message: "Selectionnez une audience.", focusSelector: "[data-publication-audience='true']" };
        }
          if (draft.parameters.toneId === "free" && !normalize(draft.parameters.customTone)) {
            return { ok: false, message: "Renseignez le ton libre.", focusSelector: "[data-publication-tone-free='true']" };
          }
          if (draft.parameters.audienceId === "free" && !normalize(draft.parameters.customAudience)) {
            return { ok: false, message: "Renseignez le public libre.", focusSelector: "[data-publication-audience-free='true']" };
          }
        return { ok: true };
      }

        if (draft.objective.objective === "reel") {
          if (!draft.parameters.reelPlatform) {
            return { ok: false, message: "Selectionnez une plateforme Reel.", focusSelector: "[data-reel-platform='true']" };
          }
          if (!draft.parameters.reelDuration) {
            return { ok: false, message: "Selectionnez une duree Reel.", focusSelector: "[data-reel-duration='true']" };
          }
          if (!draft.parameters.reelFormat) {
            return { ok: false, message: "Selectionnez un format Reel.", focusSelector: "[data-reel-format='true']" };
          }
          if (!draft.parameters.toneId) {
            return { ok: false, message: "Selectionnez un ton.", focusSelector: "[data-reel-tone='true']" };
          }
          if (!draft.parameters.audienceId) {
            return { ok: false, message: "Selectionnez une audience.", focusSelector: "[data-reel-audience='true']" };
          }
          if (draft.parameters.toneId === "free" && !normalize(draft.parameters.customTone)) {
            return { ok: false, message: "Renseignez le ton libre.", focusSelector: "[data-reel-tone-free='true']" };
          }
          if (draft.parameters.audienceId === "free" && !normalize(draft.parameters.customAudience)) {
            return { ok: false, message: "Renseignez le public libre.", focusSelector: "[data-reel-audience-free='true']" };
          }
          return { ok: true };
        }

        if (draft.objective.objective === "story") {
          if (!draft.parameters.storyPlatform) {
            return { ok: false, message: "Selectionnez une plateforme Story.", focusSelector: "[data-story-platform='true']" };
          }
          const frameCount = Number(draft.parameters.storyFrameCount);
          if (!Number.isFinite(frameCount) || frameCount <= 0) {
            return { ok: false, message: "Renseignez un nombre de frames valide.", focusSelector: "[data-story-frame-count='true']" };
          }
          if (!draft.parameters.toneId) {
            return { ok: false, message: "Selectionnez un ton.", focusSelector: "[data-story-tone='true']" };
          }
          if (!draft.parameters.audienceId) {
            return { ok: false, message: "Selectionnez une audience.", focusSelector: "[data-story-audience='true']" };
          }
          if (draft.parameters.toneId === "free" && !normalize(draft.parameters.customTone)) {
            return { ok: false, message: "Renseignez le ton libre.", focusSelector: "[data-story-tone-free='true']" };
          }
          if (draft.parameters.audienceId === "free" && !normalize(draft.parameters.customAudience)) {
            return { ok: false, message: "Renseignez le public libre.", focusSelector: "[data-story-audience-free='true']" };
          }
          return { ok: true };
        }

      if (!objectiveParameters) {
        return { ok: false, message: "Configuration indisponible pour cette etape." };
      }

      if (!draft.objective.subtypeId) {
        return { ok: false, message: "Selectionnez d abord un type d interview.", focusSelector: "[data-param-group='subtype'] .creation-option-card" };
      }

      if (!draft.parameters.toneId) {
        return { ok: false, message: "Selectionnez un ton.", focusSelector: "[data-param-group='tone'] .creation-option-card" };
      }

      if (!draft.parameters.questionCountId) {
        return { ok: false, message: "Selectionnez un nombre de questions.", focusSelector: ".creation-count-chip" };
      }

      const selectedCount = objectiveParameters.questionCountOptions.find((item) => item.id === draft.parameters.questionCountId);
      if (selectedCount?.isCustom) {
        const value = Number(draft.parameters.customQuestionCount);
        if (!Number.isFinite(value) || value < CREATION_MIN_QUESTION_COUNT || value > CREATION_MAX_QUESTION_COUNT) {
          return {
            ok: false,
            message: `Le nombre personnalise doit etre compris entre ${CREATION_MIN_QUESTION_COUNT} et ${CREATION_MAX_QUESTION_COUNT}.`,
            focusSelector: "[data-custom-question-count='true']",
          };
        }
      }

      if (!draft.parameters.formatId) {
        return { ok: false, message: "Selectionnez un format.", focusSelector: "[data-param-group='format'] .creation-option-card" };
      }

      if (!draft.parameters.audienceId) {
        return { ok: false, message: "Selectionnez un public cible.", focusSelector: "[data-param-group='audience'] .creation-option-card" };
      }

      if (draft.parameters.toneId === "free" && !normalize(draft.parameters.customTone)) {
        return { ok: false, message: "Renseignez le ton libre.", focusSelector: "[data-interview-tone-free='true']" };
      }

      if (draft.parameters.audienceId === "free" && !normalize(draft.parameters.customAudience)) {
        return { ok: false, message: "Renseignez le public libre.", focusSelector: "[data-interview-audience-free='true']" };
      }

      return { ok: true };
    }

    if (stepId === "context") {
      if (!draft.parameters.useContextIntelligence) return { ok: true };
      if (!draft.parameters.contextEnableCrm && !draft.parameters.contextEnableProductions && !draft.parameters.contextEnableManual && !draft.parameters.contextEnableExternalNews) {
        return { ok: false, message: "Selectionnez au moins une source de contexte.", focusSelector: ".creation-toggle-row input[type='checkbox']" };
      }
      if (contextState.loading) {
        return { ok: false, message: "Collecte en cours. Attendez la fin de la collecte." };
      }
      if (!contextState.hasCollected) {
        return { ok: false, message: "Lancez la collecte du contexte avant de continuer.", focusSelector: ".creation-step-block .crm-primary-action" };
      }
      return { ok: true };
    }

    return { ok: true };
  }, [contextState.hasCollected, contextState.loading, draft, objectiveParameters]);

  const preparedPayload = useMemo(() => {
    return ContentCreationAssistantService.preparePayload({
      context,
      draft,
      selectedContextItems: contextState.items.filter((item) => item.isSelected),
      contextResearchedAt: contextState.researchedAt,
      contextDateRange: contextState.dateRange,
    });
  }, [context, contextState.dateRange, contextState.items, contextState.researchedAt, draft]);

  const selectedObjectiveTitle = useMemo(() => {
    const target = template.objectives.find((objective) => objective.id === draft.objective.objective);
    return target?.title ?? "Non defini";
  }, [draft.objective.objective, template.objectives]);

  const enabledConnectorLabels = useMemo(() => {
    const labels: string[] = [];
    if (draft.parameters.contextEnableCrm) labels.push("CRM");
    if (draft.parameters.contextEnableProductions) labels.push("Productions");
    if (draft.parameters.contextEnableManual) labels.push("Contexte manuel");
    return labels;
  }, [
    draft.parameters.contextEnableCrm,
    draft.parameters.contextEnableManual,
    draft.parameters.contextEnableProductions,
  ]);

  const getStepIndexById = (stepId: StepId): number => steps.findIndex((item) => item.id === stepId);

  const getNextStepId = (stepId: StepId): StepId | null => {
    const index = getStepIndexById(stepId);
    if (index < 0 || index >= steps.length - 1) return null;
    return steps[index + 1].id;
  };

  const getPreviousStepId = (stepId: StepId): StepId | null => {
    const index = getStepIndexById(stepId);
    if (index <= 0) return null;
    return steps[index - 1].id;
  };

  const focusValidationTarget = (selector?: string) => {
    if (!selector) return;
    const target = document.querySelector(selector) as HTMLElement | null;
    if (!target) return;
    target.focus();
  };

  const moveNext = () => {
    const validation = validateStep(step.id);
    if (!validation.ok) {
      setStepErrorMessage(validation.message || "Cette etape n est pas encore valide.");
      focusValidationTarget(validation.focusSelector);
      return;
    }

    const nextStepId = getNextStepId(step.id);
    if (!nextStepId) return;
    const targetIndex = getStepIndexById(nextStepId);
    if (targetIndex < 0) return;

    setStepErrorMessage(null);
    setStepIndex(targetIndex);
  };

  const movePrevious = () => {
    const previousStepId = getPreviousStepId(step.id);
    if (!previousStepId) return;
    const targetIndex = getStepIndexById(previousStepId);
    if (targetIndex < 0) return;

    setStepErrorMessage(null);
    setStepIndex(targetIndex);
  };

  const selectSubjectType = (type: CreationSubjectType) => {
    if (type === "person" && people.length === 0 && !peopleLoading && !peopleError) {
      void loadPeople();
    }

    setDraft((current) => ({
      ...current,
      subject: {
        ...current.subject,
        type,
        source: type === "person" ? "crm" : "temporary",
        id: type === "person" ? current.subject.id : undefined,
        displayName:
          type === current.subject.type
            ? current.subject.displayName
            : current.subject.type === null
              ? current.subject.displayName
              : "",
        description: type === current.subject.type ? current.subject.description : "",
        sport: type === current.subject.type ? current.subject.sport : "",
        clubOrOrganization: type === current.subject.type ? current.subject.clubOrOrganization : "",
        photoUrl: type === "person" ? current.subject.photoUrl : undefined,
        photoAvailable: type === "person" ? current.subject.photoAvailable : false,
      },
    }));
  };

  const selectPersonFromCrm = (person: PersonSelectorItem) => {
    setDraft((current) => ({
      ...current,
      subject: {
        ...current.subject,
        source: "crm",
        id: person.id,
        displayName: person.displayName,
        sport: person.sport,
        clubOrOrganization: person.organization,
        photoUrl: undefined,
        photoAvailable: person.hasPhoto,
      },
    }));
  };

  const enableTemporaryPerson = () => {
    setDraft((current) => ({
      ...current,
      subject: {
        ...current.subject,
        source: "temporary",
        id: undefined,
        displayName: normalize(current.subject.displayName),
        photoUrl: undefined,
        photoAvailable: false,
      },
    }));
  };

  const selectObjective = (id: CreationObjectiveType) => {
    const objective = template.objectives.find((item) => item.id === id);
    if (!objective || !objective.enabled) return;
    setDraft((current) => ({
      ...current,
      objective: {
        objective: id,
        subtypeId: "",
      },
      parameters: {
        ...current.parameters,
        toneId: id === "publication" || id === "reel" ? current.parameters.toneId || "authentic" : "",
        questionCountId: "",
        customQuestionCount: "",
        formatId: id === "publication" ? current.parameters.publicationPlatform : id === "reel" ? current.parameters.reelFormat : "",
        audienceId: id === "publication" || id === "reel" ? current.parameters.audienceId || "general" : "",
        requiredTopics: "",
        avoidedTopics: "",
      },
    }));
  };

  const runInterviewGeneration = async () => {
    if (!preparedPayload || generateState.loading) return;

    const controller = new AbortController();
    generationAbortRef.current = controller;
    setGenerateState({ loading: true, errorMessage: null });

    try {
      const response = await fetch("/api/content/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ payload: preparedPayload }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as GenerateContentApiResponse;

      if (!payload.ok) {
        setGenerateState({
          loading: false,
          errorMessage: payload.message || generationFailureMessage(draft.objective.objective),
        });
        return;
      }

      if (!("request" in payload) || !("result" in payload)) {
        setGenerateState({
          loading: false,
          errorMessage: generationFailureMessage(draft.objective.objective),
        });
        return;
      }

      const sessionRecord = await saveInterviewResultSession({
        payload: preparedPayload,
        request: payload.request,
        result: payload.result,
        createdAt: new Date().toISOString(),
      });

      window.sessionStorage.setItem(
        RESULT_STORAGE_KEY,
        JSON.stringify({
          payload: preparedPayload,
          request: payload.request,
          result: payload.result,
          createdAt: sessionRecord.createdAt,
          sessionId: sessionRecord.sessionId,
        })
      );
      setGenerateState({ loading: false, errorMessage: null });
      router.push(buildResultUrl(sessionRecord.sessionId, `document-${sessionRecord.createdAt}`));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setGenerateState({ loading: false, errorMessage: "Generation annulee." });
      } else {
        setGenerateState({
          loading: false,
          errorMessage: generationFailureMessage(draft.objective.objective),
        });
      }
    } finally {
      generationAbortRef.current = null;
      void loadCreditBalance();
    }
  };

  const cancelGeneration = () => {
    generationAbortRef.current?.abort();
  };

  const collectContext = useCallback(async () => {
    if (!draft.subject.type || !normalize(draft.subject.displayName)) return;

    const selectedConnectorIds: ContextConnectorId[] = [];
    if (draft.parameters.contextEnableCrm) selectedConnectorIds.push("crm");
    if (draft.parameters.contextEnableProductions) selectedConnectorIds.push("productions");
    if (draft.parameters.contextEnableManual) selectedConnectorIds.push("manual");
    if (draft.parameters.contextEnableExternalNews) selectedConnectorIds.push("external_news");

    const dateRange = buildDateRange(
      draft.parameters.contextDateRangePreset,
      draft.parameters.contextCustomFrom,
      draft.parameters.contextCustomTo
    );

    setContextState((previous) => ({
      ...previous,
      loading: true,
      errorMessage: null,
    }));

    try {
      const response = await fetch("/api/context/collect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: {
            id: draft.subject.id,
            source: draft.subject.source,
            type: draft.subject.type,
            displayName: draft.subject.displayName,
            sport: draft.subject.sport,
            clubOrOrganization: draft.subject.clubOrOrganization,
            description: draft.subject.description,
          },
          selectedConnectorIds,
          dateRange,
          sourcePreference: draft.parameters.contextSourcePreference,
          searchDepth: draft.parameters.contextSearchDepth,
          language: "fr-CH",
          manualContext: draft.parameters.additionalContext,
          contentType: draft.objective.objective ?? "interview",
          interviewType: draft.objective.subtypeId || undefined,
        }),
      });

      const payload = (await response.json()) as ContextCollectionResponse;

      if (!response.ok || !payload.ok) {
        const message = payload.ok ? "Collecte du contexte indisponible." : payload.message;
        setContextState((previous) => ({
          ...previous,
          loading: false,
          errorMessage: message,
          hasCollected: true,
        }));
        return;
      }

      setContextState({
        loading: false,
        errorMessage: null,
        items: payload.items,
        reports: payload.reports,
        researchedAt: payload.summary.researchedAt,
        dateRange: payload.summary.dateRange,
        hasCollected: true,
      });
    } catch {
      setContextState((previous) => ({
        ...previous,
        loading: false,
        errorMessage: "Impossible de collecter le contexte.",
        hasCollected: true,
      }));
    } finally {
      void loadCreditBalance();
    }
  }, [draft, loadCreditBalance]);

  const generatePublicationAngles = useCallback(async () => {
    if (!preparedPayload || draft.objective.objective !== "publication") return;

    setPublicationAnglesState((current) => ({ ...current, loading: true, errorMessage: null }));

    try {
      const response = await fetch("/api/content/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operation: "publication_angles",
          payload: preparedPayload,
        }),
      });

      const payload = (await response.json()) as GenerateContentApiResponse;
      if (!response.ok || !payload.ok || !("operation" in payload) || payload.operation !== "publication_angles") {
        const message = payload.ok ? "Impossible de proposer des angles editoriaux." : payload.message;
        setPublicationAnglesState((current) => ({ ...current, loading: false, errorMessage: message }));
        return;
      }

      setPublicationAnglesState({ loading: false, errorMessage: null, suggestions: payload.result.suggestions });
    } catch {
      setPublicationAnglesState((current) => ({
        ...current,
        loading: false,
        errorMessage: "Impossible de proposer des angles editoriaux.",
      }));
    } finally {
      void loadCreditBalance();
    }
  }, [draft.objective.objective, preparedPayload, loadCreditBalance]);

  const requestContextSearch = () => {
    if (mediaCreditRole === "media" && draft.parameters.contextEnableExternalNews) {
      setCreditModal({ kind: "external_search", cost: 1 });
      return;
    }
    void collectContext();
  };

  const requestPublicationAngles = () => {
    if (mediaCreditRole === "media") {
      setCreditModal({ kind: "publication_angles", cost: 1 });
      return;
    }
    void generatePublicationAngles();
  };

  const requestFinalGeneration = () => {
    if (mediaCreditRole === "media") {
      setCreditModal({ kind: "generation", cost: getGenerationCreditCost() });
      return;
    }
    void runInterviewGeneration();
  };

  const closeCreditModal = () => {
    if (creditModalBusy) return;
    setCreditModal(null);
  };

  const confirmCreditModal = async () => {
    if (!creditModal || creditModalBusy) return;
    setCreditModalBusy(true);
    try {
      if (creditModal.kind === "external_search") {
        await collectContext();
      } else if (creditModal.kind === "publication_angles") {
        await generatePublicationAngles();
      } else {
        await runInterviewGeneration();
      }
    } finally {
      setCreditModalBusy(false);
      setCreditModal(null);
    }
  };

  const toggleContextItem = useCallback((itemId: string, isSelected: boolean) => {
    setContextState((previous) => ({
      ...previous,
      items: previous.items.map((item) => (item.id === itemId ? { ...item, isSelected } : item)),
    }));
  }, []);

  const toggleContextCategory = useCallback((category: string, isSelected: boolean) => {
    setContextState((previous) => ({
      ...previous,
      items: previous.items.map((item) => (item.category === category ? { ...item, isSelected } : item)),
    }));
  }, []);

  const updateContextSummary = useCallback((itemId: string, summary: string) => {
    setContextState((previous) => ({
      ...previous,
      items: previous.items.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          summary,
          editedSummary: summary,
        };
      }),
    }));
  }, []);

  const contextByCategory = useMemo<ContextCategoryGroup[]>(() => {
    const map = new Map<string, ContextItem[]>();
    for (const item of contextState.items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }, [contextState.items]);

  const contextFingerprint = useMemo(() => {
    return JSON.stringify({
      subjectType: draft.subject.type,
      subjectId: draft.subject.id,
      displayName: draft.subject.displayName,
      objective: draft.objective.objective,
      subtypeId: draft.objective.subtypeId,
      additionalContext: draft.parameters.additionalContext,
      contextDateRangePreset: draft.parameters.contextDateRangePreset,
      contextCustomFrom: draft.parameters.contextCustomFrom,
      contextCustomTo: draft.parameters.contextCustomTo,
      contextSourcePreference: draft.parameters.contextSourcePreference,
      contextSearchDepth: draft.parameters.contextSearchDepth,
      contextEnableCrm: draft.parameters.contextEnableCrm,
      contextEnableProductions: draft.parameters.contextEnableProductions,
      contextEnableManual: draft.parameters.contextEnableManual,
      contextEnableExternalNews: draft.parameters.contextEnableExternalNews,
    });
  }, [
    draft.objective.objective,
    draft.objective.subtypeId,
    draft.parameters.additionalContext,
    draft.parameters.contextCustomFrom,
    draft.parameters.contextCustomTo,
    draft.parameters.contextDateRangePreset,
    draft.parameters.contextEnableCrm,
    draft.parameters.contextEnableExternalNews,
    draft.parameters.contextEnableManual,
    draft.parameters.contextEnableProductions,
    draft.parameters.contextSearchDepth,
    draft.parameters.contextSourcePreference,
    draft.subject.displayName,
    draft.subject.id,
    draft.subject.type,
  ]);

  const previousFingerprintRef = useRef(contextFingerprint);

  useEffect(() => {
    if (previousFingerprintRef.current === contextFingerprint) return;
    previousFingerprintRef.current = contextFingerprint;

    setContextState((previous) => {
      if (!previous.hasCollected && previous.items.length === 0 && !previous.errorMessage) {
        return previous;
      }
      return {
        ...previous,
        items: [],
        reports: [],
        researchedAt: undefined,
        dateRange: undefined,
        errorMessage: null,
        hasCollected: false,
      };
    });
  }, [contextFingerprint]);

  const renderSubjectStep = () => {
    return (
      <section className="creation-step-block" aria-labelledby="creation-subject-title">
        <header className="creation-step-head">
          <h2 id="creation-subject-title">Sur quel sujet souhaitez-vous creer un contenu ?</h2>
        </header>

        {draft.presetId === "new-contract" ? null : (
          <div className="creation-choice-grid">
            {subjectOptions.map((option) => {
              const Icon = option.icon;
              const isActive = draft.subject.type === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={isActive ? "creation-choice-card is-active" : "creation-choice-card"}
                  onClick={() => selectSubjectType(option.id)}
                >
                  <span className="creation-choice-icon" aria-hidden>
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{option.title}</strong>
                    <p>{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {draft.subject.type === "person" ? (
          <section className="creation-panel">
            <header>
              <h3>Personne</h3>
              <p>Selection directe depuis le CRM KLIQUE.</p>
            </header>

            {draft.subject.source === "crm" ? (
              <EntitySelector<PersonSelectorItem>
                label="Athlete ou personne"
                placeholder="Selectionner une personne"
                searchPlaceholder="Rechercher par nom, sport, club ou organisation"
                items={personItems}
                selectedId={draft.subject.id}
                loading={peopleLoading}
                errorMessage={peopleError}
                onRetry={() => {
                  void loadPeople();
                }}
                onSelect={selectPersonFromCrm}
                getItemId={(item) => item.id}
                getItemSearchText={(item) => `${item.displayName} ${item.sport} ${item.organization} ${item.status}`}
                emptyMessage="Aucune personne disponible dans le CRM"
                noResultsMessage="Aucune personne ne correspond a cette recherche"
                onOpen={() => {
                  if (people.length === 0 && !peopleLoading && !peopleError) {
                    void loadPeople();
                  }
                }}
                renderItem={(item) => (
                  <>
                    <span className="creation-person-avatar" aria-hidden>
                      {item.initials}
                    </span>
                    <span className="creation-person-copy">
                      <strong>{item.displayName}</strong>
                      <small>{item.sport || "Sport non renseigne"}</small>
                    </span>
                    <small>{item.organization || "Club non renseigne"}</small>
                  </>
                )}
                renderSelection={(item) => (
                  <>
                    <span className="creation-person-avatar" aria-hidden>
                      {item.initials}
                    </span>
                    <span className="creation-person-copy">
                      <strong>{item.displayName}</strong>
                      <small>{item.sport || "Sport non renseigne"}</small>
                    </span>
                    <small>{item.organization || "Club non renseigne"}</small>
                  </>
                )}
              />
            ) : null}

            <div className="creation-toggle-row">
              <label>
                <input
                  type="radio"
                  name="person-source"
                  checked={draft.subject.source === "crm"}
                  onChange={() => {
                    if (people.length === 0 && !peopleLoading && !peopleError) {
                      void loadPeople();
                    }
                    setDraft((current) => ({
                      ...current,
                      subject: {
                        ...current.subject,
                        source: "crm",
                      },
                    }));
                  }}
                />
                <span>Utiliser une personne CRM</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="person-source"
                  checked={draft.subject.source === "temporary"}
                  onChange={enableTemporaryPerson}
                />
                <span>Utiliser un sujet temporaire</span>
              </label>
            </div>
          </section>
        ) : null}

        {(draft.subject.type && draft.subject.type !== "person") || (draft.subject.type === "person" && draft.subject.source === "temporary") ? (
          <section className="creation-panel">
            <header>
              <h3>Details du sujet</h3>
            </header>
            <div className="creation-fields-grid">
              <label>
                <span>Nom</span>
                <input
                  type="text"
                  value={draft.subject.displayName}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      subject: { ...current.subject, displayName: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                <span>Description</span>
                <input
                  type="text"
                  value={draft.subject.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      subject: { ...current.subject, description: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                <span>Sport</span>
                <input
                  type="text"
                  value={draft.subject.sport}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      subject: { ...current.subject, sport: event.target.value },
                    }))
                  }
                />
              </label>
              <label>
                <span>Organisation</span>
                <input
                  type="text"
                  value={draft.subject.clubOrOrganization}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      subject: { ...current.subject, clubOrOrganization: event.target.value },
                    }))
                  }
                />
              </label>
            </div>
          </section>
        ) : null}
      </section>
    );
  };

  const renderChoiceOptions = (args: {
    title: string;
    options: CreationOption[];
    value: string;
    onSelect: (id: string) => void;
    groupName?: string;
  }) => {
    return (
      <section className="creation-panel">
        <header>
          <h3>{args.title}</h3>
        </header>
        <div className="creation-option-grid" data-param-group={args.groupName}>
          {args.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={args.value === option.id ? "creation-option-card is-active" : "creation-option-card"}
              onClick={() => option.enabled && args.onSelect(option.id)}
              disabled={!option.enabled}
            >
              <strong>{option.label}</strong>
              <p>{option.description}</p>
              {!option.enabled ? <small>Bientot disponible</small> : null}
            </button>
          ))}
        </div>
      </section>
    );
  };

  const renderObjectiveStep = () => {
    // Objective preselectionnee via l URL: Publication/Interview conservent l etape mais masquent les cartes de formats.
    const isRestrictedToSubselection =
      hasPreselectedObjective && (draft.objective.objective === "publication" || draft.objective.objective === "interview");

    const title = isRestrictedToSubselection
      ? draft.objective.objective === "publication"
        ? "Objectif de la publication"
        : objectiveParameters?.subtypeLabel ?? "Type d interview"
      : "Quel contenu souhaitez-vous creer ?";

    return (
      <section className="creation-step-block" aria-labelledby="creation-objective-title">
        <header className="creation-step-head">
          <h2 id="creation-objective-title">{title}</h2>
        </header>

        {!isRestrictedToSubselection ? (
          <div className="creation-objective-grid">
            {template.objectives.map((objective) => {
              const Icon = objectiveIconById[objective.id];
              const selected = draft.objective.objective === objective.id;
              return (
                <button
                  key={objective.id}
                  type="button"
                  className={selected ? "creation-objective-card is-active" : "creation-objective-card"}
                  onClick={() => selectObjective(objective.id)}
                  disabled={!objective.enabled}
                >
                  <span className="creation-choice-icon" aria-hidden>
                    <Icon size={17} />
                  </span>
                  <div>
                    <strong>{objective.title}</strong>
                    <p>{objective.description}</p>
                  </div>
                  <small>{objective.availabilityLabel}</small>
                </button>
              );
            })}
          </div>
        ) : null}

        {draft.objective.objective === "publication" ? (
          <section className="creation-panel">
            <header>
              <h3>Objectif de la publication</h3>
            </header>
            <div className="creation-option-grid" data-param-group="publication-objective">
              {publicationObjectiveOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={draft.parameters.publicationObjectiveId === option.id ? "creation-option-card is-active" : "creation-option-card"}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        publicationObjectiveId: option.id as CreationAssistantDraft["parameters"]["publicationObjectiveId"],
                      },
                    }))
                  }
                >
                  <strong>{option.label}</strong>
                  <p>{option.description}</p>
                </button>
              ))}
            </div>
            {draft.parameters.publicationObjectiveId === "free" ? (
              <label className="creation-inline-field">
                <span>Objectif libre</span>
                <input
                  type="text"
                  data-publication-objective-free="true"
                  value={draft.parameters.publicationCustomObjective}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        publicationCustomObjective: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            ) : null}
          </section>
        ) : draft.objective.objective === "reel" ? (
          <section className="creation-panel">
            <header>
              <h3>Objectif Reel</h3>
              <p>Le workflow Reel suit un schema editorial dedie avec angle, duree, format et plateforme.</p>
            </header>
          </section>
        ) : objectiveParameters ? renderChoiceOptions({
          title: objectiveParameters.subtypeLabel,
          options: objectiveParameters.subtypeOptions,
          value: draft.objective.subtypeId,
          groupName: "subtype",
          onSelect: (id) =>
            setDraft((current) => ({
              ...current,
              objective: {
                ...current.objective,
                subtypeId: id,
              },
            })),
        }) : null}
      </section>
    );
  };

  const setAfterMatchField = (field: keyof AfterMatchPresetDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      afterMatch: {
        opponent: current.afterMatch?.opponent ?? "",
        result: current.afterMatch?.result ?? "",
        competition: current.afterMatch?.competition ?? "",
        matchDate: current.afterMatch?.matchDate ?? "",
        keyFacts: current.afterMatch?.keyFacts ?? "",
        nextFixture: current.afterMatch?.nextFixture ?? "",
        [field]: value,
      },
    }));
  };

  const setBeforeMatchField = (field: keyof BeforeMatchPresetDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      beforeMatch: {
        opponent: current.beforeMatch?.opponent ?? "",
        competition: current.beforeMatch?.competition ?? "",
        matchDate: current.beforeMatch?.matchDate ?? "",
        location: current.beforeMatch?.location ?? "",
        stakes: current.beforeMatch?.stakes ?? "",
        recentForm: current.beforeMatch?.recentForm ?? "",
        keyInformation: current.beforeMatch?.keyInformation ?? "",
        [field]: value,
      },
    }));
  };

  const renderMatchStep = () => {
    const isBeforeMatch = draft.presetId === "before-match";
    const matchDraft = isBeforeMatch ? draft.beforeMatch : draft.afterMatch;
    const updateCommonMatchField = (field: "opponent" | "competition" | "matchDate", value: string) => {
      if (isBeforeMatch) {
        setBeforeMatchField(field, value);
        return;
      }
      setAfterMatchField(field, value);
    };

    return (
      <section className="creation-step-block" aria-labelledby="creation-match-title">
        <header className="creation-step-head">
          <h2 id="creation-match-title">{isBeforeMatch ? "Informations avant-match" : "Informations après-match"}</h2>
          <p>Renseignez les elements factuels de la rencontre. Aucun appel IA n est lance a cette etape.</p>
        </header>

        <section className="creation-panel">
          <div className="creation-fields-grid">
            <label>
              <span>Adversaire</span>
              <input
                type="text"
                data-match-opponent="true"
                value={matchDraft?.opponent ?? ""}
                onChange={(event) => updateCommonMatchField("opponent", event.target.value)}
              />
            </label>

            {isBeforeMatch ? (
              <label>
                <span>Lieu (optionnel)</span>
                <input
                  type="text"
                  value={draft.beforeMatch?.location ?? ""}
                  onChange={(event) => setBeforeMatchField("location", event.target.value)}
                />
              </label>
            ) : (
              <label>
                <span>Resultat</span>
                <input
                  type="text"
                  data-match-result="true"
                  placeholder="Ex: Victoire 2-1"
                  value={draft.afterMatch?.result ?? ""}
                  onChange={(event) => setAfterMatchField("result", event.target.value)}
                />
              </label>
            )}

            <label>
              <span>Competition</span>
              <input
                type="text"
                data-match-competition="true"
                value={matchDraft?.competition ?? ""}
                onChange={(event) => updateCommonMatchField("competition", event.target.value)}
              />
            </label>

            <label>
              <span>Date du match</span>
              <input
                type="date"
                data-match-date="true"
                value={matchDraft?.matchDate ?? ""}
                onChange={(event) => updateCommonMatchField("matchDate", event.target.value)}
              />
            </label>
          </div>

          {isBeforeMatch ? (
            <>
              <label className="creation-inline-field">
                <span>Enjeu (optionnel)</span>
                <textarea className="creation-textarea" value={draft.beforeMatch?.stakes ?? ""} onChange={(event) => setBeforeMatchField("stakes", event.target.value)} />
              </label>
              <label className="creation-inline-field">
                <span>Dynamique récente (optionnel)</span>
                <textarea className="creation-textarea" value={draft.beforeMatch?.recentForm ?? ""} onChange={(event) => setBeforeMatchField("recentForm", event.target.value)} />
              </label>
              <label className="creation-inline-field">
                <span>Informations importantes (optionnel)</span>
                <textarea className="creation-textarea" value={draft.beforeMatch?.keyInformation ?? ""} onChange={(event) => setBeforeMatchField("keyInformation", event.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label className="creation-inline-field">
                <span>Faits marquants (optionnel)</span>
                <textarea className="creation-textarea" data-match-key-facts="true" placeholder="Ex: but decisif a la 88e, exclusion adverse en 2e periode." value={draft.afterMatch?.keyFacts ?? ""} onChange={(event) => setAfterMatchField("keyFacts", event.target.value)} />
              </label>
              <label className="creation-inline-field">
                <span>Prochain rendez-vous (optionnel)</span>
                <textarea className="creation-textarea" data-match-next-fixture="true" placeholder="Ex: deplacement samedi prochain pour la journee suivante." value={draft.afterMatch?.nextFixture ?? ""} onChange={(event) => setAfterMatchField("nextFixture", event.target.value)} />
              </label>
            </>
          )}
        </section>
      </section>
    );
  };

  const setMatchDayStoryField = (field: keyof MatchDayStoryPresetDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      matchDayStory: {
        opponent: current.matchDayStory?.opponent ?? "",
        competition: current.matchDayStory?.competition ?? "",
        matchDate: current.matchDayStory?.matchDate ?? "",
        matchTime: current.matchDayStory?.matchTime ?? "",
        venue: current.matchDayStory?.venue ?? "",
        homeAway: current.matchDayStory?.homeAway ?? "",
        stakes: current.matchDayStory?.stakes ?? "",
        callToAction: current.matchDayStory?.callToAction ?? "",
        [field]: value,
      },
    }));
  };

  const renderMatchDayStoryStep = () => {
    return (
      <section className="creation-step-block" aria-labelledby="creation-match-day-title">
        <header className="creation-step-head">
          <h2 id="creation-match-day-title">Informations du match</h2>
          <p>Renseignez les elements factuels de la rencontre. Aucun appel IA n est lance a cette etape.</p>
        </header>

        <section className="creation-panel">
          <div className="creation-fields-grid">
            <label>
              <span>Adversaire</span>
              <input type="text" data-match-day-opponent="true" value={draft.matchDayStory?.opponent ?? ""} onChange={(event) => setMatchDayStoryField("opponent", event.target.value)} />
            </label>
            <label>
              <span>Competition (optionnel)</span>
              <input type="text" value={draft.matchDayStory?.competition ?? ""} onChange={(event) => setMatchDayStoryField("competition", event.target.value)} />
            </label>
            <label>
              <span>Date du match</span>
              <input type="date" data-match-day-date="true" value={draft.matchDayStory?.matchDate ?? ""} onChange={(event) => setMatchDayStoryField("matchDate", event.target.value)} />
            </label>
            <label>
              <span>Heure</span>
              <input type="time" data-match-day-time="true" value={draft.matchDayStory?.matchTime ?? ""} onChange={(event) => setMatchDayStoryField("matchTime", event.target.value)} />
            </label>
            <label>
              <span>Domicile / exterieur</span>
              <select data-match-day-home-away="true" value={draft.matchDayStory?.homeAway ?? ""} onChange={(event) => setMatchDayStoryField("homeAway", event.target.value)}>
                <option value="">Selectionner</option>
                <option value="home">À domicile</option>
                <option value="away">À l extérieur</option>
              </select>
            </label>
            <label>
              <span>Lieu (optionnel)</span>
              <input type="text" value={draft.matchDayStory?.venue ?? ""} onChange={(event) => setMatchDayStoryField("venue", event.target.value)} />
            </label>
          </div>
          <label className="creation-inline-field">
            <span>Enjeu / contexte (optionnel)</span>
            <textarea className="creation-textarea" value={draft.matchDayStory?.stakes ?? ""} onChange={(event) => setMatchDayStoryField("stakes", event.target.value)} />
          </label>
          <label className="creation-inline-field">
            <span>Appel a l action (optionnel)</span>
            <textarea className="creation-textarea" value={draft.matchDayStory?.callToAction ?? ""} onChange={(event) => setMatchDayStoryField("callToAction", event.target.value)} />
          </label>
        </section>
      </section>
    );
  };

  const setAfterMatchStoryField = (field: keyof AfterMatchStoryPresetDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      afterMatchStory: {
        opponent: current.afterMatchStory?.opponent ?? "",
        competition: current.afterMatchStory?.competition ?? "",
        matchDate: current.afterMatchStory?.matchDate ?? "",
        homeAway: current.afterMatchStory?.homeAway ?? "",
        score: current.afterMatchStory?.score ?? "",
        result: current.afterMatchStory?.result ?? "",
        keyMoments: current.afterMatchStory?.keyMoments ?? "",
        performance: current.afterMatchStory?.performance ?? "",
        reaction: current.afterMatchStory?.reaction ?? "",
        callToAction: current.afterMatchStory?.callToAction ?? "",
        [field]: value,
      },
    }));
  };

  const renderAfterMatchStoryStep = () => {
    return (
      <section className="creation-step-block" aria-labelledby="creation-after-match-story-title">
        <header className="creation-step-head">
          <h2 id="creation-after-match-story-title">Informations après-match</h2>
          <p>Renseignez les elements factuels de la rencontre. Aucun appel IA n est lance a cette etape.</p>
        </header>

        <section className="creation-panel">
          <div className="creation-fields-grid">
            <label>
              <span>Adversaire</span>
              <input type="text" data-after-match-story-opponent="true" value={draft.afterMatchStory?.opponent ?? ""} onChange={(event) => setAfterMatchStoryField("opponent", event.target.value)} />
            </label>
            <label>
              <span>Competition (optionnel)</span>
              <input type="text" value={draft.afterMatchStory?.competition ?? ""} onChange={(event) => setAfterMatchStoryField("competition", event.target.value)} />
            </label>
            <label>
              <span>Date du match</span>
              <input type="date" data-after-match-story-date="true" value={draft.afterMatchStory?.matchDate ?? ""} onChange={(event) => setAfterMatchStoryField("matchDate", event.target.value)} />
            </label>
            <label>
              <span>Domicile / exterieur (optionnel)</span>
              <select value={draft.afterMatchStory?.homeAway ?? ""} onChange={(event) => setAfterMatchStoryField("homeAway", event.target.value)}>
                <option value="">Selectionner</option>
                <option value="home">À domicile</option>
                <option value="away">À l extérieur</option>
              </select>
            </label>
            <label>
              <span>Score</span>
              <input type="text" data-after-match-story-score="true" value={draft.afterMatchStory?.score ?? ""} onChange={(event) => setAfterMatchStoryField("score", event.target.value)} />
            </label>
            <label>
              <span>Resultat</span>
              <select data-after-match-story-result="true" value={draft.afterMatchStory?.result ?? ""} onChange={(event) => setAfterMatchStoryField("result", event.target.value)}>
                <option value="">Selectionner</option>
                <option value="win">Victoire</option>
                <option value="draw">Match nul</option>
                <option value="loss">Défaite</option>
              </select>
            </label>
          </div>
          <label className="creation-inline-field">
            <span>Moments cles (optionnel)</span>
            <textarea className="creation-textarea" value={draft.afterMatchStory?.keyMoments ?? ""} onChange={(event) => setAfterMatchStoryField("keyMoments", event.target.value)} />
          </label>
          <label className="creation-inline-field">
            <span>Performance du sujet (optionnel)</span>
            <textarea className="creation-textarea" value={draft.afterMatchStory?.performance ?? ""} onChange={(event) => setAfterMatchStoryField("performance", event.target.value)} />
          </label>
          <label className="creation-inline-field">
            <span>Reaction / citation (optionnel)</span>
            <textarea className="creation-textarea" value={draft.afterMatchStory?.reaction ?? ""} onChange={(event) => setAfterMatchStoryField("reaction", event.target.value)} />
          </label>
          <label className="creation-inline-field">
            <span>Appel a l action (optionnel)</span>
            <textarea className="creation-textarea" value={draft.afterMatchStory?.callToAction ?? ""} onChange={(event) => setAfterMatchStoryField("callToAction", event.target.value)} />
          </label>
        </section>
      </section>
    );
  };

  const setNewContractField = (field: keyof NewContractPresetDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      newContract: {
        organization: current.newContract?.organization ?? "",
        contractType: current.newContract?.contractType ?? "",
        customContractType: current.newContract?.customContractType ?? "",
        role: current.newContract?.role ?? "",
        startDate: current.newContract?.startDate ?? "",
        duration: current.newContract?.duration ?? "",
        keyTerms: current.newContract?.keyTerms ?? "",
        quote: current.newContract?.quote ?? "",
        objectives: current.newContract?.objectives ?? "",
        [field]: value,
      },
    }));
  };

  const renderContractStep = () => {
    return (
      <section className="creation-step-block" aria-labelledby="creation-contract-title">
        <header className="creation-step-head">
          <h2 id="creation-contract-title">Informations du nouveau contrat</h2>
          <p>Renseignez les elements factuels de l engagement. Aucun appel IA n est lance a cette etape.</p>
        </header>

        <section className="creation-panel">
          <div className="creation-fields-grid">
            <label>
              <span>Organisation / Club</span>
              <input
                type="text"
                data-contract-organization="true"
                value={draft.newContract?.organization ?? ""}
                onChange={(event) => setNewContractField("organization", event.target.value)}
              />
            </label>

            <label>
              <span>Nature de l annonce</span>
              <select
                data-contract-type="true"
                value={draft.newContract?.contractType ?? ""}
                onChange={(event) => setNewContractField("contractType", event.target.value)}
              >
                <option value="">Selectionner</option>
                {NEW_CONTRACT_TYPE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {draft.newContract?.contractType === "other" ? (
              <label>
                <span>Precisez la nature de l annonce</span>
                <input
                  type="text"
                  data-contract-custom-type="true"
                  value={draft.newContract?.customContractType ?? ""}
                  onChange={(event) => setNewContractField("customContractType", event.target.value)}
                />
              </label>
            ) : null}

            <label>
              <span>Role</span>
              <input
                type="text"
                data-contract-role="true"
                value={draft.newContract?.role ?? ""}
                onChange={(event) => setNewContractField("role", event.target.value)}
              />
            </label>

            <label>
              <span>Date de debut (optionnel)</span>
              <input
                type="date"
                value={draft.newContract?.startDate ?? ""}
                onChange={(event) => setNewContractField("startDate", event.target.value)}
              />
            </label>

            <label>
              <span>Duree (optionnel, ex: 2 ans)</span>
              <input
                type="text"
                placeholder="Ex: 2 ans"
                value={draft.newContract?.duration ?? ""}
                onChange={(event) => setNewContractField("duration", event.target.value)}
              />
            </label>
          </div>

          <label className="creation-inline-field">
            <span>Elements cles (optionnel)</span>
            <textarea
              className="creation-textarea"
              value={draft.newContract?.keyTerms ?? ""}
              onChange={(event) => setNewContractField("keyTerms", event.target.value)}
            />
          </label>

          <label className="creation-inline-field">
            <span>Citation (optionnel)</span>
            <textarea
              className="creation-textarea"
              value={draft.newContract?.quote ?? ""}
              onChange={(event) => setNewContractField("quote", event.target.value)}
            />
          </label>

          <label className="creation-inline-field">
            <span>Objectifs (optionnel)</span>
            <textarea
              className="creation-textarea"
              value={draft.newContract?.objectives ?? ""}
              onChange={(event) => setNewContractField("objectives", event.target.value)}
            />
          </label>
        </section>
      </section>
    );
  };

  const renderAngleStep = () => {
    if (draft.objective.objective === "reel") {
      return (
        <section className="creation-step-block" aria-labelledby="creation-angle-title">
          <header className="creation-step-head">
            <h2 id="creation-angle-title">Angle editorial</h2>
            <p>Definissez l angle central du Reel. Aucun appel IA n est lance a cette etape.</p>
          </header>

          <section className="creation-panel">
            <label className="creation-inline-field">
              <span>Angle Reel</span>
              <textarea
                className="creation-textarea"
                data-reel-custom-angle="true"
                placeholder="Ex: Montrer la progression recente en 30 secondes avec une narration energique."
                value={draft.parameters.reelSelectedAngle}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      reelSelectedAngle: event.target.value,
                    },
                  }))
                }
              />
            </label>
          </section>
        </section>
      );
    }

    if (draft.objective.objective === "story") {
      return (
        <section className="creation-step-block" aria-labelledby="creation-angle-title">
          <header className="creation-step-head">
            <h2 id="creation-angle-title">Angle editorial</h2>
            <p>Definissez l angle central de la Story. Aucun appel IA n est lance a cette etape.</p>
          </header>

          <section className="creation-panel">
            <label className="creation-inline-field">
              <span>Angle Story</span>
              <textarea
                className="creation-textarea"
                data-story-custom-angle="true"
                placeholder="Ex: Montrer les coulisses de la preparation avant match en 5 frames rythmees."
                value={draft.parameters.storySelectedAngle}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      storySelectedAngle: event.target.value,
                    },
                  }))
                }
              />
            </label>
          </section>
        </section>
      );
    }

    if (draft.objective.objective !== "publication") {
      return (
        <section className="creation-step-block">
          <p className="creation-muted">Cette etape est reservee aux publications.</p>
        </section>
      );
    }

    return (
      <section className="creation-step-block" aria-labelledby="creation-angle-title">
        <header className="creation-step-head">
          <h2 id="creation-angle-title">Angle editorial</h2>
          <p>Proposez 3 a 5 angles contextualises avec le CIE ou redigez votre angle personnalise.</p>
          {mediaCreditRole === "media" ? (
            <p className="creation-muted">
              {draft.presetId === "before-match"
                ? `Les angles coûtent ${formatCreditCount(1)}. La génération finale coûtera ensuite ${formatCreditCount(1)}.`
                : `Publication complète : ${formatCreditCount(2)} (1 crédit pour les angles + 1 crédit pour les propositions).`}
            </p>
          ) : null}
        </header>

        <section className="creation-panel">
          <div className="creation-footer-actions">
            <button
              type="button"
              className="crm-primary-action"
              onClick={requestPublicationAngles}
              disabled={publicationAnglesState.loading || !preparedPayload || isPublicationAnglesBlocked}
            >
              {publicationAnglesState.loading ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
              {publicationAnglesState.loading ? "Generation des angles" : "Proposer des angles"}
            </button>
          </div>

          {publicationAnglesState.errorMessage ? <p className="creation-error" role="alert">{publicationAnglesState.errorMessage}</p> : null}

          {publicationAnglesState.suggestions.length > 0 ? (
            <div className="creation-option-grid">
              {publicationAnglesState.suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className={draft.parameters.publicationSelectedAngle === suggestion.title ? "creation-option-card is-active" : "creation-option-card"}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        publicationSelectedAngle: suggestion.title,
                      },
                    }))
                  }
                >
                  <strong>{suggestion.title}</strong>
                  <p>{suggestion.rationale}</p>
                </button>
              ))}
            </div>
          ) : null}

          <label className="creation-inline-field">
            <span>Angle personnalise</span>
            <textarea
              className="creation-textarea"
              data-publication-custom-angle="true"
              placeholder="Ex: montrer la progression recente du sujet avec un ton pedagogique et inspire."
              value={draft.parameters.publicationSelectedAngle}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  parameters: {
                    ...current.parameters,
                    publicationSelectedAngle: event.target.value,
                  },
                }))
              }
            />
          </label>
        </section>
      </section>
    );
  };

  const renderParametersStep = () => {
    if (draft.objective.objective === "reel") {
      return (
        <section className="creation-step-block" aria-labelledby="creation-params-title">
          <header className="creation-step-head">
            <h2 id="creation-params-title">Parametres Reel</h2>
          </header>

          <section className="creation-panel">
            <div className="creation-fields-grid">
              <label>
                <span>Plateforme</span>
                <select
                  data-reel-platform="true"
                  value={draft.parameters.reelPlatform}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        reelPlatform: event.target.value as CreationAssistantDraft["parameters"]["reelPlatform"],
                      },
                    }))
                  }
                >
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube_shorts">YouTube Shorts</option>
                </select>
              </label>

              <label>
                <span>Duree</span>
                <select
                  data-reel-duration="true"
                  value={draft.parameters.reelDuration}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        reelDuration: event.target.value as CreationAssistantDraft["parameters"]["reelDuration"],
                      },
                    }))
                  }
                >
                  <option value="15s">15s</option>
                  <option value="30s">30s</option>
                  <option value="45s">45s</option>
                  <option value="60s">60s</option>
                  <option value="90s">90s</option>
                </select>
              </label>

              <label>
                <span>Format</span>
                <select
                  data-reel-format="true"
                  value={draft.parameters.reelFormat}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        reelFormat: event.target.value as CreationAssistantDraft["parameters"]["reelFormat"],
                      },
                    }))
                  }
                >
                  <option value="face_camera">Face camera</option>
                  <option value="voice_over">Voix off</option>
                  <option value="dynamic_montage">Montage dynamique</option>
                  <option value="short_interview">Interview courte</option>
                  <option value="storytelling">Storytelling</option>
                </select>
              </label>

              <label>
                <span>Ton</span>
                <select
                  data-reel-tone="true"
                  value={draft.parameters.toneId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, toneId: event.target.value },
                    }))
                  }
                >
                  {CONTENT_TONE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Audience</span>
                <select
                  data-reel-audience="true"
                  value={draft.parameters.audienceId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, audienceId: event.target.value },
                    }))
                  }
                >
                  {CONTENT_AUDIENCE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {draft.parameters.toneId === "free" ? (
              <label className="creation-inline-field">
                <span>Ton libre</span>
                <input
                  type="text"
                  data-reel-tone-free="true"
                  value={draft.parameters.customTone}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, customTone: event.target.value },
                    }))
                  }
                />
              </label>
            ) : null}

            {draft.parameters.audienceId === "free" ? (
              <label className="creation-inline-field">
                <span>Public libre</span>
                <input
                  type="text"
                  data-reel-audience-free="true"
                  value={draft.parameters.customAudience}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, customAudience: event.target.value },
                    }))
                  }
                />
              </label>
            ) : null}

            <label className="creation-inline-field">
              <span>Contexte supplementaire</span>
              <textarea
                className="creation-textarea"
                value={draft.parameters.additionalContext}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, additionalContext: event.target.value },
                  }))
                }
              />
            </label>

            <label className="creation-disabled-check">
              <input
                type="checkbox"
                checked={draft.parameters.useContextIntelligence}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      useContextIntelligence: event.target.checked,
                    },
                  }))
                }
              />
              <span>Enrichir avec le contexte intelligent</span>
            </label>
          </section>
        </section>
      );
    }

    if (draft.objective.objective === "story") {
      return (
        <section className="creation-step-block" aria-labelledby="creation-params-title">
          <header className="creation-step-head">
            <h2 id="creation-params-title">Parametres Story</h2>
          </header>

          <section className="creation-panel">
            <div className="creation-fields-grid">
              <label>
                <span>Plateforme</span>
                <select
                  data-story-platform="true"
                  value={draft.parameters.storyPlatform}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        storyPlatform: event.target.value as CreationAssistantDraft["parameters"]["storyPlatform"],
                      },
                    }))
                  }
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </label>

              <label>
                <span>Nombre de frames</span>
                <input
                  type="number"
                  min={1}
                  data-story-frame-count="true"
                  value={draft.parameters.storyFrameCount}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, storyFrameCount: event.target.value },
                    }))
                  }
                />
              </label>

              <label>
                <span>Ton</span>
                <select
                  data-story-tone="true"
                  value={draft.parameters.toneId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, toneId: event.target.value },
                    }))
                  }
                >
                  {CONTENT_TONE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Audience</span>
                <select
                  data-story-audience="true"
                  value={draft.parameters.audienceId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, audienceId: event.target.value },
                    }))
                  }
                >
                  {CONTENT_AUDIENCE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {draft.parameters.toneId === "free" ? (
              <label className="creation-inline-field">
                <span>Ton libre</span>
                <input
                  type="text"
                  data-story-tone-free="true"
                  value={draft.parameters.customTone}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, customTone: event.target.value },
                    }))
                  }
                />
              </label>
            ) : null}

            {draft.parameters.audienceId === "free" ? (
              <label className="creation-inline-field">
                <span>Public libre</span>
                <input
                  type="text"
                  data-story-audience-free="true"
                  value={draft.parameters.customAudience}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, customAudience: event.target.value },
                    }))
                  }
                />
              </label>
            ) : null}

            <label className="creation-inline-field">
              <span>Contexte supplementaire</span>
              <textarea
                className="creation-textarea"
                value={draft.parameters.additionalContext}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, additionalContext: event.target.value },
                  }))
                }
              />
            </label>

            <label className="creation-disabled-check">
              <input
                type="checkbox"
                checked={draft.parameters.useContextIntelligence}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      useContextIntelligence: event.target.checked,
                    },
                  }))
                }
              />
              <span>Enrichir avec le contexte intelligent</span>
            </label>
          </section>
        </section>
      );
    }

    if (draft.objective.objective === "publication") {
      return (
        <section className="creation-step-block" aria-labelledby="creation-params-title">
          <header className="creation-step-head">
            <h2 id="creation-params-title">Parametres de publication</h2>
          </header>

          <section className="creation-panel">
            <div className="creation-fields-grid">
              <label>
                <span>Plateforme</span>
                <select
                  data-publication-platform="true"
                  value={draft.parameters.publicationPlatform}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        publicationPlatform: event.target.value as CreationAssistantDraft["parameters"]["publicationPlatform"],
                      },
                    }))
                  }
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="x">X</option>
                  <option value="threads">Threads</option>
                  <option value="site_blog">Site/Blog</option>
                  <option value="newsletter">Newsletter</option>
                  <option value="other">Autre</option>
                </select>
              </label>

              <label>
                <span>Ton</span>
                <select
                  data-publication-tone="true"
                  value={draft.parameters.toneId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, toneId: event.target.value },
                    }))
                  }
                >
                  {CONTENT_TONE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Longueur</span>
                <select
                  value={draft.parameters.publicationLength}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        publicationLength: event.target.value as CreationAssistantDraft["parameters"]["publicationLength"],
                      },
                    }))
                  }
                >
                  <option value="short">Courte</option>
                  <option value="medium">Moyenne</option>
                  <option value="long">Longue</option>
                  <option value="free">Libre</option>
                </select>
              </label>

              <label>
                <span>Audience</span>
                <select
                  data-publication-audience="true"
                  value={draft.parameters.audienceId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, audienceId: event.target.value },
                    }))
                  }
                >
                  {CONTENT_AUDIENCE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {draft.parameters.toneId === "free" ? (
              <label className="creation-inline-field">
                <span>Ton libre</span>
                <input
                  type="text"
                  data-publication-tone-free="true"
                  value={draft.parameters.customTone}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, customTone: event.target.value },
                    }))
                  }
                />
              </label>
            ) : null}

            {draft.parameters.audienceId === "free" ? (
              <label className="creation-inline-field">
                <span>Public libre</span>
                <input
                  type="text"
                  data-publication-audience-free="true"
                  value={draft.parameters.customAudience}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: { ...current.parameters, customAudience: event.target.value },
                    }))
                  }
                />
              </label>
            ) : null}

            <label className="creation-inline-field">
              <span>CTA</span>
              <input
                type="text"
                value={draft.parameters.publicationCta}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, publicationCta: event.target.value },
                  }))
                }
              />
            </label>

            <label className="creation-inline-field">
              <span>Hashtags</span>
              <input
                type="text"
                placeholder="#klique #sport #team"
                value={draft.parameters.publicationHashtags}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, publicationHashtags: event.target.value },
                  }))
                }
              />
            </label>

            <label className="creation-disabled-check">
              <input
                type="checkbox"
                checked={draft.parameters.publicationUseEmojis}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, publicationUseEmojis: event.target.checked },
                  }))
                }
              />
              <span>Inclure des emojis</span>
            </label>

            <label className="creation-inline-field">
              <span>Instructions particulieres</span>
              <textarea
                className="creation-textarea"
                value={draft.parameters.publicationSpecialInstructions}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, publicationSpecialInstructions: event.target.value },
                  }))
                }
              />
            </label>

            <label className="creation-inline-field">
              <span>Elements a inclure</span>
              <textarea
                className="creation-textarea"
                value={draft.parameters.publicationIncludeElements}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, publicationIncludeElements: event.target.value },
                  }))
                }
              />
            </label>

            <label className="creation-inline-field">
              <span>Elements a eviter</span>
              <textarea
                className="creation-textarea"
                value={draft.parameters.publicationAvoidElements}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, publicationAvoidElements: event.target.value },
                  }))
                }
              />
            </label>
          </section>

          <section className="creation-panel">
            <header>
              <h3>Contexte intelligent</h3>
              <p>Utiliser les donnees du workspace et, si active, des sources externes verifiables pour mieux contextualiser le contenu.</p>
            </header>

            <label className="creation-disabled-check">
              <input
                type="checkbox"
                checked={draft.parameters.useContextIntelligence}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      useContextIntelligence: event.target.checked,
                    },
                  }))
                }
              />
              <span>Enrichir avec le contexte intelligent</span>
            </label>
            <ul className="creation-context-list">
              <li><strong>CRM</strong><small>Donnees internes du workspace</small></li>
              <li><strong>Productions</strong><small>Contenus et activites deja produits</small></li>
              <li><strong>Contexte manuel</strong><small>Elements saisis dans l assistant</small></li>
              <li><strong>Actualite externe</strong><small>Sources verifiables optionnelles</small></li>
            </ul>
            <p className="creation-muted">La recherche est lancee uniquement a l etape Contexte intelligent.</p>
          </section>
        </section>
      );
    }

    if (!objectiveParameters) {
      return (
        <section className="creation-step-block">
          <p className="creation-muted">Selectionnez d abord un objectif disponible.</p>
        </section>
      );
    }

    return (
      <section className="creation-step-block" aria-labelledby="creation-params-title">
        <header className="creation-step-head">
          <h2 id="creation-params-title">{objectiveParameters.configurationTitle}</h2>
        </header>

        {renderChoiceOptions({
          title: "Ton",
          options: objectiveParameters.toneOptions,
          value: draft.parameters.toneId,
          groupName: "tone",
          onSelect: (id) => setDraft((current) => ({ ...current, parameters: { ...current.parameters, toneId: id } })),
        })}

        {draft.parameters.toneId === "free" ? (
          <label className="creation-inline-field">
            <span>Ton libre</span>
            <input
              type="text"
              data-interview-tone-free="true"
              value={draft.parameters.customTone}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  parameters: { ...current.parameters, customTone: event.target.value },
                }))
              }
            />
          </label>
        ) : null}

        <section className="creation-panel">
          <header>
            <h3>Nombre de questions</h3>
          </header>
          <div className="creation-count-row" role="group" aria-label="Nombre de questions">
            {objectiveParameters.questionCountOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={draft.parameters.questionCountId === option.id ? "creation-count-chip is-active" : "creation-count-chip"}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      questionCountId: option.id,
                    },
                  }))
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          {objectiveParameters.questionCountOptions.find((item) => item.id === draft.parameters.questionCountId)?.isCustom ? (
            <label className="creation-inline-field">
              <span>Nombre personnalise</span>
              <input
                type="number"
                data-custom-question-count="true"
                min={CREATION_MIN_QUESTION_COUNT}
                max={CREATION_MAX_QUESTION_COUNT}
                value={draft.parameters.customQuestionCount}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, customQuestionCount: event.target.value },
                  }))
                }
              />
            </label>
          ) : null}

          {objectiveParameters.questionCountOptions.find((item) => item.id === draft.parameters.questionCountId)?.isCustom ? (
            <p className="creation-muted">
              Valeur autorisee: {CREATION_MIN_QUESTION_COUNT} a {CREATION_MAX_QUESTION_COUNT}.
            </p>
          ) : null}
        </section>

        {renderChoiceOptions({
          title: "Format",
          options: objectiveParameters.formatOptions,
          value: draft.parameters.formatId,
          groupName: "format",
          onSelect: (id) => setDraft((current) => ({ ...current, parameters: { ...current.parameters, formatId: id } })),
        })}

        {renderChoiceOptions({
          title: "Public",
          options: objectiveParameters.audienceOptions,
          value: draft.parameters.audienceId,
          groupName: "audience",
          onSelect: (id) => setDraft((current) => ({ ...current, parameters: { ...current.parameters, audienceId: id } })),
        })}

        {draft.parameters.audienceId === "free" ? (
          <label className="creation-inline-field">
            <span>Public libre</span>
            <input
              type="text"
              data-interview-audience-free="true"
              value={draft.parameters.customAudience}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  parameters: { ...current.parameters, customAudience: event.target.value },
                }))
              }
            />
          </label>
        ) : null}

        <section className="creation-panel">
          <header>
            <h3>Contexte supplementaire</h3>
          </header>
          <textarea
            className="creation-textarea"
            placeholder="Cette interview sera realisee apres le tournoi de Gstaad."
            value={draft.parameters.additionalContext}
            onChange={(event) =>
              setDraft((current) => ({ ...current, parameters: { ...current.parameters, additionalContext: event.target.value } }))
            }
          />

          <label className="creation-inline-field">
            <span>Sujets obligatoires</span>
            <textarea
              className="creation-textarea"
              placeholder="Ex: parcours junior, role du collectif"
              value={draft.parameters.requiredTopics}
              onChange={(event) =>
                setDraft((current) => ({ ...current, parameters: { ...current.parameters, requiredTopics: event.target.value } }))
              }
            />
          </label>

          <label className="creation-inline-field">
            <span>Sujets a eviter</span>
            <textarea
              className="creation-textarea"
              placeholder="Ex: details contractuels non valides"
              value={draft.parameters.avoidedTopics}
              onChange={(event) =>
                setDraft((current) => ({ ...current, parameters: { ...current.parameters, avoidedTopics: event.target.value } }))
              }
            />
          </label>

        </section>

        <section className="creation-panel">
          <header>
            <h3>Contexte intelligent</h3>
            <p>Utiliser les donnees du workspace et, si active, des sources externes verifiables pour mieux contextualiser le contenu.</p>
          </header>

          <label className="creation-disabled-check">
            <input
              type="checkbox"
              checked={draft.parameters.useContextIntelligence}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  parameters: {
                    ...current.parameters,
                    useContextIntelligence: event.target.checked,
                  },
                }))
              }
            />
            <span>Enrichir avec le contexte intelligent</span>
          </label>
          <ul className="creation-context-list">
            <li><strong>CRM</strong><small>Donnees internes du workspace</small></li>
            <li><strong>Productions</strong><small>Contenus et activites deja produits</small></li>
            <li><strong>Contexte manuel</strong><small>Elements saisis dans l assistant</small></li>
            <li><strong>Actualite externe</strong><small>Sources verifiables optionnelles</small></li>
          </ul>
          <p className="creation-muted">La recherche est lancee uniquement a l etape Contexte intelligent.</p>
        </section>
      </section>
    );
  };

  const renderContextStep = () => {
    const title = isPublicationFlow ? "Contexte intelligent" : "Preparation du contexte";

    if (!draft.parameters.useContextIntelligence) {
      return (
        <section className="creation-step-block" aria-labelledby="creation-context-title">
          <header className="creation-step-head">
            <h2 id="creation-context-title">{title}</h2>
          </header>
          <p className="creation-muted">{isPublicationFlow ? "Le contexte intelligent est desactive. Activez l option \"Enrichir avec le contexte intelligent\" a l etape precedente pour utiliser les donnees du workspace." : "Le contexte intelligent est desactive. Passez a l etape suivante pour generer le contenu."}</p>
        </section>
      );
    }

    const selectedCount = contextState.items.filter((item) => item.isSelected).length;
    return (
      <section className="creation-step-block" aria-labelledby="creation-context-title">
        <header className="creation-step-head">
          <h2 id="creation-context-title">{title}</h2>
          <p>Collectez, relisez et selectionnez les elements qui seront utilises pour la generation.</p>
        </header>

        <section className="creation-panel">
          <header>
            <h3>Configuration de la recherche</h3>
          </header>

          <div className="creation-toggle-row">
            <label>
              <input
                type="checkbox"
                checked={draft.parameters.contextEnableCrm}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      contextEnableCrm: event.target.checked,
                    },
                  }))
                }
              />
              <span>CRM</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.parameters.contextEnableProductions}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      contextEnableProductions: event.target.checked,
                    },
                  }))
                }
              />
              <span>Productions</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.parameters.contextEnableManual}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      contextEnableManual: event.target.checked,
                    },
                  }))
                }
              />
              <span>Contexte manuel</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.parameters.contextEnableExternalNews}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      contextEnableExternalNews: event.target.checked,
                    },
                  }))
                }
              />
              <span>Actualite externe</span>
            </label>
          </div>

          {draft.parameters.contextEnableExternalNews ? (
            <p className="creation-muted" data-role="external-news-credit-note">
              {`Une recherche d'actualité externe consomme ${formatCreditCount(1)} maximum (le cache peut la rendre gratuite).`}
            </p>
          ) : null}

          <div className="creation-fields-grid">
            <label>
              <span>Periode</span>
              <select
                value={draft.parameters.contextDateRangePreset}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      contextDateRangePreset: event.target.value as CreationAssistantDraft["parameters"]["contextDateRangePreset"],
                    },
                  }))
                }
              >
                <option value="last_7_days">7 derniers jours</option>
                <option value="last_30_days">30 derniers jours</option>
                <option value="last_90_days">90 derniers jours</option>
                <option value="last_12_months">12 derniers mois</option>
                <option value="custom">Personnalisee</option>
              </select>
            </label>

            <label>
              <span>Preference des sources</span>
              <select
                value={draft.parameters.contextSourcePreference}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      contextSourcePreference: event.target.value as CreationAssistantDraft["parameters"]["contextSourcePreference"],
                    },
                  }))
                }
              >
                <option value="official_only">Officielles uniquement</option>
                <option value="official_and_reliable">Officielles et fiables</option>
                <option value="broad">Large</option>
              </select>
            </label>

            <label>
              <span>Profondeur de recherche</span>
              <select
                value={draft.parameters.contextSearchDepth}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: {
                      ...current.parameters,
                      contextSearchDepth: event.target.value as CreationAssistantDraft["parameters"]["contextSearchDepth"],
                    },
                  }))
                }
              >
                <option value="quick">Rapide</option>
                <option value="standard">Standard</option>
                <option value="deep">Approfondie</option>
              </select>
            </label>
          </div>

          {draft.parameters.contextDateRangePreset === "custom" ? (
            <div className="creation-fields-grid">
              <label>
                <span>Du</span>
                <input
                  type="date"
                  value={draft.parameters.contextCustomFrom}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        contextCustomFrom: event.target.value,
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Au</span>
                <input
                  type="date"
                  value={draft.parameters.contextCustomTo}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        contextCustomTo: event.target.value,
                      },
                    }))
                  }
                />
              </label>
            </div>
          ) : null}
        </section>

        <section className="creation-panel">
          <div className="creation-footer-actions">
            <button
              type="button"
              className="crm-primary-action"
              onClick={requestContextSearch}
              disabled={contextState.loading || (mediaCreditRole === "media" && draft.parameters.contextEnableExternalNews && isExternalSearchBlocked)}
            >
              {contextState.loading ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
              {contextState.loading ? "Recherche en cours" : contextState.hasCollected ? "Relancer la recherche du contexte" : "Rechercher le contexte"}
            </button>
            <p className="creation-muted">Seuls les elements selectionnes seront transmis a la generation.</p>
          </div>

          {contextState.errorMessage ? (
            <p className="creation-error" role="alert">{contextState.errorMessage}</p>
          ) : null}

          {contextState.hasCollected ? (
            <dl className="creation-summary-grid">
              <div><dt>Elements trouves</dt><dd>{contextState.items.length}</dd></div>
              <div><dt>Elements selectionnes</dt><dd>{selectedCount}</dd></div>
              <div><dt>Date de recherche</dt><dd>{contextState.researchedAt ? formatDateTimeLabel(contextState.researchedAt) : "Non definie"}</dd></div>
              <div><dt>Periode</dt><dd>{formatDateRangeLabel(contextState.dateRange)}</dd></div>
            </dl>
          ) : null}
        </section>

        {contextState.reports.length > 0 ? (
          <section className="creation-panel">
            <header>
              <h3>Etat des connecteurs</h3>
            </header>
            <ul className="creation-context-list">
              {contextState.reports.map((report) => (
                <li key={report.connectorId} className={`creation-context-report is-${report.status}`}>
                  <div className="creation-context-report-head">
                    <strong>{getConnectorLabel(report.connectorId)}</strong>
                    <span>{getConnectorStatusLabel(report.status)}</span>
                  </div>
                  <small>
                    {report.itemCount > 0 ? `${report.itemCount} element(s)` : "Aucun element"}
                    {report.message ? ` | ${getConnectorStatusMessage(report)}` : ` | ${getConnectorStatusMessage(report)}`}
                  </small>
                  {report.connectorId === "external_news" && (report.status === "error" || report.status === "unavailable") ? (
                    <button type="button" className="contents-ghost-button" onClick={requestContextSearch} disabled={contextState.loading}>
                      Reessayer
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {contextByCategory.length > 0 ? (
          <section className="creation-panel">
            <header>
              <h3>Revision et selection</h3>
            </header>

            {contextByCategory.map((group) => {
              const selectedInCategory = group.items.filter((item) => item.isSelected).length;
              return (
                <article key={group.category} className="creation-context-category">
                  <div className="creation-context-category-head">
                    <h4>{group.category}</h4>
                    <p>{selectedInCategory}/{group.items.length} selectionne(s)</p>
                    <div className="creation-toggle-row">
                      <button type="button" className="contents-ghost-button" onClick={() => toggleContextCategory(group.category, true)}>
                        Tout selectionner
                      </button>
                      <button type="button" className="contents-ghost-button" onClick={() => toggleContextCategory(group.category, false)}>
                        Tout deselectionner
                      </button>
                    </div>
                  </div>

                  <ul className="creation-context-list">
                    {group.items.map((item) => (
                      <li key={item.id} className={item.isSensitive ? "is-sensitive" : ""}>
                        <label>
                          <input
                            type="checkbox"
                            checked={item.isSelected}
                            onChange={(event) => toggleContextItem(item.id, event.target.checked)}
                          />
                          <span>{item.title}</span>
                        </label>
                        <small>
                          {item.sourceName}
                          {item.publishedAt ? ` | ${item.publishedAt}` : ""}
                          {item.isSensitive ? " | Verifier avant publication" : ""}
                        </small>
                        <textarea
                          className="creation-textarea"
                          value={item.editedSummary || item.summary}
                          readOnly={!item.isEditable}
                          onChange={(event) => updateContextSummary(item.id, event.target.value)}
                        />
                        {item.sourceUrl ? (
                          <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">Voir la source</a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </section>
        ) : null}
      </section>
    );
  };

  const renderSummaryStep = () => {
    if (draft.objective.objective === "publication") {
      const selectedContextItems = contextState.items.filter((item) => item.isSelected);
      const selectedExternalCount = selectedContextItems.filter((item) => item.connectorId === "external_news").length;
      const researchPeriodLabel = contextState.dateRange
        ? formatDateRangeLabel(contextState.dateRange)
        : draft.parameters.contextDateRangePreset === "custom"
          ? `${draft.parameters.contextCustomFrom || "-"} -> ${draft.parameters.contextCustomTo || "-"}`
          : formatDateRangePresetLabel(draft.parameters.contextDateRangePreset);

      return (
        <section className="creation-step-block" aria-labelledby="creation-summary-title">
          <header className="creation-step-head">
            <h2 id="creation-summary-title">Verification</h2>
            {mediaCreditRole === "media" ? (
              <p className="creation-muted">
                {draft.presetId === "new-contract"
                  ? `Nouveau contrat : ${formatCreditCount(1)} pour générer 3 propositions.`
                  : `Publication complète : ${formatCreditCount(2)} (1 crédit pour les angles + 1 crédit pour les propositions).`}
              </p>
            ) : null}
          </header>

          <dl className="creation-summary-grid">
            <div><dt>Sujet</dt><dd>{draft.subject.displayName || "Non defini"}</dd></div>
            <div><dt>Type de sujet</dt><dd>{formatSubjectType(draft.subject.type)}</dd></div>
            <div><dt>Objectif</dt><dd>{draft.presetId === "after-match" ? "Après-match" : draft.presetId === "before-match" ? "Avant-match" : draft.presetId === "new-contract" ? "Nouveau contrat" : draft.parameters.publicationObjectiveId}</dd></div>
            {draft.presetId === "after-match" ? (
              <>
                <div><dt>Adversaire</dt><dd>{draft.afterMatch?.opponent || "Non defini"}</dd></div>
                <div><dt>Resultat</dt><dd>{draft.afterMatch?.result || "Non defini"}</dd></div>
                <div><dt>Competition</dt><dd>{draft.afterMatch?.competition || "Non definie"}</dd></div>
                <div><dt>Date du match</dt><dd>{draft.afterMatch?.matchDate || "Non definie"}</dd></div>
                <div><dt>Faits marquants</dt><dd>{draft.afterMatch?.keyFacts || "Aucun"}</dd></div>
                <div><dt>Prochain rendez-vous</dt><dd>{draft.afterMatch?.nextFixture || "Aucun"}</dd></div>
              </>
            ) : null}
            {draft.presetId === "before-match" ? (
              <>
                <div><dt>Adversaire</dt><dd>{draft.beforeMatch?.opponent || "Non defini"}</dd></div>
                <div><dt>Competition</dt><dd>{draft.beforeMatch?.competition || "Non definie"}</dd></div>
                <div><dt>Date du match</dt><dd>{draft.beforeMatch?.matchDate || "Non definie"}</dd></div>
                <div><dt>Lieu</dt><dd>{draft.beforeMatch?.location || "Non defini"}</dd></div>
                <div><dt>Enjeu</dt><dd>{draft.beforeMatch?.stakes || "Aucun"}</dd></div>
                <div><dt>Dynamique recente</dt><dd>{draft.beforeMatch?.recentForm || "Aucune"}</dd></div>
                <div><dt>Informations importantes</dt><dd>{draft.beforeMatch?.keyInformation || "Aucune"}</dd></div>
              </>
            ) : null}
            {draft.presetId === "new-contract" ? (
              <>
                <div><dt>Organisation</dt><dd>{draft.newContract?.organization || "Non definie"}</dd></div>
                <div><dt>Nature de l annonce</dt><dd>{resolveNewContractTypeLabel(draft.newContract?.contractType ?? "", draft.newContract?.customContractType ?? "") || "Non definie"}</dd></div>
                <div><dt>Role</dt><dd>{draft.newContract?.role || "Non defini"}</dd></div>
                <div><dt>Date de debut</dt><dd>{draft.newContract?.startDate || "Non definie"}</dd></div>
                <div><dt>Duree</dt><dd>{draft.newContract?.duration || "Non definie"}</dd></div>
                <div><dt>Elements cles</dt><dd>{draft.newContract?.keyTerms || "Aucun"}</dd></div>
                <div><dt>Citation</dt><dd>{draft.newContract?.quote || "Aucune"}</dd></div>
                <div><dt>Objectifs</dt><dd>{draft.newContract?.objectives || "Aucun"}</dd></div>
              </>
            ) : null}
            {draft.presetId === "new-contract" ? null : (
              <div><dt>Angle</dt><dd>{draft.parameters.publicationSelectedAngle || "Non defini"}</dd></div>
            )}
            <div><dt>Plateforme</dt><dd>{draft.parameters.publicationPlatform}</dd></div>
            <div><dt>Ton</dt><dd>{resolveSelectedToneLabel(draft.parameters.toneId, draft.parameters.customTone) || "Non defini"}</dd></div>
            <div><dt>Longueur</dt><dd>{draft.parameters.publicationLength}</dd></div>
            <div><dt>Audience</dt><dd>{resolveSelectedAudienceLabel(draft.parameters.audienceId, draft.parameters.customAudience) || "Non definie"}</dd></div>
            <div><dt>CTA</dt><dd>{draft.parameters.publicationCta || "Aucun"}</dd></div>
            <div><dt>Hashtags</dt><dd>{draft.parameters.publicationHashtags || "Aucun"}</dd></div>
            <div><dt>Emojis</dt><dd>{draft.parameters.publicationUseEmojis ? "Oui" : "Non"}</dd></div>
            <div><dt>Instructions</dt><dd>{draft.parameters.publicationSpecialInstructions || "Aucune"}</dd></div>
            <div><dt>Elements a inclure</dt><dd>{draft.parameters.publicationIncludeElements || "Aucun"}</dd></div>
            <div><dt>Elements a eviter</dt><dd>{draft.parameters.publicationAvoidElements || "Aucun"}</dd></div>
            <div><dt>Contexte intelligent</dt><dd>{draft.parameters.useContextIntelligence ? "Active" : "Desactive"}</dd></div>
            {draft.parameters.useContextIntelligence ? (
              <>
                <div><dt>Elements selectionnes</dt><dd>{selectedContextItems.length}</dd></div>
                <div><dt>Sources externes</dt><dd>{draft.parameters.contextEnableExternalNews ? String(selectedExternalCount) : "0"}</dd></div>
                <div><dt>Periode de recherche</dt><dd>{researchPeriodLabel}</dd></div>
              </>
            ) : null}
          </dl>

          <div className="creation-finish-panel">
            {mediaCreditRole === "media" && draft.presetId === "before-match" ? (
              <p className="creation-muted">{`Cette génération coûte ${formatCreditCount(1)}. L angle a déjà été facturé.`}</p>
            ) : null}
            <button
              type="button"
              className="crm-primary-action"
              onClick={requestFinalGeneration}
              disabled={!preparedPayload || generateState.loading || isGenerationBlocked}
            >
              {generateState.loading ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
              {generateState.loading ? "Generation en cours" : "Generer 3 propositions"}
            </button>
            {generateState.errorMessage ? (
              <p className="creation-error" role="alert">{generateState.errorMessage}</p>
            ) : null}
          </div>
        </section>
      );
    }

    if (draft.objective.objective === "reel") {
      const selectedContextItems = contextState.items.filter((item) => item.isSelected);
      const selectedExternalCount = selectedContextItems.filter((item) => item.connectorId === "external_news").length;
      const researchPeriodLabel = contextState.dateRange
        ? formatDateRangeLabel(contextState.dateRange)
        : draft.parameters.contextDateRangePreset === "custom"
          ? `${draft.parameters.contextCustomFrom || "-"} -> ${draft.parameters.contextCustomTo || "-"}`
          : formatDateRangePresetLabel(draft.parameters.contextDateRangePreset);

      return (
        <section className="creation-step-block" aria-labelledby="creation-summary-title">
          <header className="creation-step-head">
            <h2 id="creation-summary-title">Recapitulatif Reel</h2>
          </header>

          <dl className="creation-summary-grid">
            <div><dt>Sujet</dt><dd>{draft.subject.displayName || "Non defini"}</dd></div>
            <div><dt>Type de sujet</dt><dd>{formatSubjectType(draft.subject.type)}</dd></div>
            <div><dt>Objectif</dt><dd>Reel</dd></div>
            <div><dt>Angle editorial</dt><dd>{draft.parameters.reelSelectedAngle || "Non defini"}</dd></div>
            <div><dt>Plateforme</dt><dd>{draft.parameters.reelPlatform}</dd></div>
            <div><dt>Duree</dt><dd>{draft.parameters.reelDuration}</dd></div>
            <div><dt>Format</dt><dd>{draft.parameters.reelFormat}</dd></div>
            <div><dt>Ton</dt><dd>{resolveSelectedToneLabel(draft.parameters.toneId, draft.parameters.customTone) || "Non defini"}</dd></div>
            <div><dt>Audience</dt><dd>{resolveSelectedAudienceLabel(draft.parameters.audienceId, draft.parameters.customAudience) || "Non definie"}</dd></div>
            <div><dt>Contexte</dt><dd>{draft.parameters.additionalContext || "Aucun contexte supplementaire"}</dd></div>
            <div><dt>Contexte intelligent</dt><dd>{draft.parameters.useContextIntelligence ? "Active" : "Desactive"}</dd></div>
            {draft.parameters.useContextIntelligence ? (
              <>
                <div><dt>Elements selectionnes</dt><dd>{selectedContextItems.length}</dd></div>
                <div><dt>Sources externes</dt><dd>{draft.parameters.contextEnableExternalNews ? String(selectedExternalCount) : "0"}</dd></div>
                <div><dt>Periode de recherche</dt><dd>{researchPeriodLabel}</dd></div>
              </>
            ) : null}
          </dl>

          <div className="creation-finish-panel">
            <button
              type="button"
              className="crm-primary-action"
              onClick={requestFinalGeneration}
              disabled={!preparedPayload || generateState.loading || isGenerationBlocked}
            >
              {generateState.loading ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
              {generateState.loading ? "Generation en cours" : "Generer 3 concepts Reel"}
            </button>
            {generateState.errorMessage ? (
              <p className="creation-error" role="alert">{generateState.errorMessage}</p>
            ) : null}
          </div>
        </section>
      );
    }

    if (draft.objective.objective === "story") {
      const selectedContextItems = contextState.items.filter((item) => item.isSelected);
      const selectedExternalCount = selectedContextItems.filter((item) => item.connectorId === "external_news").length;
      const researchPeriodLabel = contextState.dateRange
        ? formatDateRangeLabel(contextState.dateRange)
        : draft.parameters.contextDateRangePreset === "custom"
          ? `${draft.parameters.contextCustomFrom || "-"} -> ${draft.parameters.contextCustomTo || "-"}`
          : formatDateRangePresetLabel(draft.parameters.contextDateRangePreset);

      return (
        <section className="creation-step-block" aria-labelledby="creation-summary-title">
          <header className="creation-step-head">
            <h2 id="creation-summary-title">Recapitulatif Story</h2>
          </header>

          <dl className="creation-summary-grid">
            <div><dt>Sujet</dt><dd>{draft.subject.displayName || "Non defini"}</dd></div>
            <div><dt>Type de sujet</dt><dd>{formatSubjectType(draft.subject.type)}</dd></div>
            <div><dt>Objectif</dt><dd>{draft.presetId === "match-day-story" ? "Jour de match" : draft.presetId === "after-match-story" ? "Après-match" : "Story"}</dd></div>
            {draft.presetId === "match-day-story" ? (
              <>
                <div><dt>Adversaire</dt><dd>{draft.matchDayStory?.opponent || "Non defini"}</dd></div>
                <div><dt>Competition</dt><dd>{draft.matchDayStory?.competition || "Non definie"}</dd></div>
                <div><dt>Date du match</dt><dd>{formatMatchDate(draft.matchDayStory?.matchDate ?? "")}</dd></div>
                <div><dt>Heure</dt><dd>{draft.matchDayStory?.matchTime || "Non definie"}</dd></div>
                <div><dt>Lieu</dt><dd>{draft.matchDayStory?.venue || "Non defini"}</dd></div>
                <div><dt>Domicile / extérieur</dt><dd>{draft.matchDayStory?.homeAway === "home" ? "À domicile" : draft.matchDayStory?.homeAway === "away" ? "À l extérieur" : "Non definie"}</dd></div>
                <div><dt>Enjeu / contexte</dt><dd>{draft.matchDayStory?.stakes || "Aucun"}</dd></div>
                <div><dt>Appel a l action</dt><dd>{draft.matchDayStory?.callToAction || "Aucun"}</dd></div>
              </>
            ) : draft.presetId === "after-match-story" ? (
              <>
                <div><dt>Adversaire</dt><dd>{draft.afterMatchStory?.opponent || "Non defini"}</dd></div>
                <div><dt>Competition</dt><dd>{draft.afterMatchStory?.competition || "Non definie"}</dd></div>
                <div><dt>Date du match</dt><dd>{formatMatchDate(draft.afterMatchStory?.matchDate ?? "")}</dd></div>
                <div><dt>Domicile / extérieur</dt><dd>{draft.afterMatchStory?.homeAway === "home" ? "À domicile" : draft.afterMatchStory?.homeAway === "away" ? "À l extérieur" : "Non defini"}</dd></div>
                <div><dt>Score</dt><dd>{draft.afterMatchStory?.score || "Non defini"}</dd></div>
                <div><dt>Resultat</dt><dd>{draft.afterMatchStory?.result === "win" ? "Victoire" : draft.afterMatchStory?.result === "draw" ? "Match nul" : draft.afterMatchStory?.result === "loss" ? "Défaite" : "Non defini"}</dd></div>
                <div><dt>Moments cles</dt><dd>{draft.afterMatchStory?.keyMoments || "Aucun"}</dd></div>
                <div><dt>Performance du sujet</dt><dd>{draft.afterMatchStory?.performance || "Non definie"}</dd></div>
                <div><dt>Reaction / citation</dt><dd>{draft.afterMatchStory?.reaction || "Aucune"}</dd></div>
                <div><dt>Appel a l action</dt><dd>{draft.afterMatchStory?.callToAction || "Aucun"}</dd></div>
              </>
            ) : (
              <div><dt>Angle editorial</dt><dd>{draft.parameters.storySelectedAngle || "Non defini"}</dd></div>
            )}
            <div><dt>Plateforme</dt><dd>{draft.parameters.storyPlatform}</dd></div>
            <div><dt>Nombre de séquences</dt><dd>{draft.parameters.storyFrameCount}</dd></div>
            <div><dt>Ton</dt><dd>{resolveSelectedToneLabel(draft.parameters.toneId, draft.parameters.customTone) || "Non defini"}</dd></div>
            <div><dt>Audience</dt><dd>{resolveSelectedAudienceLabel(draft.parameters.audienceId, draft.parameters.customAudience) || "Non definie"}</dd></div>
            <div><dt>Contexte</dt><dd>{draft.parameters.additionalContext || "Aucun contexte supplementaire"}</dd></div>
            <div><dt>Contexte intelligent</dt><dd>{draft.parameters.useContextIntelligence ? "Active" : "Desactive"}</dd></div>
            {draft.parameters.useContextIntelligence ? (
              <>
                <div><dt>Elements selectionnes</dt><dd>{selectedContextItems.length}</dd></div>
                <div><dt>Sources externes</dt><dd>{draft.parameters.contextEnableExternalNews ? String(selectedExternalCount) : "0"}</dd></div>
                <div><dt>Periode de recherche</dt><dd>{researchPeriodLabel}</dd></div>
              </>
            ) : null}
          </dl>

          <div className="creation-finish-panel">
            {mediaCreditRole === "media" && (draft.presetId === "match-day-story" || draft.presetId === "after-match-story") ? (
              <p className="creation-muted">{`Cette génération coûte ${formatCreditCount(getGenerationCreditCost())}.`}</p>
            ) : null}
            <button
              type="button"
              className="crm-primary-action"
              onClick={requestFinalGeneration}
              disabled={!preparedPayload || generateState.loading || isGenerationBlocked}
            >
              {generateState.loading ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
              {generateState.loading
                ? "Generation en cours"
                : draft.presetId === "match-day-story" || draft.presetId === "after-match-story"
                  ? `Générer ${draft.parameters.storyFrameCount} séquences Story`
                  : "Generer 3 sequences Story"}
            </button>
            {generateState.errorMessage ? (
              <p className="creation-error" role="alert">{generateState.errorMessage}</p>
            ) : null}
          </div>
        </section>
      );
    }

    const params = objectiveParameters;
    const toneLabel = params
      ? draft.parameters.toneId === "free"
        ? normalize(draft.parameters.customTone) || "Libre"
        : findOption(params.toneOptions, draft.parameters.toneId)?.label
      : "";
    const formatLabel = params ? findOption(params.formatOptions, draft.parameters.formatId)?.label : "";
    const audienceLabel = params
      ? draft.parameters.audienceId === "free"
        ? normalize(draft.parameters.customAudience) || "Libre"
        : findOption(params.audienceOptions, draft.parameters.audienceId)?.label
      : "";
    const subtypeLabel = params ? findOption(params.subtypeOptions, draft.objective.subtypeId)?.label : "";

    let questionCountLabel = "";
    if (params) {
      const selected = params.questionCountOptions.find((item) => item.id === draft.parameters.questionCountId);
      questionCountLabel = selected?.isCustom ? draft.parameters.customQuestionCount : selected?.label ?? "";
    }

    const selectedContextItems = contextState.items.filter((item) => item.isSelected);
    const selectedExternalCount = selectedContextItems.filter((item) => item.connectorId === "external_news").length;
    const researchPeriodLabel = contextState.dateRange
      ? formatDateRangeLabel(contextState.dateRange)
      : draft.parameters.contextDateRangePreset === "custom"
        ? `${draft.parameters.contextCustomFrom || "-"} -> ${draft.parameters.contextCustomTo || "-"}`
        : formatDateRangePresetLabel(draft.parameters.contextDateRangePreset);

    return (
      <section className="creation-step-block" aria-labelledby="creation-summary-title">
        <header className="creation-step-head">
          <h2 id="creation-summary-title">Recapitulatif</h2>
        </header>

        <dl className="creation-summary-grid">
          <div><dt>Sujet</dt><dd>{draft.subject.displayName || "Non defini"}</dd></div>
          <div><dt>Type de sujet</dt><dd>{formatSubjectType(draft.subject.type)}</dd></div>
          <div><dt>Objectif</dt><dd>{selectedObjectiveTitle}</dd></div>
          <div><dt>Type</dt><dd>{subtypeLabel || "Non defini"}</dd></div>
          <div><dt>Ton</dt><dd>{toneLabel || "Non defini"}</dd></div>
          <div><dt>Longueur</dt><dd>{questionCountLabel || "Non defini"}</dd></div>
          <div><dt>Format</dt><dd>{formatLabel || "Non defini"}</dd></div>
          <div><dt>Public</dt><dd>{audienceLabel || "Non defini"}</dd></div>
          <div><dt>Contexte</dt><dd>{draft.parameters.additionalContext || "Aucun contexte supplementaire"}</dd></div>
          <div><dt>Contexte intelligent</dt><dd>{draft.parameters.useContextIntelligence ? "Active" : "Desactive"}</dd></div>
          {draft.parameters.useContextIntelligence ? (
            <>
              <div><dt>Elements selectionnes</dt><dd>{selectedContextItems.length}</dd></div>
              <div><dt>Sources internes</dt><dd>{enabledConnectorLabels.length ? enabledConnectorLabels.join(", ") : "Aucune"}</dd></div>
              <div><dt>Sources externes</dt><dd>{draft.parameters.contextEnableExternalNews ? String(selectedExternalCount) : "0"}</dd></div>
              <div><dt>Periode de recherche</dt><dd>{researchPeriodLabel}</dd></div>
            </>
          ) : null}
          <div><dt>Sujets obligatoires</dt><dd>{draft.parameters.requiredTopics || "Aucun"}</dd></div>
          <div><dt>Sujets a eviter</dt><dd>{draft.parameters.avoidedTopics || "Aucun"}</dd></div>
        </dl>

        <div className="creation-finish-panel">
          <button
            type="button"
            className="crm-primary-action"
            onClick={requestFinalGeneration}
            disabled={!preparedPayload || generateState.loading || isGenerationBlocked}
          >
            {generateState.loading ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
            {generateState.loading ? "Creation en cours" : params?.finalActionLabel ?? "Creer le contenu"}
          </button>
          {generateState.errorMessage ? (
            <p className="creation-error" role="alert">{generateState.errorMessage}</p>
          ) : null}

          {generateState.loading ? (
            <section className="creation-generation-state" aria-live="polite" aria-busy="true">
              <header>
                <h3>Creation de votre interview</h3>
              </header>
              <ul>
                <li><Bot size={14} aria-hidden /> Analyse du sujet</li>
                <li><Bot size={14} aria-hidden /> Construction du contexte</li>
                <li><Bot size={14} aria-hidden /> Preparation editoriale</li>
                <li><Bot size={14} aria-hidden /> Generation</li>
                <li><Bot size={14} aria-hidden /> Validation</li>
              </ul>
              <button type="button" className="contents-ghost-button" onClick={cancelGeneration}>
                Annuler
              </button>
            </section>
          ) : null}
        </div>
      </section>
    );
  };

  return (
    <section className="creation-assistant-screen">
      <header className="creation-assistant-head">
        <div>
          <h1>Assistant de creation</h1>
          <p>Configurez votre contenu en {steps.length} etapes.</p>
        </div>
        {mediaCreditRole === "media" && creditBalance ? (
          <p className="creation-muted" data-role="ai-credit-indicator">
            {creditBalance.hasActivePeriod
              ? `${formatCreditCount(creditBalance.balance)} disponible${creditBalance.balance === 1 ? "" : "s"}`
              : "Aucune période de crédits active"}
            {mediaSubscriptionLoaded ? (
              mediaSubscription ? (
                <>
                  {" · "}
                  {getMediaSubscriptionPlan(mediaSubscription.planCode)?.label ?? mediaSubscription.planCode}
                  {` · ${formatSubscriptionStatus(mediaSubscription.status)} jusqu au ${formatSubscriptionDate(mediaSubscription.currentPeriodEnd)}`}
                </>
              ) : (
                " · Aucune offre active"
              )
            ) : null}
          </p>
        ) : null}
        <Link href="/contents" className="crm-secondary-action-link">Quitter</Link>
      </header>

      <nav className="creation-steps-track" aria-label="Progression de l assistant">
        {steps.map((item, index) => {
          const isDone = index < effectiveStepIndex;
          const isCurrent = index === effectiveStepIndex;
          return (
            <div key={item.id} className={isCurrent ? "creation-step-pill is-current" : isDone ? "creation-step-pill is-done" : "creation-step-pill"}>
              <span aria-hidden>{isDone ? <Check size={14} /> : <Circle size={14} />}</span>
              <strong>{item.label}</strong>
            </div>
          );
        })}
        <div className="creation-track-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((effectiveStepIndex + 1) / steps.length) * 100)}>
          <span style={{ width: `${Math.round(((effectiveStepIndex + 1) / steps.length) * 100)}%` }} />
        </div>
      </nav>

      {step.id === "subject" ? renderSubjectStep() : null}
      {step.id === "objective" ? renderObjectiveStep() : null}
      {step.id === "match" ? renderMatchStep() : null}
      {step.id === "match-day" ? renderMatchDayStoryStep() : null}
      {step.id === "after-match-story" ? renderAfterMatchStoryStep() : null}
      {step.id === "contract" ? renderContractStep() : null}
      {step.id === "angle" ? renderAngleStep() : null}
      {step.id === "parameters" ? renderParametersStep() : null}
      {step.id === "context" ? renderContextStep() : null}
      {step.id === "summary" ? renderSummaryStep() : null}

      {stepErrorMessage ? (
        <p className="creation-error" role="alert">{stepErrorMessage}</p>
      ) : null}

      <footer className="creation-footer-actions">
        <button type="button" className="contents-secondary-button" onClick={movePrevious} disabled={effectiveStepIndex === 0}>
          <ArrowLeft size={15} aria-hidden /> Precedent
        </button>
        <div className="creation-footer-right">
          <Link href="/contents" className="contents-ghost-button">Quitter</Link>
          <button type="button" className="crm-primary-action" onClick={moveNext} disabled={effectiveStepIndex === steps.length - 1}>
            Suivant <ArrowRight size={15} aria-hidden />
          </button>
        </div>
      </footer>

      {creditModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-credit-modal-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="creation-panel" style={{ maxWidth: 420, width: "100%", background: "#ffffff" }}>
            <header>
              <h3 id="ai-credit-modal-title">
                {creditModal.kind === "external_search"
                  ? "Confirmer la recherche externe"
                  : creditModal.kind === "publication_angles"
                    ? "Générer 3 angles éditoriaux"
                    : "Confirmer la génération"}
              </h3>
            </header>
            <dl className="creation-summary-grid">
              <div>
                <dt>Coût</dt>
                <dd>{creditModal.kind === "external_search" ? `${formatCreditCount(creditModal.cost)} maximum` : formatCreditCount(creditModal.cost)}</dd>
              </div>
              <div><dt>Solde actuel</dt><dd>{formatCreditCount(creditBalance ? creditBalance.balance : 0)}</dd></div>
              <div>
                <dt>Solde estimé après action</dt>
                <dd>{formatCreditCount(Math.max((creditBalance ? creditBalance.balance : 0) - creditModal.cost, 0))}</dd>
              </div>
            </dl>
            {isCreditCostBlocked(creditModal.cost) ? (
              <p className="creation-error" role="alert">
                {`Crédits insuffisants : ${formatCreditCount(creditModal.cost)} requis, ${formatCreditCount(creditBalance ? creditBalance.balance : 0)} disponible${(creditBalance ? creditBalance.balance : 0) === 1 ? "" : "s"}.`}
              </p>
            ) : null}
            <div className="creation-footer-actions">
              <button type="button" className="contents-ghost-button" onClick={closeCreditModal} disabled={creditModalBusy}>
                Annuler
              </button>
              <button
                type="button"
                className="crm-primary-action"
                onClick={confirmCreditModal}
                disabled={creditModalBusy || isCreditCostBlocked(creditModal.cost)}
              >
                {creditModalBusy ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
                {creditModal.kind === "external_search" ? "Valider et lancer la recherche" : `Valider et utiliser ${formatCreditCount(creditModal.cost)}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
