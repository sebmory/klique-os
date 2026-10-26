"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
} from "react";
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
import type { Athlete, AthletesResponse, MediaAthleteDirectoryEntry } from "@/types/athlete";
import type {
  ArticleAngleSuggestionsRequest,
  ArticleFinalResult,
  ArticleGenerationRequest,
  ArticleStructureSuggestion,
  GenerateContentApiResponse,
  PublicationAngleSuggestion,
} from "@/types/content-generation";
import {
  ContextCollectionResponse,
  ContextConnectorId,
  ContextConnectorReport,
  ContextDateRange,
  ContextItem,
  ContextItemCategory,
  MANUAL_EDITORIAL_MATERIAL_LIMIT,
  MANUAL_EDITORIAL_TEXT_LIMIT,
  MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT,
  ManualEditorialMaterial,
  ManualInterviewSource,
  ManualInterviewSpeakerRole,
} from "@/types/context-intelligence";
import { EntitySelector } from "@/components/ui/EntitySelector";
import { getMediaSubscriptionPlan } from "@/lib/media-subscriptions/plans";
import {
  CREATION_MAX_QUESTION_COUNT,
  CREATION_MIN_QUESTION_COUNT,
  ContentCreationAssistantService,
  createInitialAssistantDraft,
  type AfterMatchPresetDraft,
  type CreationAssistantDraft,
  type CreationObjectiveType,
  type CreationOption,
  type CreationSubjectType,
} from "@/services/content-creation-assistant";
import { buildResultUrl, saveArticleResultSession, saveInterviewResultSession } from "@/services/content-result-sessions";
import { navigateToContentResult } from "@/services/content-result-navigation";
import {
  buildArticleAngleSuggestionsRequest,
  buildArticleGenerationRequest,
} from "@/services/content-intelligence/article-ui-request";
import { CONTENT_AUDIENCE_OPTIONS, CONTENT_TONE_OPTIONS, getSharedOptionLabel } from "@/services/content-shared-options";
import type { ContentCreationContext, ContentPresetId } from "@/services/contents-hub";
import { buildDateRange, formatDateRangeLabel, formatDateTimeLabel } from "@/services/context-intelligence/utils";
import { runContentsBackfill } from "@/services/content-backfill";
import { useArticleDraftPersistence } from "@/components/contents/useArticleDraftPersistence";
import type {
  ArticleCreationDraftPayload,
  ArticleCreationDraftStepId,
} from "@/types/article-creation-draft";
import type { AthleteNewsArticlePrefill } from "@/types/athlete-news-report";
import type { SportsWatchArticlePrefill } from "@/types/sports-watch";
import { buildAthleteNewsEditorialMaterial } from "@/services/athlete-news-reports";

type CreationAssistantScreenProps = {
  context: ContentCreationContext;
  durableArticleDraftsEnabled?: boolean;
  initialArticleDraftId?: string;
  initialAthleteNewsReportId?: string;
  initialSportsWatchCandidateId?: string;
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
  collectionId?: string;
  expiresAt?: string;
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

type InterviewExcerptPreview = {
  sourceId: string;
  start: number;
  end: number;
  text: string;
  speakerRole: ManualInterviewSpeakerRole | "";
};

type StepId = "subject" | "objective" | "match" | "angle" | "structure" | "parameters" | "context" | "summary";

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

const articleSteps: Array<{ id: StepId; label: string }> = [
  { id: "subject", label: "Etape 1" },
  { id: "objective", label: "Etape 2" },
  { id: "parameters", label: "Etape 3" },
  { id: "context", label: "Etape 4" },
  { id: "angle", label: "Etape 5" },
  { id: "structure", label: "Etape 6" },
  { id: "summary", label: "Etape 7" },
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

const getStepsForObjective = (
  objective: CreationObjectiveType | null,
  hasPreselectedObjective = false,
  presetId?: ContentPresetId
): Array<{ id: StepId; label: string }> => {
  // Le preset Apres-match remplace entierement l etape objective par une etape match dediee.
  if (objective === "publication" && presetId === "after-match") {
    return afterMatchSteps.map((item, index) => ({ id: item.id, label: `Etape ${index + 1}` }));
  }

  const baseSteps = objective === "article"
    ? articleSteps
    : objective === "publication"
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

const preselectableObjectives: CreationObjectiveType[] = ["interview", "article", "publication", "reel", "story"];

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
  article: FileText,
  publication: FileText,
  reel: Clapperboard,
  story: Radio,
  podcast: Mic,
  newsletter: FileText,
  campaign: Megaphone,
  sponsoring_file: Handshake,
};

const normalize = (value: unknown): string => String(value ?? "").trim();

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
  return "Personnalisée";
};

const connectorLabels: Record<ContextConnectorId, string> = {
  crm: "CRM",
  productions: "Productions",
  manual: "Contexte manuel",
  external_news: "Actualité externe",
  calendar: "Calendrier",
  results: "Résultats",
  official_website: "Site officiel",
  rss: "Flux RSS",
  social: "Réseaux sociaux",
  documents: "Documents",
  previous_content: "Contenu précédent",
};

const getConnectorLabel = (connectorId: ContextConnectorId): string => connectorLabels[connectorId] ?? connectorId;

const generationFailureMessage = (objective: CreationObjectiveType | null): string => {
  if (objective === "publication") return "Impossible de creer la publication.";
  if (objective === "reel") return "Impossible de creer le Reel.";
  return "Impossible de creer l interview.";
};

const getConnectorStatusLabel = (status: ContextConnectorReport["status"]): string => {
  if (status === "completed") return "Données récupérées";
  if (status === "empty") return "Aucune donnée reçue";
  if (status === "unavailable") return "Non disponible";
  if (status === "running") return "Recherche en cours";
  if (status === "pending") return "En attente";
  return "Erreur";
};

export const getConnectorStatusMessage = (report: ContextConnectorReport): string => {
  if (report.message) return report.message;
  if (report.status === "completed" && report.itemCount > 0) {
    return `${report.itemCount} élément${report.itemCount === 1 ? "" : "s"} récupéré${report.itemCount === 1 ? "" : "s"}.`;
  }
  if (report.connectorId === "manual") return "Aucun contexte manuel fourni.";
  if (report.connectorId === "crm" && report.status === "empty") return "Aucune donnée éditoriale disponible pour ce sujet CRM.";
  if (report.connectorId === "crm") return "Le sujet CRM n’a pas pu être chargé.";
  if (report.connectorId === "productions") return "Aucune production liée.";
  if (report.connectorId === "external_news" && report.status === "empty") return "Aucune actualité récente vérifiable n’a été trouvée pour cette période.";
  if (report.connectorId === "external_news" && report.status === "unavailable") return "La recherche externe n’est pas configurée ou n’a pas pu démarrer.";
  if (report.connectorId === "external_news" && report.status === "error") return "L’actualité externe a rencontré une erreur.";
  return "Aucune information disponible.";
};

const contextCategoryLabels: Record<ContextItemCategory, string> = {
  profile: "Profil",
  club_or_organization: "Club ou organisation",
  recent_news: "Actualité récente",
  performance: "Performance",
  result: "Résultat",
  schedule: "Calendrier",
  transfer_or_contract: "Transfert ou contrat",
  injury_or_return: "Santé ou retour",
  selection: "Sélection",
  production: "Production",
  previous_content: "Contenu précédent",
  user_note: "Note utilisateur",
  event: "Evenement",
  other: "Autre",
};

const DRAFT_STORAGE_KEY = "klique.contents.creation-assistant.draft.v1";
const WORKFLOW_STORAGE_KEY = "klique.contents.creation-assistant.workflow.v2";
const RESULT_STORAGE_KEY = "klique.contents.creation-assistant.interview-result.v1";

type PersistedCreationWorkflow = {
  version: 2;
  contextKey: string;
  draft: CreationAssistantDraft;
  stepIndex: number;
  contextState: ContextCollectState;
};

const emptyContextCollectState = (): ContextCollectState => ({
  loading: false,
  errorMessage: null,
  items: [],
  reports: [],
  hasCollected: false,
});

const creationContextKey = (context: ContentCreationContext): string =>
  JSON.stringify({
    mode: context.mode,
    subjectId: context.subjectId ?? "",
    subjectName: context.subjectName ?? "",
    subjectType: context.subjectType ?? "",
    objective: context.objective ?? "",
    presetId: context.presetId ?? "",
  });

const buildContextFingerprint = (draft: CreationAssistantDraft): string =>
  JSON.stringify({
    subjectType: draft.subject.type,
    subjectId: draft.subject.id,
    displayName: draft.subject.displayName,
    objective: draft.objective.objective,
    subtypeId: draft.objective.subtypeId,
    additionalContext: draft.parameters.additionalContext,
    manualEditorialMaterials: draft.parameters.manualEditorialMaterials ?? [],
    manualInterviewSource: draft.parameters.manualInterviewSource ?? null,
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

type ArticleWorkflowState = {
  loadingAction: "angles" | "structures" | "final" | null;
  errorMessage: string | null;
  suggestions: PublicationAngleSuggestion[];
  structures: ArticleStructureSuggestion[];
  selectedStructureId: string;
  blockDetails: ArticleBlockDetails | null;
};

type ArticleBlockDetails = {
  reasons: string[];
  missingInformation: string[];
  contradictions: string[];
  warnings: string[];
  itemDiagnostics: Array<{
    itemId: string;
    status: "eligible" | "caution" | "ineligible";
    reasons: string[];
  }>;
  suggestedArticleTypes: Array<"portrait" | "analyse">;
};

type ArticleApiError = {
  ok: false;
  message?: string;
  editorial?: {
    reasons?: string[];
    missingInformation?: string[];
    contradictions?: string[];
    warnings?: string[];
    itemDiagnostics?: ArticleBlockDetails["itemDiagnostics"];
    suggestedArticleTypes?: ArticleBlockDetails["suggestedArticleTypes"];
  };
};

const formatArticleApiError = (payload: ArticleApiError | null, fallback: string): string => {
  return payload?.message || fallback;
};

const readArticleBlockDetails = (payload: ArticleApiError | null): ArticleBlockDetails | null => {
  if (!payload?.editorial) return null;
  return {
    reasons: payload.editorial.reasons ?? [],
    missingInformation: payload.editorial.missingInformation ?? [],
    contradictions: payload.editorial.contradictions ?? [],
    warnings: payload.editorial.warnings ?? [],
    itemDiagnostics: payload.editorial.itemDiagnostics ?? [],
    suggestedArticleTypes: payload.editorial.suggestedArticleTypes ?? [],
  };
};

export function CreationAssistantScreen({
  context,
  durableArticleDraftsEnabled = false,
  initialArticleDraftId,
  initialAthleteNewsReportId,
  initialSportsWatchCandidateId,
}: CreationAssistantScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const summaryStepRequested = searchParams.get("step") === "summary";
  const currentContextKey = creationContextKey(context);
  const initialContextKeyRef = useRef(currentContextKey);
  const previousContextKeyRef = useRef(currentContextKey);

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
  const isArticleFlow = draft.objective.objective === "article";
  const steps = useMemo(
    () => getStepsForObjective(draft.objective.objective, hasPreselectedObjective, draft.presetId),
    [draft.objective.objective, hasPreselectedObjective, draft.presetId]
  );
  const [stepIndex, setStepIndex] = useState(summaryStepRequested ? initialStepCount - 1 : 0);
  const [people, setPeople] = useState<PersonSelectorItem[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [generateState, setGenerateState] = useState<CreationGenerateState>({ loading: false, errorMessage: null });
  const [contextState, setContextState] = useState<ContextCollectState>(emptyContextCollectState);
  const [workflowHydrated, setWorkflowHydrated] = useState(
    () => durableArticleDraftsEnabled && context.objective === "article",
  );
  const [stepErrorMessage, setStepErrorMessage] = useState<string | null>(null);
  const [publicationAnglesState, setPublicationAnglesState] = useState<PublicationAngleState>({
    loading: false,
    errorMessage: null,
    suggestions: [],
  });
  const [articleWorkflowState, setArticleWorkflowState] = useState<ArticleWorkflowState>({
    loadingAction: null,
    errorMessage: null,
    suggestions: [],
    structures: [],
    selectedStructureId: "",
    blockDetails: null,
  });
  const [articleChoicesNeedReview, setArticleChoicesNeedReview] = useState(false);
  const [contextItemEditState, setContextItemEditState] = useState<{
    itemId: string;
    value: string;
  } | null>(null);
  const [interviewExcerptPreview, setInterviewExcerptPreview] = useState<InterviewExcerptPreview | null>(null);
  const [interviewFeedback, setInterviewFeedback] = useState<{
    kind: "error" | "success" | "information";
    message: string;
  } | null>(null);
  const contextFingerprint = useMemo(() => buildContextFingerprint(draft), [draft]);
  const previousFingerprintRef = useRef(contextFingerprint);
  const interviewSourceTextRef = useRef<HTMLTextAreaElement | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationInFlightRef = useRef(false);
  const resultNavigationStartedRef = useRef(false);
  const athleteNewsPrefillAppliedRef = useRef(false);
  const sportsWatchPrefillAppliedRef = useRef(false);
  const [athleteNewsPrefill, setAthleteNewsPrefill] = useState<AthleteNewsArticlePrefill | null>(null);
  const [athleteNewsPrefillError, setAthleteNewsPrefillError] = useState<string | null>(null);
  const [sportsWatchPrefill, setSportsWatchPrefill] = useState<SportsWatchArticlePrefill | null>(null);
  const [sportsWatchPrefillError, setSportsWatchPrefillError] = useState<string | null>(null);

  // Detecte le role media via la reponse de /api/ai-credits/balance, sans dependre d une autre source.
  const [mediaCreditRole, setMediaCreditRole] = useState<"unknown" | "media" | "other">("unknown");
  const [creditBalance, setCreditBalance] = useState<{ hasActivePeriod: boolean; balance: number } | null>(null);
  const [creditModal, setCreditModal] = useState<null | {
    kind: "external_search" | "publication_angles" | "article_angles" | "article_structures" | "generation";
    cost: number;
  }>(null);
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
    if (isArticleFlow) {
      return ({ breve: 1, court: 2, moyen: 3, long: 4 })[draft.parameters.articleLength];
    }
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
  const durableArticleDraftsActive = durableArticleDraftsEnabled && isArticleFlow;
  const articleDraftPayload = useMemo<ArticleCreationDraftPayload>(() => ({
    schemaVersion: 1,
    contextKey: currentContextKey,
    draft,
    stepId: (step?.id ?? "subject") as ArticleCreationDraftStepId,
    contextState: {
      collectionId: contextState.collectionId,
      expiresAt: contextState.expiresAt,
      items: contextState.items,
      reports: contextState.reports,
      researchedAt: contextState.researchedAt,
      dateRange: contextState.dateRange,
      hasCollected: contextState.hasCollected,
    },
    articleWorkflow: {
      suggestions: articleWorkflowState.suggestions,
      structures: articleWorkflowState.structures,
      selectedStructureId: articleWorkflowState.selectedStructureId,
      choicesNeedReview: articleChoicesNeedReview,
    },
  }), [
    articleChoicesNeedReview,
    articleWorkflowState.selectedStructureId,
    articleWorkflowState.structures,
    articleWorkflowState.suggestions,
    contextState.collectionId,
    contextState.dateRange,
    contextState.expiresAt,
    contextState.hasCollected,
    contextState.items,
    contextState.reports,
    contextState.researchedAt,
    currentContextKey,
    draft,
    step?.id,
  ]);
  const restoreArticleDraft = useCallback((payload: ArticleCreationDraftPayload) => {
    previousFingerprintRef.current = buildContextFingerprint(payload.draft);
    setDraft(payload.draft);
    const restoredSteps = getStepsForObjective("article", hasPreselectedObjective, payload.draft.presetId);
    const restoredStepIndex = restoredSteps.findIndex((item) => item.id === payload.stepId);
    setStepIndex(restoredStepIndex >= 0 ? restoredStepIndex : 0);
    setContextState({
      ...payload.contextState,
      loading: false,
      errorMessage: null,
    });
    setArticleWorkflowState({
      loadingAction: null,
      errorMessage: null,
      suggestions: payload.articleWorkflow.suggestions,
      structures: payload.articleWorkflow.structures,
      selectedStructureId: payload.articleWorkflow.selectedStructureId,
      blockDetails: null,
    });
    setArticleChoicesNeedReview(payload.articleWorkflow.choicesNeedReview);
    setStepErrorMessage(null);
  }, [hasPreselectedObjective]);
  const resetArticleDraft = useCallback(() => {
    const initialDraft = createInitialAssistantDraft(context);
    previousFingerprintRef.current = buildContextFingerprint(initialDraft);
    setDraft(initialDraft);
    setStepIndex(0);
    setContextState(emptyContextCollectState());
    setArticleWorkflowState({
      loadingAction: null,
      errorMessage: null,
      suggestions: [],
      structures: [],
      selectedStructureId: "",
      blockDetails: null,
    });
    setArticleChoicesNeedReview(false);
    setStepErrorMessage(null);
  }, [context]);
  const buildLegacyArticleDraftPayload = useCallback((raw: string): ArticleCreationDraftPayload | null => {
    try {
      const persisted = JSON.parse(raw) as PersistedCreationWorkflow;
      if (
        persisted.version !== 2
        || persisted.draft?.objective?.objective !== "article"
        || !persisted.contextState
      ) {
        return null;
      }
      const legacySteps = getStepsForObjective("article", hasPreselectedObjective, persisted.draft.presetId);
      const legacyStep = legacySteps[Math.max(0, Math.min(persisted.stepIndex, legacySteps.length - 1))]?.id ?? "subject";
      return {
        schemaVersion: 1,
        contextKey: persisted.contextKey,
        draft: persisted.draft,
        stepId: legacyStep as ArticleCreationDraftStepId,
        contextState: {
          collectionId: persisted.contextState.collectionId,
          expiresAt: persisted.contextState.expiresAt,
          items: persisted.contextState.items,
          reports: persisted.contextState.reports,
          researchedAt: persisted.contextState.researchedAt,
          dateRange: persisted.contextState.dateRange,
          hasCollected: persisted.contextState.hasCollected,
        },
        articleWorkflow: {
          suggestions: [],
          structures: [],
          selectedStructureId: "",
          choicesNeedReview: false,
        },
      };
    } catch {
      return null;
    }
  }, [hasPreselectedObjective]);
  const articleDraftPersistence = useArticleDraftPersistence({
    enabled: durableArticleDraftsEnabled,
    active: isArticleFlow,
    initialDraftId: initialArticleDraftId,
    contextKey: currentContextKey,
    hydrated: workflowHydrated,
    payload: articleDraftPayload,
    meaningful: Boolean(draft.subject.displayName.trim()) && draft.objective.objective === "article",
    onRestore: restoreArticleDraft,
    onNew: resetArticleDraft,
    buildLegacyPayload: buildLegacyArticleDraftPayload,
  });
  const [articleContextExpired, setArticleContextExpired] = useState(false);

  useEffect(() => {
    if (
      !initialAthleteNewsReportId
      || !isArticleFlow
      || !articleDraftPersistence.initialized
      || athleteNewsPrefillAppliedRef.current
    ) {
      return;
    }
    athleteNewsPrefillAppliedRef.current = true;
    const materialId = `athlete-news-report-${initialAthleteNewsReportId}`;
    void fetch(`/api/admin/athlete-news-reports/${encodeURIComponent(initialAthleteNewsReportId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json() as {
          prefill?: AthleteNewsArticlePrefill;
          message?: string;
        };
        if (!response.ok || !payload.prefill) {
          throw new Error(payload.message || "Impossible de charger le signalement Athlète.");
        }
        setAthleteNewsPrefill(payload.prefill);
        setDraft((current) => {
          const materials = current.parameters.manualEditorialMaterials ?? [];
          if (materials.some((material) => material.id === materialId)) return current;
          return {
            ...current,
            parameters: {
              ...current.parameters,
              useContextIntelligence: true,
              contextEnableManual: true,
              manualEditorialMaterials: [
                ...materials,
                buildAthleteNewsEditorialMaterial(payload.prefill!),
              ],
            },
          };
        });
      })
      .catch((error: unknown) => {
        setAthleteNewsPrefillError(
          error instanceof Error ? error.message : "Impossible de charger le signalement Athlète.",
        );
      });
  }, [
    articleDraftPersistence.initialized,
    initialAthleteNewsReportId,
    isArticleFlow,
  ]);

  useEffect(() => {
    if (
      !initialSportsWatchCandidateId
      || !isArticleFlow
      || !articleDraftPersistence.initialized
      || sportsWatchPrefillAppliedRef.current
    ) {
      return;
    }
    sportsWatchPrefillAppliedRef.current = true;
    const materialId = `sports-watch-${initialSportsWatchCandidateId}`;
    void fetch(`/api/admin/sports-watch/${encodeURIComponent(initialSportsWatchCandidateId)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json() as {
          prefill?: SportsWatchArticlePrefill;
          message?: string;
        };
        if (!response.ok || !payload.prefill) {
          throw new Error(payload.message || "Impossible de charger le candidat de veille.");
        }
        setSportsWatchPrefill(payload.prefill);
        setDraft((current) => {
          const materials = current.parameters.manualEditorialMaterials ?? [];
          if (materials.some((material) => material.id === materialId)) return current;
          return {
            ...current,
            parameters: {
              ...current.parameters,
              useContextIntelligence: true,
              contextEnableManual: true,
              manualEditorialMaterials: [...materials, payload.prefill!.material],
            },
          };
        });
      })
      .catch((error: unknown) => {
        setSportsWatchPrefillError(
          error instanceof Error ? error.message : "Impossible de charger le candidat de veille.",
        );
      });
  }, [
    articleDraftPersistence.initialized,
    initialSportsWatchCandidateId,
    isArticleFlow,
  ]);

  useEffect(() => {
    if (durableArticleDraftsEnabled && context.objective === "article") {
      return;
    }
    try {
      const workflowRaw = window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY);
      if (workflowRaw) {
        const persisted = JSON.parse(workflowRaw) as PersistedCreationWorkflow;
        if (
          persisted.version === 2
          && persisted.contextKey === initialContextKeyRef.current
          && persisted.draft?.subject
          && persisted.draft?.objective
          && persisted.draft?.parameters
          && Number.isInteger(persisted.stepIndex)
          && persisted.contextState
        ) {
          previousFingerprintRef.current = buildContextFingerprint(persisted.draft);
          setDraft(persisted.draft);
          setStepIndex(Math.max(0, persisted.stepIndex));
          setContextState({
            ...persisted.contextState,
            loading: false,
          });
        }
      } else {
        const legacyRaw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
        if (legacyRaw) {
          const legacyDraft = JSON.parse(legacyRaw) as CreationAssistantDraft;
          if (legacyDraft?.subject && legacyDraft?.objective && legacyDraft?.parameters) {
            previousFingerprintRef.current = buildContextFingerprint(legacyDraft);
            setDraft(legacyDraft);
          }
        }
      }
    } catch {
      window.sessionStorage.removeItem(WORKFLOW_STORAGE_KEY);
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      setWorkflowHydrated(true);
    }
  }, [context.objective, durableArticleDraftsEnabled]);

  useEffect(() => {
    const expiresAt = contextState.collectionId && contextState.expiresAt
      ? new Date(contextState.expiresAt).getTime()
      : null;
    const remainingMs = expiresAt === null ? null : expiresAt - Date.now();
    const refreshTimer = window.setTimeout(
      () => setArticleContextExpired(remainingMs !== null && remainingMs <= 0),
      0,
    );
    const expiryTimer = remainingMs !== null && remainingMs > 0
      ? window.setTimeout(() => setArticleContextExpired(true), remainingMs)
      : null;
    return () => {
      window.clearTimeout(refreshTimer);
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
    };
  }, [contextState.collectionId, contextState.expiresAt]);

  useEffect(() => {
    if (!workflowHydrated) return;
    if (durableArticleDraftsActive) return;
    const workflow: PersistedCreationWorkflow = {
      version: 2,
      contextKey: currentContextKey,
      draft,
      stepIndex: effectiveStepIndex,
      contextState,
    };
    window.sessionStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(workflow));
  }, [contextState, currentContextKey, draft, durableArticleDraftsActive, effectiveStepIndex, workflowHydrated]);

  useEffect(() => {
    if (!workflowHydrated || previousContextKeyRef.current === currentContextKey) return;
    previousContextKeyRef.current = currentContextKey;
    window.sessionStorage.removeItem(WORKFLOW_STORAGE_KEY);
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraft(createInitialAssistantDraft(context));
    setStepIndex(0);
    setContextState(emptyContextCollectState());
    setStepErrorMessage(null);
  }, [context, currentContextKey, workflowHydrated]);

  const loadPeople = async () => {
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      let response = await fetch(mediaCreditRole === "media" ? "/api/media/athletes" : "/api/athletes", { cache: "no-store" });
      if (response.status === 403) {
        response = await fetch("/api/media/athletes", { cache: "no-store" });
      }
      const payload = (await response.json()) as
        | AthletesResponse
        | { athletes?: MediaAthleteDirectoryEntry[]; error?: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "Impossible de charger les personnes" : "Impossible de charger les personnes");
      }

      if (!Array.isArray(payload.athletes)) {
        throw new Error("Impossible de charger les personnes");
      }

      setPeople(payload.athletes.map((athlete) => {
        if ("key" in athlete) {
          const fullAthlete = athlete as Athlete;
          return {
            id: fullAthlete.key,
            displayName: normalize(fullAthlete.name) || "Sans nom",
            sport: normalize(fullAthlete.sport),
            organization: normalize(fullAthlete.club),
            status: normalize(fullAthlete.status),
            initials: normalize(fullAthlete.initials) || getInitials(fullAthlete.name),
            hasPhoto: Boolean(fullAthlete.competitionPhoto),
          };
        }
        return {
          id: athlete.athleteId,
          displayName: normalize(athlete.name) || "Sans nom",
          sport: normalize(athlete.sport),
          organization: normalize(athlete.club),
          status: "Public",
          initials: getInitials(athlete.name),
          hasPhoto: Boolean(athlete.portraitUrl),
        };
      }));
    } catch {
      setPeople([]);
      setPeopleError("Impossible de charger les personnes");
    } finally {
      setPeopleLoading(false);
    }
  };

  const personItems = useMemo<PersonSelectorItem[]>(() => {
    return [...people].sort((a, b) => a.displayName.localeCompare(b.displayName, "fr", { sensitivity: "base" }));
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
        return {
          ok: false,
          message: draft.objective.objective === "article" ? "Selectionnez un type d article." : "Selectionnez un type d interview.",
          focusSelector: "[data-param-group='subtype'] .creation-option-card",
        };
      }
      return { ok: true };
    }

    if (stepId === "match") {
      if (!normalize(draft.afterMatch?.opponent)) {
        return { ok: false, message: "Renseignez l adversaire.", focusSelector: "[data-match-opponent='true']" };
      }
      if (!normalize(draft.afterMatch?.result)) {
        return { ok: false, message: "Renseignez le resultat.", focusSelector: "[data-match-result='true']" };
      }
      if (!normalize(draft.afterMatch?.competition)) {
        return { ok: false, message: "Renseignez la competition.", focusSelector: "[data-match-competition='true']" };
      }
      if (!normalize(draft.afterMatch?.matchDate)) {
        return { ok: false, message: "Renseignez la date du match.", focusSelector: "[data-match-date='true']" };
      }
      return { ok: true };
    }

    if (stepId === "angle") {
      if (draft.objective.objective === "article" && !normalize(draft.parameters.articleSelectedAngle)) {
        return { ok: false, message: "Generez puis selectionnez un angle editorial.", focusSelector: ".creation-option-card" };
      }
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

    if (stepId === "structure") {
      if (!articleWorkflowState.selectedStructureId) {
        return { ok: false, message: "Generez puis selectionnez une structure.", focusSelector: ".creation-option-card" };
      }
      return { ok: true };
    }

    if (stepId === "parameters") {
      if (draft.objective.objective === "article") {
        if (!draft.objective.subtypeId) {
          return { ok: false, message: "Selectionnez un type d article." };
        }
        if (!draft.parameters.toneId) {
          return { ok: false, message: "Selectionnez un ton.", focusSelector: "[data-article-tone='true']" };
        }
        if (!draft.parameters.audienceId) {
          return { ok: false, message: "Selectionnez une audience.", focusSelector: "[data-article-audience='true']" };
        }
        if (draft.parameters.toneId === "free" && !normalize(draft.parameters.customTone)) {
          return { ok: false, message: "Renseignez le ton libre." };
        }
        if (draft.parameters.audienceId === "free" && !normalize(draft.parameters.customAudience)) {
          return { ok: false, message: "Renseignez le public libre." };
        }
        const incompleteMaterial = (draft.parameters.manualEditorialMaterials ?? []).find(
          (material) =>
            !normalize(material.text)
            || !normalize(material.provenance)
            || !normalize(material.sourceDate)
            || (material.kind === "verbatim_quote" && !normalize(material.speaker)),
        );
        if (incompleteMaterial) {
          return {
            ok: false,
            message: incompleteMaterial.kind === "verbatim_quote"
              ? "Renseignez le texte exact, la provenance, la date et la personne qui parle."
              : "Renseignez le texte, la provenance et la date de chaque note.",
            focusSelector: `[data-manual-material='${incompleteMaterial.id}']`,
          };
        }
        const oversizedMaterial = (draft.parameters.manualEditorialMaterials ?? []).find(
          (material) => material.text.length > MANUAL_EDITORIAL_TEXT_LIMIT,
        );
        if (oversizedMaterial) {
          return {
            ok: false,
            message: `Ramenez cette matière à ${MANUAL_EDITORIAL_TEXT_LIMIT} caractères maximum.`,
            focusSelector: `[data-manual-material='${oversizedMaterial.id}']`,
          };
        }
        const interviewSource = draft.parameters.manualInterviewSource;
        if (interviewSource) {
          if (
            !normalize(interviewSource.provenance)
            || !normalize(interviewSource.sourceDate)
            || !normalize(interviewSource.interviewer)
            || !normalize(interviewSource.interviewee)
            || !interviewSource.sourceText.trim()
          ) {
            return {
              ok: false,
              message: "Complétez la provenance, la date, les deux intervenants et le texte de l’entretien.",
              focusSelector: "[data-manual-interview='true']",
            };
          }
          if (interviewSource.sourceText.length > MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT) {
            return {
              ok: false,
              message: `Ramenez le texte de l’entretien à ${MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT.toLocaleString("fr-CH")} caractères maximum.`,
              focusSelector: "[data-interview-source-text='true']",
            };
          }
          if (
            draft.subject.type === "free_topic"
            && !interviewSource.subjectIdentityConfirmed
          ) {
            return {
              ok: false,
              message: "Confirmez explicitement que la personne interrogée est le sujet de l’article.",
              focusSelector: "[data-interview-subject-confirmation='true']",
            };
          }
          if (
            draft.subject.type === "free_topic"
            && !interviewSource.excerpts.some((excerpt) => excerpt.speakerRole === "interviewee")
          ) {
            return {
              ok: false,
              message: "Ajoutez au moins une citation exacte de la personne interrogée.",
              focusSelector: "[data-manual-interview='true']",
            };
          }
        }
        const interviewExcerptCount = interviewSource?.excerpts.length ?? 0;
        if (
          (draft.parameters.manualEditorialMaterials ?? []).length + interviewExcerptCount
          > MANUAL_EDITORIAL_MATERIAL_LIMIT
        ) {
          return {
            ok: false,
            message: `Conservez au maximum ${MANUAL_EDITORIAL_MATERIAL_LIMIT} notes et extraits au total.`,
            focusSelector: "#article-material-title",
          };
        }
        return { ok: true };
      }
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
      if (!draft.parameters.useContextIntelligence && draft.objective.objective !== "article") return { ok: true };
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
  }, [articleWorkflowState.selectedStructureId, contextState.hasCollected, contextState.loading, draft, objectiveParameters]);

  const preparedPayload = useMemo(() => {
    return ContentCreationAssistantService.preparePayload({
      context,
      draft,
      contextCollectionId: contextState.collectionId,
      selectedContextItems: contextState.items.filter((item) => item.isSelected),
      contextResearchedAt: contextState.researchedAt,
      contextDateRange: contextState.dateRange,
    });
  }, [context, contextState.collectionId, contextState.dateRange, contextState.items, contextState.researchedAt, draft]);

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

  const moveToStep = (stepId: StepId) => {
    const targetIndex = getStepIndexById(stepId);
    if (targetIndex < 0) return;
    setStepErrorMessage(null);
    setStepIndex(targetIndex);
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

  const restartAssistant = () => {
    if (durableArticleDraftsActive) {
      void articleDraftPersistence.startNew();
      return;
    }
    window.sessionStorage.removeItem(WORKFLOW_STORAGE_KEY);
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraft(createInitialAssistantDraft(context));
    setStepIndex(0);
    setContextState(emptyContextCollectState());
    setStepErrorMessage(null);
    setGenerateState({ loading: false, errorMessage: null });
    setPublicationAnglesState({ loading: false, errorMessage: null, suggestions: [] });
    setArticleWorkflowState({
      loadingAction: null,
      errorMessage: null,
      suggestions: [],
      structures: [],
      selectedStructureId: "",
      blockDetails: null,
    });
    setArticleChoicesNeedReview(false);
  };

  const quitAssistant = async (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!durableArticleDraftsActive) return;
    event.preventDefault();
    const canLeave = await articleDraftPersistence.flushBeforeNavigation();
    if (canLeave) {
      router.push("/contents");
    }
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
        toneId: id === "publication" || id === "article" || id === "reel" ? current.parameters.toneId || "authentic" : "",
        questionCountId: "",
        customQuestionCount: "",
        formatId: id === "publication" ? current.parameters.publicationPlatform : id === "reel" ? current.parameters.reelFormat : "",
        audienceId: id === "publication" || id === "article" || id === "reel" ? current.parameters.audienceId || "general" : "",
        useContextIntelligence: id === "article" ? true : current.parameters.useContextIntelligence,
        requiredTopics: "",
        avoidedTopics: "",
      },
    }));
  };

  const runInterviewGeneration = async () => {
    if (!preparedPayload || generationInFlightRef.current || resultNavigationStartedRef.current) return;

    generationInFlightRef.current = true;
    const controller = new AbortController();
    generationAbortRef.current = controller;
    setGenerateState({ loading: true, errorMessage: null });

    try {
      const response = await fetch("/api/content/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ requestId: crypto.randomUUID(), payload: preparedPayload }),
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
      resultNavigationStartedRef.current = true;
      navigateToContentResult(buildResultUrl(sessionRecord.sessionId, `document-${sessionRecord.createdAt}`));
    } catch (error) {
      resultNavigationStartedRef.current = false;
      generationInFlightRef.current = false;
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
      if (!resultNavigationStartedRef.current) {
        generationInFlightRef.current = false;
        void loadCreditBalance();
      }
    }
  };

  const generateArticleAngles = async () => {
    if (!preparedPayload || articleWorkflowState.loadingAction) return;
    if (articleContextExpired) {
      setArticleWorkflowState((current) => ({
        ...current,
        errorMessage: "Le contexte a expiré. Renouvelez-le avant de proposer des angles.",
      }));
      return;
    }

    setArticleWorkflowState((current) => ({ ...current, loadingAction: "angles", errorMessage: null }));
    try {
      const request: ArticleAngleSuggestionsRequest = buildArticleAngleSuggestionsRequest(preparedPayload);
      const response = await fetch("/api/contents/generate/article", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "angles", requestId: crypto.randomUUID(), request }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; action: "angles"; result: { suggestions: PublicationAngleSuggestion[] } }
        | ArticleApiError
        | null;
      if (!response.ok || !payload?.ok || payload.action !== "angles") {
        setArticleWorkflowState((current) => ({
          ...current,
          loadingAction: null,
          errorMessage: formatArticleApiError(payload && !payload.ok ? payload : null, "Impossible de proposer des angles Article."),
          blockDetails: readArticleBlockDetails(payload && !payload.ok ? payload : null),
        }));
        return;
      }
      setArticleWorkflowState({
        loadingAction: null,
        errorMessage: null,
        blockDetails: null,
        suggestions: payload.result.suggestions,
        structures: [],
        selectedStructureId: "",
      });
      setArticleChoicesNeedReview(false);
    } catch {
      setArticleWorkflowState((current) => ({
        ...current,
        loadingAction: null,
        errorMessage: "Impossible de proposer des angles Article.",
        blockDetails: null,
      }));
    } finally {
      void loadCreditBalance();
    }
  };

  const generateArticleStructures = async () => {
    if (!preparedPayload || !normalize(draft.parameters.articleSelectedAngle) || articleWorkflowState.loadingAction) return;
    if (articleContextExpired) {
      setArticleWorkflowState((current) => ({
        ...current,
        errorMessage: "Le contexte a expiré. Renouvelez-le avant de proposer des structures.",
      }));
      return;
    }

    setArticleWorkflowState((current) => ({ ...current, loadingAction: "structures", errorMessage: null }));
    try {
      const request: ArticleGenerationRequest = buildArticleGenerationRequest(
        preparedPayload,
        draft.parameters.articleSelectedAngle,
      );
      const response = await fetch("/api/contents/generate/article", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "structures", requestId: crypto.randomUUID(), request }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; action: "structures"; result: { suggestions: ArticleStructureSuggestion[] } }
        | ArticleApiError
        | null;
      if (!response.ok || !payload?.ok || payload.action !== "structures") {
        setArticleWorkflowState((current) => ({
          ...current,
          loadingAction: null,
          errorMessage: formatArticleApiError(payload && !payload.ok ? payload : null, "Impossible de proposer des structures Article."),
        }));
        return;
      }
      setArticleWorkflowState((current) => ({
        ...current,
        loadingAction: null,
        errorMessage: null,
        structures: payload.result.suggestions,
        selectedStructureId: "",
      }));
      setArticleChoicesNeedReview(false);
    } catch {
      setArticleWorkflowState((current) => ({
        ...current,
        loadingAction: null,
        errorMessage: "Impossible de proposer des structures Article.",
      }));
    } finally {
      void loadCreditBalance();
    }
  };

  const runArticleFinalGeneration = async () => {
    if (!preparedPayload || generationInFlightRef.current || resultNavigationStartedRef.current) return;
    if (articleContextExpired || articleChoicesNeedReview) {
      setGenerateState({
        loading: false,
        errorMessage: articleContextExpired
          ? "Le contexte a expiré. Renouvelez-le avant de générer l’article."
          : "Revalidez l’angle et la structure après la modification de la matière.",
      });
      return;
    }
    const selectedStructure = articleWorkflowState.structures.find(
      (structure) => structure.id === articleWorkflowState.selectedStructureId,
    );
    if (!selectedStructure || !normalize(draft.parameters.articleSelectedAngle)) return;

    generationInFlightRef.current = true;
    setGenerateState({ loading: true, errorMessage: null });
    setArticleWorkflowState((current) => ({ ...current, loadingAction: "final", errorMessage: null }));
    try {
      const request = buildArticleGenerationRequest(preparedPayload, draft.parameters.articleSelectedAngle);
      const response = await fetch("/api/contents/generate/article", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "final",
          requestId: crypto.randomUUID(),
          request,
          selectedStructure,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok: true;
            action: "final";
            result: {
              article: ArticleFinalResult;
              metadata: {
                provider: "openai";
                model: string;
                generatedAt: string;
                generationDurationMs: number;
              };
            };
          }
        | ArticleApiError
        | null;
      if (!response.ok || !payload?.ok || payload.action !== "final") {
        setGenerateState({
          loading: false,
          errorMessage: formatArticleApiError(payload && !payload.ok ? payload : null, "Impossible de generer l article."),
        });
        setArticleWorkflowState((current) => ({ ...current, loadingAction: null }));
        return;
      }

      const selectedAngle = articleWorkflowState.suggestions.find(
        (suggestion) => suggestion.title === draft.parameters.articleSelectedAngle,
      ) ?? { id: "article-angle-manual", title: draft.parameters.articleSelectedAngle, rationale: "" };
      const sessionRecord = await saveArticleResultSession({
        request,
        result: payload.result.article,
        selectedAngle: { id: selectedAngle.id, title: selectedAngle.title },
        selectedStructure,
        generationMetadata: payload.result.metadata,
        createdAt: new Date().toISOString(),
      });
      resultNavigationStartedRef.current = true;
      navigateToContentResult(buildResultUrl(sessionRecord.sessionId, `article-${sessionRecord.createdAt}`));
    } catch {
      resultNavigationStartedRef.current = false;
      setGenerateState({ loading: false, errorMessage: "Impossible de generer l article." });
      setArticleWorkflowState((current) => ({ ...current, loadingAction: null }));
    } finally {
      if (!resultNavigationStartedRef.current) {
        generationInFlightRef.current = false;
        void loadCreditBalance();
      }
    }
  };

  const cancelGeneration = () => {
    generationAbortRef.current?.abort();
  };

  const collectContext = useCallback(async () => {
    if (!draft.subject.type || !normalize(draft.subject.displayName)) return;
    const previousContextItems = contextState.items;
    const renewingExpiredContext = articleContextExpired;

    const selectedConnectorIds: ContextConnectorId[] = [];
    if (draft.parameters.contextEnableCrm) selectedConnectorIds.push("crm");
    if (draft.parameters.contextEnableProductions) selectedConnectorIds.push("productions");
    if (
      draft.parameters.contextEnableManual
      || (draft.parameters.manualEditorialMaterials ?? []).length > 0
      || (draft.parameters.manualInterviewSource?.excerpts.length ?? 0) > 0
    ) {
      selectedConnectorIds.push("manual");
    }
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
      collectionId: undefined,
      expiresAt: undefined,
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
          manualEditorialMaterials: draft.parameters.manualEditorialMaterials,
          manualInterviewSources: draft.parameters.manualInterviewSource?.excerpts.length
            ? [draft.parameters.manualInterviewSource]
            : [],
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

      const previousById = new Map(previousContextItems.map((item) => [item.id, item]));
      const refreshedItems = payload.items.map((item) => {
        const previous = previousById.get(item.id);
        if (!previous) return item;
        return {
          ...item,
          isSelected: previous.isSelected,
          editedSummary: previous.editedSummary,
        };
      });
      const selectedMatterChanged = renewingExpiredContext
        && previousContextItems.some((previous) => {
          if (!previous.isSelected) return false;
          const refreshed = payload.items.find((item) => item.id === previous.id);
          return !refreshed
            || refreshed.summary !== previous.summary
            || refreshed.factualStatement !== previous.factualStatement;
        });
      setContextState({
        loading: false,
        errorMessage: null,
        items: refreshedItems,
        reports: payload.reports,
        collectionId: payload.collectionId,
        expiresAt: payload.expiresAt,
        researchedAt: payload.summary.researchedAt,
        dateRange: payload.summary.dateRange,
        hasCollected: true,
      });
      if (selectedMatterChanged) {
        setArticleChoicesNeedReview(true);
      }
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
  }, [articleContextExpired, contextState.items, draft, loadCreditBalance]);

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

  const requestArticleAngles = () => {
    if (mediaCreditRole === "media") {
      setCreditModal({ kind: "article_angles", cost: 1 });
      return;
    }
    void generateArticleAngles();
  };

  const requestArticleStructures = () => {
    if (mediaCreditRole === "media") {
      setCreditModal({ kind: "article_structures", cost: 1 });
      return;
    }
    void generateArticleStructures();
  };

  const requestFinalGeneration = () => {
    if (mediaCreditRole === "media") {
      setCreditModal({ kind: "generation", cost: getGenerationCreditCost() });
      return;
    }
    if (isArticleFlow) {
      void runArticleFinalGeneration();
    } else {
      void runInterviewGeneration();
    }
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
      } else if (creditModal.kind === "article_angles") {
        await generateArticleAngles();
      } else if (creditModal.kind === "article_structures") {
        await generateArticleStructures();
      } else if (isArticleFlow) {
        await runArticleFinalGeneration();
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

  const addManualEditorialMaterial = () => {
    const totalMaterialCount =
      (draft.parameters.manualEditorialMaterials ?? []).length
      + (draft.parameters.manualInterviewSource?.excerpts.length ?? 0);
    if (totalMaterialCount >= MANUAL_EDITORIAL_MATERIAL_LIMIT) {
      setInterviewFeedback({
        kind: "error",
        message: `Supprimez une matière avant d’en ajouter une nouvelle : la limite est de ${MANUAL_EDITORIAL_MATERIAL_LIMIT}.`,
      });
      return;
    }
    const material: ManualEditorialMaterial = {
      id: crypto.randomUUID(),
      kind: "note",
      text: "",
      provenance: "",
      sourceDate: new Date().toISOString().slice(0, 10),
    };
    setDraft((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        manualEditorialMaterials: [
          ...(current.parameters.manualEditorialMaterials ?? []),
          material,
        ],
      },
    }));
  };

  const updateManualEditorialMaterial = (
    materialId: string,
    update: Partial<ManualEditorialMaterial>,
  ) => {
    setDraft((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        manualEditorialMaterials: (current.parameters.manualEditorialMaterials ?? []).map(
          (material) => material.id === materialId ? { ...material, ...update } : material,
        ),
      },
    }));
  };

  const removeManualEditorialMaterial = (materialId: string) => {
    setDraft((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        manualEditorialMaterials: (current.parameters.manualEditorialMaterials ?? []).filter(
          (material) => material.id !== materialId,
        ),
      },
    }));
  };

  const createManualInterviewSource = () => {
    const source: ManualInterviewSource = {
      id: crypto.randomUUID(),
      provenance: "",
      sourceDate: new Date().toISOString().slice(0, 10),
      interviewer: "",
      interviewee: "",
      subjectIdentityConfirmed: false,
      sourceText: "",
      excerpts: [],
    };
    setDraft((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        manualInterviewSource: source,
      },
    }));
    setInterviewExcerptPreview(null);
    setInterviewFeedback(null);
  };

  const updateManualInterviewSource = (
    field: "provenance" | "sourceDate" | "interviewer" | "interviewee" | "sourceText",
    value: string,
  ) => {
    const invalidatedCount = draft.parameters.manualInterviewSource?.excerpts.length ?? 0;
    setDraft((current) => {
      const source = current.parameters.manualInterviewSource;
      if (!source) return current;
      return {
        ...current,
        parameters: {
          ...current.parameters,
          manualInterviewSource: {
            ...source,
            [field]: value,
            subjectIdentityConfirmed: false,
            excerpts: [],
          },
        },
      };
    });
    setInterviewExcerptPreview(null);
    setInterviewFeedback(invalidatedCount
      ? {
          kind: "information",
          message: "La source a changé. Ses extraits ont été retirés : sélectionnez-les et confirmez-les à nouveau.",
        }
      : null);
  };

  const setManualInterviewSubjectIdentityConfirmed = (confirmed: boolean) => {
    setDraft((current) => {
      const source = current.parameters.manualInterviewSource;
      if (!source) return current;
      return {
        ...current,
        parameters: {
          ...current.parameters,
          manualInterviewSource: {
            ...source,
            subjectIdentityConfirmed: confirmed,
          },
        },
      };
    });
    setInterviewFeedback(confirmed
      ? {
          kind: "information",
          message: "Identité déclarée confirmée. Elle reste distincte d’une identité vérifiée dans le CRM.",
        }
      : {
          kind: "information",
          message: "Confirmation retirée. Le Portrait sur sujet libre sera bloqué jusqu’à une nouvelle confirmation.",
        });
  };

  const removeManualInterviewSource = () => {
    setDraft((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        manualInterviewSource: null,
      },
    }));
    setInterviewExcerptPreview(null);
    setInterviewFeedback({
      kind: "information",
      message: "L’entretien et ses extraits ont été retirés. Vos autres notes et citations sont conservées.",
    });
  };

  const prepareInterviewExcerpt = () => {
    const source = draft.parameters.manualInterviewSource;
    const textarea = interviewSourceTextRef.current;
    if (!source || !textarea || !source.sourceText.trim()) {
      setInterviewFeedback({
        kind: "error",
        message: "Collez d’abord le texte de l’entretien, puis sélectionnez le passage à conserver.",
      });
      return;
    }
    if (
      !normalize(source.provenance)
      || !normalize(source.sourceDate)
      || !normalize(source.interviewer)
      || !normalize(source.interviewee)
    ) {
      setInterviewFeedback({
        kind: "error",
        message: "Complétez la provenance, la date et les deux intervenants avant de sélectionner un passage.",
      });
      return;
    }
    if (source.sourceText.length > MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT) {
      setInterviewFeedback({
        kind: "error",
        message: `Le texte dépasse la limite de ${MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT.toLocaleString("fr-CH")} caractères. Réduisez-le avant de sélectionner un passage.`,
      });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const excerptText = source.sourceText.slice(start, end);
    if (end <= start || !excerptText.trim()) {
      setInterviewFeedback({
        kind: "error",
        message: "Sélectionnez un passage précis dans le texte, puis cliquez de nouveau sur « Ajouter cet extrait ».",
      });
      return;
    }
    if (excerptText.length > MANUAL_EDITORIAL_TEXT_LIMIT) {
      setInterviewFeedback({
        kind: "error",
        message: `La sélection compte ${excerptText.length} caractères. Réduisez-la à ${MANUAL_EDITORIAL_TEXT_LIMIT} caractères maximum.`,
      });
      return;
    }
    const totalMaterialCount =
      (draft.parameters.manualEditorialMaterials ?? []).length + source.excerpts.length;
    if (totalMaterialCount >= MANUAL_EDITORIAL_MATERIAL_LIMIT) {
      setInterviewFeedback({
        kind: "error",
        message: `Supprimez une matière avant d’ajouter cet extrait : la limite est de ${MANUAL_EDITORIAL_MATERIAL_LIMIT}.`,
      });
      return;
    }

    setInterviewExcerptPreview({
      sourceId: source.id,
      start,
      end,
      text: excerptText,
      speakerRole: "",
    });
    setInterviewFeedback(null);
  };

  const confirmInterviewExcerpt = () => {
    const source = draft.parameters.manualInterviewSource;
    const preview = interviewExcerptPreview;
    if (!source || !preview || source.id !== preview.sourceId) {
      setInterviewFeedback({
        kind: "error",
        message: "La source a changé. Sélectionnez le passage à nouveau.",
      });
      setInterviewExcerptPreview(null);
      return;
    }
    if (!preview.speakerRole) {
      setInterviewFeedback({
        kind: "error",
        message: "Indiquez qui parle. Si le passage mélange plusieurs voix, sélectionnez un passage plus court.",
      });
      return;
    }
    if (source.sourceText.slice(preview.start, preview.end) !== preview.text) {
      setInterviewFeedback({
        kind: "error",
        message: "Le texte source a changé. Sélectionnez le passage à nouveau.",
      });
      setInterviewExcerptPreview(null);
      return;
    }

    setDraft((current) => {
      const currentSource = current.parameters.manualInterviewSource;
      if (!currentSource || currentSource.id !== preview.sourceId) return current;
      return {
        ...current,
        parameters: {
          ...current.parameters,
          manualInterviewSource: {
            ...currentSource,
            excerpts: [
              ...currentSource.excerpts,
              {
                id: crypto.randomUUID(),
                start: preview.start,
                end: preview.end,
                text: preview.text,
                speakerRole: preview.speakerRole as ManualInterviewSpeakerRole,
                confirmed: true,
              },
            ],
          },
        },
      };
    });
    setInterviewExcerptPreview(null);
    setInterviewFeedback({
      kind: "success",
      message: "Extrait ajouté. Vous le retrouvez ci-dessous dans la Matière journalistique.",
    });
  };

  const removeInterviewExcerpt = (excerptId: string) => {
    setDraft((current) => {
      const source = current.parameters.manualInterviewSource;
      if (!source) return current;
      return {
        ...current,
        parameters: {
          ...current.parameters,
          manualInterviewSource: {
            ...source,
            excerpts: source.excerpts.filter((excerpt) => excerpt.id !== excerptId),
          },
        },
      };
    });
    setInterviewExcerptPreview(null);
    setInterviewFeedback({
      kind: "information",
      message: "Extrait supprimé. Il ne sera pas repris lors de la prochaine collecte.",
    });
  };

  const startContextItemEdit = (item: ContextItem) => {
    setContextItemEditState({
      itemId: item.id,
      value: item.editedSummary || item.summary,
    });
  };

  const cancelContextItemEdit = () => {
    setContextItemEditState(null);
  };

  const saveContextItemEdit = () => {
    if (!contextItemEditState) return;
    updateContextSummary(contextItemEditState.itemId, contextItemEditState.value);
    setContextItemEditState(null);
  };

  const contextByCategory = useMemo<ContextCategoryGroup[]>(() => {
    const map = new Map<string, ContextItem[]>();
    for (const item of contextState.items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }, [contextState.items]);
  const articleItemDiagnostics = useMemo(
    () => new Map(
      (articleWorkflowState.blockDetails?.itemDiagnostics ?? [])
        .map((diagnostic) => [diagnostic.itemId, diagnostic] as const),
    ),
    [articleWorkflowState.blockDetails],
  );

  useEffect(() => {
    if (!workflowHydrated) return;
    if (previousFingerprintRef.current === contextFingerprint) return;
    previousFingerprintRef.current = contextFingerprint;
    const choicesReviewTimer = articleWorkflowState.suggestions.length || articleWorkflowState.structures.length
      ? window.setTimeout(() => setArticleChoicesNeedReview(true), 0)
      : null;

    setContextState((previous) => {
      if (
        !previous.hasCollected
        && previous.items.length === 0
        && !previous.errorMessage
        && !previous.collectionId
        && !previous.expiresAt
      ) {
        return previous;
      }
      return {
        ...previous,
        collectionId: undefined,
        expiresAt: undefined,
        items: [],
        reports: [],
        researchedAt: undefined,
        dateRange: undefined,
        errorMessage: null,
        hasCollected: false,
      };
    });
    return () => {
      if (choicesReviewTimer !== null) window.clearTimeout(choicesReviewTimer);
    };
  }, [
    articleWorkflowState.structures.length,
    articleWorkflowState.suggestions.length,
    contextFingerprint,
    workflowHydrated,
  ]);

  const renderSubjectStep = () => {
    return (
      <section className="creation-step-block" aria-labelledby="creation-subject-title">
        <header className="creation-step-head">
          <h2 id="creation-subject-title">Sur quel sujet souhaitez-vous creer un contenu ?</h2>
        </header>

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
      hasPreselectedObjective
      && (draft.objective.objective === "publication"
        || draft.objective.objective === "interview"
        || draft.objective.objective === "article");

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

  const renderMatchStep = () => {
    return (
      <section className="creation-step-block" aria-labelledby="creation-match-title">
        <header className="creation-step-head">
          <h2 id="creation-match-title">Informations du match</h2>
          <p>Renseignez les elements factuels de la rencontre. Aucun appel IA n est lance a cette etape.</p>
        </header>

        <section className="creation-panel">
          <div className="creation-fields-grid">
            <label>
              <span>Adversaire</span>
              <input
                type="text"
                data-match-opponent="true"
                value={draft.afterMatch?.opponent ?? ""}
                onChange={(event) => setAfterMatchField("opponent", event.target.value)}
              />
            </label>

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

            <label>
              <span>Competition</span>
              <input
                type="text"
                data-match-competition="true"
                value={draft.afterMatch?.competition ?? ""}
                onChange={(event) => setAfterMatchField("competition", event.target.value)}
              />
            </label>

            <label>
              <span>Date du match</span>
              <input
                type="date"
                data-match-date="true"
                value={draft.afterMatch?.matchDate ?? ""}
                onChange={(event) => setAfterMatchField("matchDate", event.target.value)}
              />
            </label>
          </div>

          <label className="creation-inline-field">
            <span>Faits marquants (optionnel)</span>
            <textarea
              className="creation-textarea"
              data-match-key-facts="true"
              placeholder="Ex: but decisif a la 88e, exclusion adverse en 2e periode."
              value={draft.afterMatch?.keyFacts ?? ""}
              onChange={(event) => setAfterMatchField("keyFacts", event.target.value)}
            />
          </label>

          <label className="creation-inline-field">
            <span>Prochain rendez-vous (optionnel)</span>
            <textarea
              className="creation-textarea"
              data-match-next-fixture="true"
              placeholder="Ex: deplacement samedi prochain pour la journee suivante."
              value={draft.afterMatch?.nextFixture ?? ""}
              onChange={(event) => setAfterMatchField("nextFixture", event.target.value)}
            />
          </label>
        </section>
      </section>
    );
  };

  const renderAngleStep = () => {
    if (draft.objective.objective === "article") {
      const interviewIdentityBlocked = articleWorkflowState.blockDetails?.reasons.some((reason) =>
        reason.includes("sujet libre")
        || reason.includes("identité déclarée")
        || reason.includes("citation verbatim confirmée")) === true;
      return (
        <section className="creation-step-block" aria-labelledby="creation-angle-title">
          <header className="creation-step-head">
            <h2 id="creation-angle-title">Angle editorial de l article</h2>
            <p>Le moteur propose jusqu&apos;a trois angles soutenus par le dossier editorial reconstruit cote serveur.</p>
          </header>
          <section className="creation-panel">
            <div className="creation-footer-actions">
              <button
                type="button"
                className="crm-primary-action"
                onClick={requestArticleAngles}
                disabled={!preparedPayload || Boolean(articleWorkflowState.loadingAction) || isCreditCostBlocked(1)}
              >
                {articleWorkflowState.loadingAction === "angles" ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
                {articleWorkflowState.loadingAction === "angles" ? "Generation des angles" : "Proposer des angles"}
              </button>
            </div>
            {articleWorkflowState.errorMessage ? (
              <p className="creation-error" role="alert">{articleWorkflowState.errorMessage}</p>
            ) : null}
            {articleWorkflowState.blockDetails ? (
              <section className="creation-article-block-details" aria-labelledby="article-block-details-title">
                <div>
                  <h3 id="article-block-details-title">Pourquoi la génération est-elle bloquée ?</h3>
                  {articleWorkflowState.blockDetails.reasons.length > 0 ? (
                    <ul>
                      {articleWorkflowState.blockDetails.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  ) : null}
                  {articleWorkflowState.blockDetails.missingInformation.length > 0 ? (
                    <>
                      <h4>Informations manquantes</h4>
                      <ul>
                        {articleWorkflowState.blockDetails.missingInformation.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </>
                  ) : null}
                  {articleWorkflowState.blockDetails.contradictions.length > 0 ? (
                    <>
                      <h4>Contradictions non résolues</h4>
                      <ul>
                        {articleWorkflowState.blockDetails.contradictions.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </>
                  ) : null}
                  {articleWorkflowState.blockDetails.itemDiagnostics.some((item) => item.status !== "eligible") ? (
                    <>
                      <h4>Éléments écartés ou limités</h4>
                      <ul>
                        {Array.from(new Set(
                          articleWorkflowState.blockDetails.itemDiagnostics
                            .filter((item) => item.status !== "eligible")
                            .flatMap((item) => item.reasons),
                        )).map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                    </>
                  ) : null}
                </div>

                <div className="creation-article-unblock">
                  <h3>Comment débloquer la génération ?</h3>
                  {articleWorkflowState.blockDetails.suggestedArticleTypes.length > 0 ? (
                    <p>
                      Les faits historiques disponibles pourraient convenir à un Portrait ou une Analyse.
                      Ce changement ne garantit pas que la génération sera autorisée.
                    </p>
                  ) : interviewIdentityBlocked ? (
                    <p>
                      Revenez à l’entretien pour confirmer que la personne interrogée est le sujet
                      et sélectionner au moins une de ses réponses comme citation exacte.
                    </p>
                  ) : (
                    <p>Ajoutez un fait vérifié répondant aux exigences du type d’article sélectionné.</p>
                  )}
                  <div>
                    <button type="button" className="contents-secondary-button" onClick={() => moveToStep("objective")}>
                      Revenir au type d’article
                    </button>
                    <button
                      type="button"
                      className="contents-secondary-button"
                      onClick={() => moveToStep(interviewIdentityBlocked ? "parameters" : "context")}
                    >
                      {interviewIdentityBlocked ? "Revenir à l’entretien" : "Ajouter une information vérifiée"}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            {articleWorkflowState.suggestions.length > 0 ? (
              <div className="creation-option-grid">
                {articleWorkflowState.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className={draft.parameters.articleSelectedAngle === suggestion.title ? "creation-option-card is-active" : "creation-option-card"}
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        parameters: { ...current.parameters, articleSelectedAngle: suggestion.title },
                      }));
                      setArticleWorkflowState((current) => ({
                        ...current,
                        structures: [],
                        selectedStructureId: "",
                        errorMessage: null,
                      }));
                      setArticleChoicesNeedReview(false);
                    }}
                  >
                    <strong>{suggestion.title}</strong>
                    <p>{suggestion.rationale}</p>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </section>
      );
    }

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
            <p className="creation-muted">{`Publication complète : ${formatCreditCount(2)} (1 crédit pour les angles + 1 crédit pour les propositions).`}</p>
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

  const renderStructureStep = () => {
    return (
      <section className="creation-step-block" aria-labelledby="creation-structure-title">
        <header className="creation-step-head">
          <h2 id="creation-structure-title">Structure de l article</h2>
          <p>Choisissez une structure compatible avec l angle et la longueur selectionnes.</p>
        </header>
        <section className="creation-panel">
          <div className="creation-footer-actions">
            <button
              type="button"
              className="crm-primary-action"
              onClick={requestArticleStructures}
              disabled={
                !preparedPayload
                || !normalize(draft.parameters.articleSelectedAngle)
                || Boolean(articleWorkflowState.loadingAction)
                || isCreditCostBlocked(1)
              }
            >
              {articleWorkflowState.loadingAction === "structures" ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
              {articleWorkflowState.loadingAction === "structures"
                ? "Génération des structures"
                : articleWorkflowState.errorMessage
                  ? "Réessayer"
                  : "Proposer des structures"}
            </button>
          </div>
          {articleWorkflowState.errorMessage ? (
            <p className="creation-error" role="alert">{articleWorkflowState.errorMessage}</p>
          ) : null}
          {articleWorkflowState.structures.length > 0 ? (
            <div className="creation-option-grid">
              {articleWorkflowState.structures.map((structure) => (
                <button
                  key={structure.id}
                  type="button"
                  className={articleWorkflowState.selectedStructureId === structure.id ? "creation-option-card is-active" : "creation-option-card"}
                  onClick={() => {
                    setArticleWorkflowState((current) => ({
                      ...current,
                      selectedStructureId: structure.id,
                      errorMessage: null,
                    }));
                    setArticleChoicesNeedReview(false);
                  }}
                >
                  <strong>{structure.title}</strong>
                  <p>{structure.editorialPromise}</p>
                  <small>{structure.estimatedWordCount} mots environ</small>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    );
  };

  const renderParametersStep = () => {
    if (draft.objective.objective === "article") {
      const interviewSource = draft.parameters.manualInterviewSource;
      const totalMaterialCount =
        (draft.parameters.manualEditorialMaterials ?? []).length
        + (interviewSource?.excerpts.length ?? 0);
      return (
        <section className="creation-step-block" aria-labelledby="creation-params-title">
          <header className="creation-step-head">
            <h2 id="creation-params-title">Parametres de l article</h2>
            <p>Definissez uniquement les parametres pris en charge par le moteur Article.</p>
          </header>

          <section className="creation-panel">
            <div className="creation-fields-grid">
              <label>
                <span>Longueur</span>
                <select
                  data-article-length="true"
                  value={draft.parameters.articleLength}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      parameters: {
                        ...current.parameters,
                        articleLength: event.target.value as CreationAssistantDraft["parameters"]["articleLength"],
                      },
                    }))
                  }
                >
                  <option value="breve">Breve</option>
                  <option value="court">Court</option>
                  <option value="moyen">Moyen</option>
                  <option value="long">Long</option>
                </select>
              </label>
              <label>
                <span>Ton</span>
                <select
                  data-article-tone="true"
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
                  data-article-audience="true"
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
                <span>Audience libre</span>
                <input
                  type="text"
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
              <span>Contexte editorial complementaire</span>
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
            <section className="creation-panel" aria-labelledby="article-material-title">
              <header className="creation-step-head">
                <div>
                  <h3 id="article-material-title">Matière journalistique</h3>
                  <p>
                    Ajoutez des notes ou des citations reproduites mot pour mot. Cette matière
                    reste identifiée comme fournie par l’utilisateur et non vérifiée
                    indépendamment.
                  </p>
                </div>
                <div className="creation-material-actions">
                  <button
                    type="button"
                    className="contents-ghost-button"
                    disabled={totalMaterialCount >= MANUAL_EDITORIAL_MATERIAL_LIMIT}
                    onClick={addManualEditorialMaterial}
                  >
                    Ajouter une note ou une citation
                  </button>
                  {!interviewSource ? (
                    <button
                      type="button"
                      className="contents-ghost-button"
                      onClick={createManualInterviewSource}
                    >
                      Exploiter un entretien
                    </button>
                  ) : null}
                </div>
              </header>
              <p className="creation-muted">
                {totalMaterialCount}/{MANUAL_EDITORIAL_MATERIAL_LIMIT} matières ajoutées. Une citation exacte
                reprend les mots prononcés sans les modifier. Une note personnelle apporte du contexte,
                mais aucune des deux ne devient une information vérifiée sans contrôle indépendant.
              </p>
              {interviewSource ? (
                <section
                  className="creation-interview-tool"
                  data-manual-interview="true"
                  aria-labelledby="manual-interview-title"
                >
                  <div className="creation-context-category-head">
                    <div>
                      <h4 id="manual-interview-title">Exploiter un entretien</h4>
                      <p>
                        Collez votre entretien, puis choisissez mot pour mot les passages utiles à
                        l’article. KLIQUE ne complète et ne reformule aucune réponse.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="contents-ghost-button"
                      onClick={removeManualInterviewSource}
                    >
                      Retirer l’entretien
                    </button>
                  </div>
                  <ol className="creation-interview-steps" aria-label="Étapes pour exploiter un entretien">
                    <li>1. Coller l’entretien</li>
                    <li>2. Sélectionner un passage</li>
                    <li>3. Identifier le locuteur</li>
                    <li>4. Confirmer</li>
                  </ol>
                  <details className="creation-interview-example">
                    <summary>Voir un exemple fictif</summary>
                    <p>
                      <strong>Exemple fictif :</strong> Journaliste : « Quel est votre prochain
                      objectif ? » — Athlète : « Je veux retrouver la compétition en décembre. »
                      Sélectionnez uniquement la réponse si vous souhaitez l’utiliser comme citation.
                    </p>
                  </details>
                  <div className="creation-fields-grid">
                    <label>
                      <span>Provenance</span>
                      <input
                        aria-label="Provenance de l’entretien"
                        type="text"
                        value={interviewSource.provenance}
                        onChange={(event) =>
                          updateManualInterviewSource("provenance", event.target.value)}
                      />
                      <small>Par exemple : entretien KLIQUE réalisé à Lausanne.</small>
                    </label>
                    <label>
                      <span>Date de l’entretien</span>
                      <input
                        aria-label="Date de l’entretien"
                        type="date"
                        value={interviewSource.sourceDate}
                        onChange={(event) =>
                          updateManualInterviewSource("sourceDate", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Intervieweur</span>
                      <input
                        aria-label="Nom de l’intervieweur"
                        type="text"
                        value={interviewSource.interviewer}
                        onChange={(event) =>
                          updateManualInterviewSource("interviewer", event.target.value)}
                      />
                      <small>La personne qui pose les questions.</small>
                    </label>
                    <label>
                      <span>Personne interrogée</span>
                      <input
                        aria-label="Nom de la personne interrogée"
                        type="text"
                        value={interviewSource.interviewee}
                        onChange={(event) =>
                          updateManualInterviewSource("interviewee", event.target.value)}
                      />
                      <small>La personne dont les réponses pourront devenir des citations.</small>
                    </label>
                  </div>
                  {draft.subject.type === "free_topic" ? (
                    <label
                      className="creation-toggle-row creation-interview-subject-confirmation"
                      data-interview-subject-confirmation="true"
                    >
                      <input
                        type="checkbox"
                        checked={interviewSource.subjectIdentityConfirmed === true}
                        onChange={(event) =>
                          setManualInterviewSubjectIdentityConfirmed(event.target.checked)}
                      />
                      <span>
                        Je confirme que {interviewSource.interviewee || "la personne interrogée"} est
                        le sujet de cet article.
                      </span>
                      <small>
                        Cette confirmation établit une identité déclarée pour ce brouillon. Elle ne
                        crée pas de fiche CRM et ne vérifie ni l’identité ni les déclarations.
                      </small>
                    </label>
                  ) : null}
                  {interviewSource.subjectIdentityConfirmed ? (
                    <p className="creation-muted">
                      Article fondé sur un entretien fourni par l’utilisateur. Identité et
                      déclarations non vérifiées indépendamment.
                    </p>
                  ) : null}
                  <label className="creation-inline-field">
                    <span>Texte de l’entretien</span>
                    <textarea
                      ref={interviewSourceTextRef}
                      aria-label="Texte source de l’entretien"
                      className="creation-textarea creation-interview-source"
                      data-interview-source-text="true"
                      value={interviewSource.sourceText}
                      onChange={(event) =>
                        updateManualInterviewSource("sourceText", event.target.value)}
                    />
                    <small>
                      Collez les questions/réponses ou la transcription, puis sélectionnez un passage
                      directement dans ce champ. Une modification retirera les extraits déjà confirmés.
                    </small>
                  </label>
                  <div className="creation-interview-selection-bar">
                    <span className={
                      interviewSource.sourceText.length > MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT
                        ? "creation-error"
                        : "creation-muted"
                    }>
                      {interviewSource.sourceText.length.toLocaleString("fr-CH")}
                      /{MANUAL_INTERVIEW_SOURCE_TEXT_LIMIT.toLocaleString("fr-CH")} caractères
                    </span>
                    <button
                      type="button"
                      className="contents-ghost-button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={prepareInterviewExcerpt}
                    >
                      Ajouter cet extrait
                    </button>
                  </div>
                  <p className="creation-muted">
                    Sur mobile, maintenez le doigt sur le texte et ajustez les poignées de sélection
                    avant de toucher « Ajouter cet extrait ».
                  </p>
                  {interviewExcerptPreview ? (
                    <section className="creation-interview-preview" aria-labelledby="interview-preview-title">
                      <h5 id="interview-preview-title">Aperçu avant confirmation</h5>
                      <blockquote>{interviewExcerptPreview.text}</blockquote>
                      <label>
                        <span>Qui parle dans ce passage ?</span>
                        <select
                          aria-label="Locuteur de l’extrait sélectionné"
                          value={interviewExcerptPreview.speakerRole}
                          onChange={(event) =>
                            setInterviewExcerptPreview((current) => current
                              ? {
                                  ...current,
                                  speakerRole: event.target.value as ManualInterviewSpeakerRole | "",
                                }
                              : current)}
                        >
                          <option value="">Choisir le locuteur</option>
                          <option value="interviewer">
                            Intervieweur — {interviewSource.interviewer}
                          </option>
                          <option value="interviewee">
                            Personne interrogée — {interviewSource.interviewee}
                          </option>
                        </select>
                      </label>
                      <p className="creation-muted">
                        Si plusieurs personnes parlent dans ce passage, annulez et sélectionnez un
                        passage plus court. Une intervention de l’intervieweur restera une note,
                        jamais une citation de la personne interrogée.
                      </p>
                      <div className="creation-material-actions">
                        <button
                          type="button"
                          className="contents-ghost-button"
                          onClick={() => setInterviewExcerptPreview(null)}
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          className="crm-primary-action"
                          onClick={confirmInterviewExcerpt}
                        >
                          Confirmer l’extrait
                        </button>
                      </div>
                    </section>
                  ) : null}
                  {interviewFeedback ? (
                    <p
                      className={interviewFeedback.kind === "error"
                        ? "creation-error"
                        : interviewFeedback.kind === "success"
                          ? "creation-success-note"
                          : "creation-muted"}
                      role={interviewFeedback.kind === "error" ? "alert" : "status"}
                    >
                      {interviewFeedback.message}
                    </p>
                  ) : null}
                  {interviewSource.excerpts.length ? (
                    <div className="creation-interview-excerpts">
                      <h5>Extraits ajoutés à la Matière journalistique</h5>
                      {interviewSource.excerpts.map((excerpt, index) => {
                        const isInterviewee = excerpt.speakerRole === "interviewee";
                        const speaker = isInterviewee
                          ? interviewSource.interviewee
                          : interviewSource.interviewer;
                        return (
                          <article className="creation-context-category" key={excerpt.id}>
                            <strong>
                              {isInterviewee ? "Citation exacte" : "Note — intervention de l’intervieweur"}
                            </strong>
                            <p>{excerpt.text}</p>
                            <p className="creation-muted">
                              {speaker} — {interviewSource.provenance} — {interviewSource.sourceDate}
                            </p>
                            <p className="creation-muted">
                              Texte lié à l’entretien, en lecture seule. Pour le modifier,
                              sélectionnez un nouveau passage dans la source.
                            </p>
                            <button
                              type="button"
                              className="contents-ghost-button"
                              aria-label={`Supprimer l’extrait ${index + 1}`}
                              onClick={() => removeInterviewExcerpt(excerpt.id)}
                            >
                              Supprimer cet extrait
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                  <p className="creation-muted">
                    {durableArticleDraftsActive
                      ? "L’entretien est inclus dans votre brouillon privé dès que l’état « Enregistré » est affiché."
                      : "Le brouillon de l’entretien est conservé uniquement dans cet onglet. Il ne constitue pas une sauvegarde durable."}
                  </p>
                </section>
              ) : null}
              {(draft.parameters.manualEditorialMaterials ?? []).map((material, index) => (
                <article
                  className="creation-context-category"
                  data-manual-material={material.id}
                  key={material.id}
                >
                  <div className="creation-fields-grid">
                    <label>
                      <span>Type</span>
                      <select
                        aria-label={`Type de matière ${index + 1}`}
                        value={material.kind}
                        onChange={(event) => {
                          const kind = event.target.value as ManualEditorialMaterial["kind"];
                          updateManualEditorialMaterial(material.id, {
                            kind,
                            ...(kind === "note" ? { speaker: undefined } : {}),
                          });
                        }}
                      >
                        <option value="note">Note ou paraphrase</option>
                        <option value="verbatim_quote">Citation verbatim</option>
                      </select>
                    </label>
                    <label>
                      <span>Provenance</span>
                      <input
                        aria-label={`Provenance de la matière ${index + 1}`}
                        type="text"
                        value={material.provenance}
                        onChange={(event) =>
                          updateManualEditorialMaterial(material.id, {
                            provenance: event.target.value,
                          })}
                      />
                    </label>
                    <label>
                      <span>Date</span>
                      <input
                        aria-label={`Date de la matière ${index + 1}`}
                        type="date"
                        value={material.sourceDate}
                        onChange={(event) =>
                          updateManualEditorialMaterial(material.id, {
                            sourceDate: event.target.value,
                          })}
                      />
                    </label>
                    {material.kind === "verbatim_quote" ? (
                      <label>
                        <span>Personne qui parle</span>
                        <input
                          aria-label={`Locuteur de la citation ${index + 1}`}
                          type="text"
                          value={material.speaker ?? ""}
                          onChange={(event) =>
                            updateManualEditorialMaterial(material.id, {
                              speaker: event.target.value,
                            })}
                        />
                      </label>
                    ) : null}
                  </div>
                  <label className="creation-inline-field">
                    <span>
                      {material.kind === "verbatim_quote"
                        ? "Texte exact, reproduit mot pour mot"
                        : "Note ou paraphrase"}
                    </span>
                    <textarea
                      aria-label={`Texte de la matière ${index + 1}`}
                      className="creation-textarea"
                      value={material.text}
                      onChange={(event) =>
                        updateManualEditorialMaterial(material.id, { text: event.target.value })}
                    />
                    <small>
                      {material.text.length}/{MANUAL_EDITORIAL_TEXT_LIMIT} caractères maximum
                    </small>
                  </label>
                  <button
                    type="button"
                    className="contents-ghost-button"
                    onClick={() => removeManualEditorialMaterial(material.id)}
                  >
                    Supprimer
                  </button>
                </article>
              ))}
            </section>
            <label className="creation-inline-field">
              <span>Sujets a traiter</span>
              <textarea
                className="creation-textarea"
                value={draft.parameters.requiredTopics}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    parameters: { ...current.parameters, requiredTopics: event.target.value },
                  }))
                }
              />
            </label>
          </section>
        </section>
      );
    }

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
    const title = isPublicationFlow ? "Contexte intelligent" : "Préparation du contexte";

    if (!draft.parameters.useContextIntelligence) {
      return (
        <section className="creation-step-block" aria-labelledby="creation-context-title">
          <header className="creation-step-head">
            <h2 id="creation-context-title">{title}</h2>
          </header>
          <p className="creation-muted">{isPublicationFlow ? "Le contexte intelligent est désactivé. Activez l’option « Enrichir avec le contexte intelligent » à l’étape précédente pour utiliser les données du workspace." : "Le contexte intelligent est désactivé. Passez à l’étape suivante pour générer le contenu."}</p>
        </section>
      );
    }

    const selectedCount = contextState.items.filter((item) => item.isSelected).length;
    return (
      <section className="creation-step-block" aria-labelledby="creation-context-title">
        <header className="creation-step-head">
          <h2 id="creation-context-title">{title}</h2>
          <p>Collectez, relisez et sélectionnez les éléments qui seront utilisés pour la génération.</p>
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
              <span>Actualité externe</span>
            </label>
          </div>

          {draft.parameters.contextEnableExternalNews ? (
            <p className="creation-muted" data-role="external-news-credit-note">
              {`Une recherche d'actualité externe consomme ${formatCreditCount(1)} maximum (le cache peut la rendre gratuite).`}
            </p>
          ) : null}

          <div className="creation-fields-grid">
            <label>
              <span>Période</span>
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
                <option value="custom">Personnalisée</option>
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
            <p className="creation-muted">Seuls les éléments sélectionnés seront transmis à la génération.</p>
          </div>

          {contextState.errorMessage ? (
            <p className="creation-error" role="alert">{contextState.errorMessage}</p>
          ) : null}

          {contextState.hasCollected ? (
            <dl className="creation-summary-grid">
              <div><dt>Éléments trouvés</dt><dd>{contextState.items.length}</dd></div>
              <div><dt>Éléments sélectionnés</dt><dd>{selectedCount}</dd></div>
              <div><dt>Date de recherche</dt><dd>{contextState.researchedAt ? formatDateTimeLabel(contextState.researchedAt) : "Non définie"}</dd></div>
              <div><dt>Période</dt><dd>{formatDateRangeLabel(contextState.dateRange)}</dd></div>
            </dl>
          ) : null}
        </section>

        {contextState.reports.length > 0 ? (
          <section className="creation-panel">
            <header>
              <h3>État des connecteurs</h3>
            </header>
            <ul className="creation-context-list">
              {contextState.reports.map((report) => (
                <li key={report.connectorId} className={`creation-context-report is-${report.status}`}>
                  <div className="creation-context-report-head">
                    <strong>{getConnectorLabel(report.connectorId)}</strong>
                    <span>{getConnectorStatusLabel(report.status)}</span>
                  </div>
                  <small>
                    {report.itemCount > 0 ? `${report.itemCount} élément(s)` : "Aucun élément"}
                    {report.message ? ` | ${getConnectorStatusMessage(report)}` : ` | ${getConnectorStatusMessage(report)}`}
                  </small>
                  {report.connectorId === "external_news" && (report.status === "error" || report.status === "unavailable") ? (
                    <button type="button" className="contents-ghost-button" onClick={requestContextSearch} disabled={contextState.loading}>
                      Réessayer
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
              <h3>Révision et sélection</h3>
            </header>
            {isArticleFlow && articleWorkflowState.blockDetails ? (
              <p className="creation-context-eligibility-note">
                Les éléments cochés ne sont pas tous nécessairement éligibles pour ce type d’article.
                Leur statut ci-dessous correspond au dernier contrôle éditorial effectué par le serveur.
              </p>
            ) : null}

            {contextByCategory.map((group) => {
              const selectedInCategory = group.items.filter((item) => item.isSelected).length;
              return (
                <article key={group.category} className="creation-context-category">
                  <div className="creation-context-category-head">
                    <div>
                      <h4>{contextCategoryLabels[group.category as ContextItemCategory] ?? group.category}</h4>
                      <p>{selectedInCategory}/{group.items.length} sélectionné(s)</p>
                    </div>
                    <div className="creation-context-category-actions">
                      <button type="button" onClick={() => toggleContextCategory(group.category, true)}>
                        Tout sélectionner
                      </button>
                      <button type="button" onClick={() => toggleContextCategory(group.category, false)}>
                        Tout désélectionner
                      </button>
                    </div>
                  </div>

                  <div className="creation-context-cards" role="list">
                    {group.items.map((item) => {
                      const isEditing = contextItemEditState?.itemId === item.id;
                      const eligibilityDiagnostic = articleItemDiagnostics.get(item.id);
                      return (
                        <article
                          key={item.id}
                          role="listitem"
                          className={`creation-context-card${item.isSensitive ? " is-sensitive" : ""}`}
                        >
                          <div className="creation-context-card-check">
                            <input
                              type="checkbox"
                              aria-label={`Sélectionner ${item.title}`}
                              checked={item.isSelected}
                              onChange={(event) => toggleContextItem(item.id, event.target.checked)}
                            />
                          </div>

                          <div className="creation-context-card-body">
                            <div className="creation-context-card-head">
                              <h5>{item.title}</h5>
                              <div className="creation-context-card-badges">
                                <span className="creation-context-card-badge">
                                  {contextCategoryLabels[item.category as ContextItemCategory] ?? item.category}
                                </span>
                                {eligibilityDiagnostic ? (
                                  <span className={`creation-context-eligibility is-${eligibilityDiagnostic.status}`}>
                                    {eligibilityDiagnostic.status === "eligible"
                                      ? "Exploitable pour cet article"
                                      : eligibilityDiagnostic.status === "caution"
                                        ? "Utilisable avec prudence"
                                        : "Non exploitable"}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="creation-context-card-editor">
                                <textarea
                                  className="creation-textarea"
                                  aria-label={`Modifier ${item.title}`}
                                  value={contextItemEditState.value}
                                  onChange={(event) =>
                                    setContextItemEditState({
                                      itemId: item.id,
                                      value: event.target.value,
                                    })
                                  }
                                />
                                <div className="creation-context-card-editor-actions">
                                  <button type="button" className="contents-secondary-button" onClick={saveContextItemEdit}>
                                    Enregistrer la modification
                                  </button>
                                  <button type="button" className="contents-ghost-button" onClick={cancelContextItemEdit}>
                                    Annuler
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="creation-context-card-copy">{item.editedSummary || item.summary}</p>
                            )}
                            {eligibilityDiagnostic ? (
                              <ul className="creation-context-diagnostic-reasons">
                                {eligibilityDiagnostic.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                              </ul>
                            ) : null}

                            <div className="creation-context-card-footer">
                              <div className="creation-context-card-meta">
                                <strong>{item.sourceName}</strong>
                                {item.publishedAt || item.retrievedAt ? (
                                  <time dateTime={item.publishedAt ?? item.retrievedAt}>
                                    {formatDateTimeLabel(item.publishedAt ?? item.retrievedAt)}
                                  </time>
                                ) : null}
                                {item.sourceUrl ? (
                                  <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">Voir la source</a>
                                ) : null}
                                {item.isSensitive ? <small>Vérifier avant publication</small> : null}
                              </div>
                              {!isEditing && item.isEditable ? (
                                <button
                                  type="button"
                                  className="contents-secondary-button creation-context-card-edit"
                                  onClick={() => startContextItemEdit(item)}
                                >
                                  Modifier
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
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
              <p className="creation-muted">{`Publication complète : ${formatCreditCount(2)} (1 crédit pour les angles + 1 crédit pour les propositions).`}</p>
            ) : null}
          </header>

          <dl className="creation-summary-grid">
            <div><dt>Sujet</dt><dd>{draft.subject.displayName || "Non defini"}</dd></div>
            <div><dt>Type de sujet</dt><dd>{formatSubjectType(draft.subject.type)}</dd></div>
            <div><dt>Objectif</dt><dd>{draft.presetId === "after-match" ? "Après-match" : draft.parameters.publicationObjectiveId}</dd></div>
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
            <div><dt>Angle</dt><dd>{draft.parameters.publicationSelectedAngle || "Non defini"}</dd></div>
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
            <button
              type="button"
              className="crm-primary-action"
              onClick={requestFinalGeneration}
              disabled={!preparedPayload || generateState.loading || isGenerationBlocked}
            >
              {generateState.loading ? <Loader2 size={15} className="is-spinning" aria-hidden /> : null}
              {generateState.loading ? "Generation en cours" : generateState.errorMessage ? "Reessayer" : "Generer 3 propositions"}
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
              {generateState.loading ? "Generation en cours" : generateState.errorMessage ? "Reessayer" : "Generer 3 concepts Reel"}
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
            <div><dt>Objectif</dt><dd>Story</dd></div>
            <div><dt>Angle editorial</dt><dd>{draft.parameters.storySelectedAngle || "Non defini"}</dd></div>
            <div><dt>Plateforme</dt><dd>{draft.parameters.storyPlatform}</dd></div>
            <div><dt>Nombre de frames</dt><dd>{draft.parameters.storyFrameCount}</dd></div>
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
              {generateState.loading ? "Generation en cours" : generateState.errorMessage ? "Reessayer" : "Generer 3 sequences Story"}
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
    const formatLabel = isArticleFlow
      ? "Article"
      : params
        ? findOption(params.formatOptions, draft.parameters.formatId)?.label
        : "";
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
          <div>
            <dt>Longueur</dt>
            <dd>
              {isArticleFlow
                ? ({ breve: "Breve", court: "Court", moyen: "Moyen", long: "Long" })[draft.parameters.articleLength]
                : questionCountLabel || "Non defini"}
            </dd>
          </div>
          <div><dt>Format</dt><dd>{formatLabel || "Non defini"}</dd></div>
          <div><dt>Public</dt><dd>{audienceLabel || "Non defini"}</dd></div>
          {isArticleFlow ? (
            <>
              <div><dt>Angle</dt><dd>{draft.parameters.articleSelectedAngle || "Non defini"}</dd></div>
              <div>
                <dt>Structure</dt>
                <dd>
                  {articleWorkflowState.structures.find((item) => item.id === articleWorkflowState.selectedStructureId)?.title
                    ?? "Non definie"}
                </dd>
              </div>
            </>
          ) : null}
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
            {generateState.loading ? "Creation en cours" : generateState.errorMessage ? "Reessayer" : params?.finalActionLabel ?? "Creer le contenu"}
          </button>
          {generateState.errorMessage ? (
            <p className="creation-error" role="alert">{generateState.errorMessage}</p>
          ) : null}

          {generateState.loading ? (
            <section className="creation-generation-state" aria-live="polite" aria-busy="true">
              <header>
                <h3>{isArticleFlow ? "Creation de votre article" : "Creation de votre interview"}</h3>
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

  if (!workflowHydrated) {
    return (
      <section className="creation-assistant-screen" aria-live="polite" aria-busy="true">
        <p>Restauration de l assistant editorial.</p>
      </section>
    );
  }

  const isNextStepDisabled =
    effectiveStepIndex === steps.length - 1
    || (isArticleFlow
      && step.id === "angle"
      && !normalize(draft.parameters.articleSelectedAngle))
    || (isArticleFlow
      && step.id === "structure"
      && !articleWorkflowState.structures.some(
        (structure) => structure.id === articleWorkflowState.selectedStructureId,
      ));

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
        <button type="button" className="contents-ghost-button" onClick={restartAssistant}>
          Recommencer
        </button>
        <Link href="/contents" className="crm-secondary-action-link" onClick={quitAssistant}>Quitter</Link>
      </header>

      {athleteNewsPrefill ? (
        <section className="creation-panel" aria-label="Signalement Athlète transféré">
          <strong>Signalement Athlète transféré</strong>
          <p className="creation-muted">
            Déclaration attribuée à l’athlète et non vérifiée indépendamment. Elle est ajoutée comme note, jamais comme fait vérifié ou citation verbatim.
          </p>
          <p>{athleteNewsPrefill.message}</p>
          <p className="creation-muted">Date déclarée : {athleteNewsPrefill.eventDate}</p>
          <div className="creation-footer-actions">
            {athleteNewsPrefill.externalUrl ? (
              <a href={athleteNewsPrefill.externalUrl} target="_blank" rel="noreferrer">
                Ouvrir le lien fourni
              </a>
            ) : null}
            {athleteNewsPrefill.photoHref ? (
              <a href={athleteNewsPrefill.photoHref} target="_blank" rel="noreferrer">
                Voir la photo privée
              </a>
            ) : null}
          </div>
          <p className="creation-muted">Aucune recherche ni génération n’a été lancée.</p>
        </section>
      ) : null}

      {athleteNewsPrefillError ? (
        <p role="alert" className="creation-error">{athleteNewsPrefillError}</p>
      ) : null}

      {sportsWatchPrefill ? (
        <section className="creation-panel" aria-label="Candidat de veille transféré">
          <strong>Candidat de veille transféré</strong>
          <p>
            Validation éditoriale acquise. Vérification factuelle :{" "}
            {sportsWatchPrefill.verificationStatus === "verified" ? "vérifiée" : "non vérifiée"}.
          </p>
          <p>{sportsWatchPrefill.material.text}</p>
          <p className="creation-muted">{sportsWatchPrefill.material.provenance}</p>
          <p className="creation-muted">Aucune recherche ni génération n’a été lancée.</p>
        </section>
      ) : null}

      {sportsWatchPrefillError ? (
        <p role="alert" className="creation-error">{sportsWatchPrefillError}</p>
      ) : null}

      {durableArticleDraftsActive ? (
        <section className="creation-panel" aria-label="Brouillons Article durables">
          <div className="creation-footer-actions">
            <div>
              <strong>
                {articleDraftPersistence.saveState === "saving"
                  ? "Enregistrement…"
                  : articleDraftPersistence.saveState === "saved"
                    ? "Enregistré"
                    : articleDraftPersistence.saveState === "loading"
                      ? "Chargement des brouillons…"
                      : "Brouillon privé"}
              </strong>
              {articleDraftPersistence.activeVersion ? (
                <p className="creation-muted">Version {articleDraftPersistence.activeVersion}</p>
              ) : null}
            </div>
            <div className="creation-footer-right">
              <button
                type="button"
                className="contents-secondary-button"
                onClick={() => articleDraftPersistence.setManagerOpen(!articleDraftPersistence.managerOpen)}
              >
                Mes brouillons
              </button>
              <button
                type="button"
                className="contents-secondary-button"
                onClick={() => void articleDraftPersistence.startNew()}
              >
                Nouveau brouillon
              </button>
            </div>
          </div>

          {articleDraftPersistence.privacyNoticeVisible ? (
            <div className="creation-interview-feedback is-information" role="status">
              <p>
                Votre entretien et votre brouillon sont enregistrés dans votre espace privé pour être retrouvés sur vos appareils.
              </p>
              <p>
                Ils sont conservés jusqu’à leur suppression manuelle. Les sauvegardes techniques suivent la politique de conservation de l’hébergeur.
              </p>
              <button type="button" className="contents-ghost-button" onClick={articleDraftPersistence.dismissPrivacyNotice}>
                J’ai compris
              </button>
            </div>
          ) : null}

          {articleDraftPersistence.legacyDraftAvailable ? (
            <div className="creation-interview-feedback is-information">
              <p>Un ancien brouillon local existe dans cet onglet. Il n’a pas été importé automatiquement.</p>
              <button
                type="button"
                className="contents-secondary-button"
                onClick={() => void articleDraftPersistence.importLegacyDraft()}
              >
                Enregistrer ce brouillon dans mon espace privé
              </button>
            </div>
          ) : null}

          {articleDraftPersistence.errorMessage ? (
            <div className="creation-error" role="alert">
              <p>{articleDraftPersistence.errorMessage}</p>
              {articleDraftPersistence.conflictVersion !== null ? (
                <div className="creation-footer-right">
                  <button type="button" className="contents-secondary-button" onClick={() => void articleDraftPersistence.loadServerVersion()}>
                    Charger la version serveur
                  </button>
                  <button type="button" className="contents-secondary-button" onClick={() => void articleDraftPersistence.duplicateLocalVersion()}>
                    Enregistrer mon travail dans un nouveau brouillon
                  </button>
                </div>
              ) : (
                <button type="button" className="contents-secondary-button" onClick={() => void articleDraftPersistence.retry()}>
                  Réessayer
                </button>
              )}
            </div>
          ) : null}

          {articleDraftPersistence.managerOpen ? (
            <div>
              <h2>Mes brouillons</h2>
              {articleDraftPersistence.drafts.length ? (
                <ul className="creation-connector-list">
                  {articleDraftPersistence.drafts.map((savedDraft) => (
                    <li key={savedDraft.id}>
                      <div>
                        <strong>{savedDraft.displayTitle}</strong>
                        <small>
                          {`Étape ${savedDraft.stepId} · ${formatDateTimeLabel(savedDraft.updatedAt)}`}
                        </small>
                      </div>
                      <div className="creation-footer-right">
                        <button
                          type="button"
                          className="contents-secondary-button"
                          disabled={savedDraft.id === articleDraftPersistence.activeDraftId}
                          onClick={() => void articleDraftPersistence.loadDraft(savedDraft.id)}
                        >
                          {savedDraft.id === articleDraftPersistence.activeDraftId ? "Ouvert" : "Reprendre"}
                        </button>
                        <button
                          type="button"
                          className="contents-ghost-button"
                          onClick={() => void articleDraftPersistence.removeDraft(savedDraft.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="creation-muted">Aucun brouillon Article enregistré.</p>
              )}
            </div>
          ) : null}

          {articleContextExpired ? (
            <div className="creation-interview-feedback is-information" role="status">
              <p>Le contexte collecté a expiré. Votre brouillon est conservé.</p>
              <button
                type="button"
                className="contents-secondary-button"
                disabled={contextState.loading}
                onClick={requestContextSearch}
              >
                Renouveler le contexte
              </button>
            </div>
          ) : null}

          {articleChoicesNeedReview ? (
            <p className="creation-interview-feedback is-information" role="status">
              La matière a changé. L’angle et la structure conservés doivent être revalidés avant une nouvelle génération.
            </p>
          ) : null}
        </section>
      ) : null}

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
      {step.id === "angle" ? renderAngleStep() : null}
      {step.id === "structure" ? renderStructureStep() : null}
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
          <Link href="/contents" className="contents-ghost-button" onClick={quitAssistant}>Quitter</Link>
          <button
            type="button"
            className="crm-primary-action"
            onClick={moveNext}
            disabled={isNextStepDisabled}
            aria-disabled={isNextStepDisabled}
          >
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
                    ? "Générer jusqu’à 3 angles éditoriaux"
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
