import type { ContentCreationContext, ContentPresetId } from "@/services/contents-hub";
import { CONTENT_AUDIENCE_OPTIONS, CONTENT_TONE_OPTIONS } from "@/services/content-shared-options";
import type {
  ContentSubject,
  ContextConnectorId,
  ContextDateRange,
  ContextItem,
  ContextSearchDepth,
  ContextSourcePreference,
} from "@/types/context-intelligence";
import type {
  PublicationLengthId,
  PublicationObjectiveId,
  PublicationPlatformId,
  ReelDurationId,
  ReelFormatId,
  ReelPlatformId,
  StoryPlatformId,
} from "@/types/content-generation";
import { buildDateRange } from "@/services/context-intelligence/utils";

export type CreationSubjectType = "person" | "team" | "club" | "organization" | "partner" | "event" | "free_topic";

export type CreationObjectiveType =
  | "interview"
  | "publication"
  | "reel"
  | "story"
  | "podcast"
  | "article"
  | "newsletter"
  | "campaign"
  | "sponsoring_file";

export type CreationOption = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type CreationCountOption = {
  id: string;
  label: string;
  value?: number;
  isCustom?: boolean;
};

export type CreationObjectiveDefinition = {
  id: CreationObjectiveType;
  title: string;
  description: string;
  enabled: boolean;
  availabilityLabel: string;
};

export type CreationObjectiveParametersTemplate = {
  configurationTitle: string;
  subtypeLabel: string;
  subtypeOptions: CreationOption[];
  toneOptions: CreationOption[];
  questionCountOptions: CreationCountOption[];
  formatOptions: CreationOption[];
  audienceOptions: CreationOption[];
  finalActionLabel: string;
};

export type CreationAssistantTemplate = {
  id: string;
  title: string;
  objectives: CreationObjectiveDefinition[];
  parametersByObjective: Partial<Record<CreationObjectiveType, CreationObjectiveParametersTemplate>>;
};

export type CreationSubjectDraft = {
  type: CreationSubjectType | null;
  source: "crm" | "temporary";
  id?: string;
  displayName: string;
  description: string;
  sport: string;
  clubOrOrganization: string;
  photoUrl?: string;
  photoAvailable: boolean;
};

export type CreationObjectiveDraft = {
  objective: CreationObjectiveType | null;
  subtypeId: string;
};

export type CreationParametersDraft = {
  toneId: string;
  customTone: string;
  questionCountId: string;
  customQuestionCount: string;
  formatId: string;
  audienceId: string;
  customAudience: string;
  additionalContext: string;
  requiredTopics: string;
  avoidedTopics: string;
  useContextIntelligence: boolean;
  contextDateRangePreset: ContextDateRange["preset"];
  contextCustomFrom: string;
  contextCustomTo: string;
  contextSourcePreference: ContextSourcePreference;
  contextSearchDepth: ContextSearchDepth;
  contextEnableExternalNews: boolean;
  contextEnableProductions: boolean;
  contextEnableCrm: boolean;
  contextEnableManual: boolean;
  publicationObjectiveId: PublicationObjectiveId;
  publicationCustomObjective: string;
  publicationSelectedAngle: string;
  publicationPlatform: PublicationPlatformId;
  publicationLength: PublicationLengthId;
  publicationCta: string;
  publicationHashtags: string;
  publicationUseEmojis: boolean;
  publicationSpecialInstructions: string;
  publicationIncludeElements: string;
  publicationAvoidElements: string;
  reelSelectedAngle: string;
  reelDuration: ReelDurationId;
  reelFormat: ReelFormatId;
  reelPlatform: ReelPlatformId;
  storySelectedAngle: string;
  storyFrameCount: string;
  storyPlatform: StoryPlatformId;
};

export type AfterMatchPresetDraft = {
  opponent: string;
  result: string;
  competition: string;
  matchDate: string;
  keyFacts: string;
  nextFixture: string;
};

export type CreationAssistantDraft = {
  subject: CreationSubjectDraft;
  objective: CreationObjectiveDraft;
  parameters: CreationParametersDraft;
  presetId?: ContentPresetId;
  afterMatch?: AfterMatchPresetDraft;
};

export type CreationPreparationPayload = {
  templateId: string;
  context: ContentCreationContext;
  subject: ContentSubject & { photoAvailable: boolean };
  objective: {
    id: CreationObjectiveType;
    subtypeId: string;
  };
  parameters: {
    language: "fr" | "fr-CH";
    toneId: string;
    questionCount: number;
    formatId: string;
    audienceId: string;
    additionalContext: string;
    requiredTopics: string[];
    avoidedTopics: string[];
    contextIntelligence: {
      enabled: boolean;
      selectedConnectorIds: ContextConnectorId[];
      dateRange: ContextDateRange;
      sourcePreference: ContextSourcePreference;
      searchDepth: ContextSearchDepth;
      selectedContextItems: ContextItem[];
      researchedAt?: string;
    };
    publication?: {
      objectiveId: PublicationObjectiveId;
      customObjective: string;
      selectedAngle: string;
      platform: PublicationPlatformId;
      length: PublicationLengthId;
      cta: string;
      hashtags: string[];
      useEmojis: boolean;
      specialInstructions: string;
      includeElements: string[];
      avoidElements: string[];
    };
    reel?: {
      selectedAngle: string;
      duration: ReelDurationId;
      format: ReelFormatId;
      platform: ReelPlatformId;
    };
    story?: {
      selectedAngle: string;
      frameCount: number;
      platform: StoryPlatformId;
    };
  };
};

export const CREATION_MIN_QUESTION_COUNT = 3;
export const CREATION_MAX_QUESTION_COUNT = 30;

const objectiveDefinitions: CreationObjectiveDefinition[] = [
  {
    id: "interview",
    title: "Interview",
    description: "Construisez une interview claire et engageante selon votre contexte.",
    enabled: true,
    availabilityLabel: "Disponible",
  },
  {
    id: "publication",
    title: "Publication",
    description: "Structurez un post reseau social avec angle et message central.",
    enabled: true,
    availabilityLabel: "Disponible",
  },
  {
    id: "reel",
    title: "Reel",
    description: "Preparez un script court adapte aux formats verticaux.",
    enabled: true,
    availabilityLabel: "Disponible",
  },
  {
    id: "story",
    title: "Story",
    description: "Definissez une sequence Story en plusieurs frames impactantes.",
    enabled: true,
    availabilityLabel: "Disponible",
  },
  {
    id: "podcast",
    title: "Podcast",
    description: "Cadrez une trame audio avec fil conducteur et points forts.",
    enabled: false,
    availabilityLabel: "Bientot disponible",
  },
  {
    id: "article",
    title: "Article",
    description: "Organisez une version longue avec sections et transitions.",
    enabled: false,
    availabilityLabel: "Bientot disponible",
  },
  {
    id: "campaign",
    title: "Campagne",
    description: "Coordonnez plusieurs contenus autour d un objectif unique.",
    enabled: false,
    availabilityLabel: "Bientot disponible",
  },
];

const interviewParametersTemplate: CreationObjectiveParametersTemplate = {
  configurationTitle: "Personnalisez votre interview",
  subtypeLabel: "Type d interview",
  subtypeOptions: [
    { id: "portrait", label: "Portrait", description: "Mettre en avant la personnalite et le parcours.", enabled: true },
    { id: "before_match", label: "Avant-match", description: "Preparatif et attentes avant la rencontre.", enabled: true },
    { id: "after_match", label: "Apres-match", description: "Debrief a chaud et enseignements.", enabled: true },
    { id: "fast_questions", label: "Fast Questions", description: "Questions courtes et rythme dynamique.", enabled: true },
    { id: "journey", label: "Parcours", description: "Retour sur les etapes cles de l evolution.", enabled: true },
    { id: "performance", label: "Performance", description: "Analyse de progression et objectifs sportifs.", enabled: true },
    { id: "mental", label: "Mental", description: "Approche psychologique et routines de concentration.", enabled: true },
    { id: "injury_return", label: "Retour de blessure", description: "Reprise et adaptation apres blessure.", enabled: true },
    { id: "new_club", label: "Nouveau club", description: "Integration et projection dans un nouvel environnement.", enabled: true },
    { id: "free", label: "Libre", description: "Structure ouverte adaptee a votre besoin.", enabled: true },
  ],
  toneOptions: CONTENT_TONE_OPTIONS.map((option) => ({ ...option, enabled: true })),
  questionCountOptions: [
    { id: "q5", label: "5", value: 5 },
    { id: "q8", label: "8", value: 8 },
    { id: "q10", label: "10", value: 10 },
    { id: "q15", label: "15", value: 15 },
    { id: "custom", label: "Personnalise", isCustom: true },
  ],
  formatOptions: [
    { id: "written", label: "Ecrit", description: "Version texte complete.", enabled: true },
    { id: "video", label: "Video", description: "Guide de questions pour tournage video.", enabled: true },
    { id: "podcast", label: "Podcast", description: "Trame audio adaptee a l oral.", enabled: true },
    { id: "social", label: "Reseaux sociaux", description: "Version courte optimisee social media.", enabled: true },
  ],
  audienceOptions: CONTENT_AUDIENCE_OPTIONS.map((option) => ({ ...option, enabled: true })),
  finalActionLabel: "Creer l interview",
};

const assistantTemplate: CreationAssistantTemplate = {
  id: "core_content_assistant_v1",
  title: "Assistant de creation",
  objectives: objectiveDefinitions,
  parametersByObjective: {
    interview: interviewParametersTemplate,
  },
};

const normalize = (value: string): string => value.trim();

const resolveFreeOptionValue = (id: string, customValue: string): string => {
  if (id !== "free") return id;
  return normalize(customValue);
};

const parseTopics = (value: string): string[] => {
  return value
    .split(/[\n,;|]/)
    .map((segment) => normalize(segment))
    .filter(Boolean)
    .slice(0, 12);
};

// Bloc clairement identifie, ajoute uniquement pour le preset Apres-match; aucun champ vide n y figure.
const buildAfterMatchContextBlock = (
  afterMatch: AfterMatchPresetDraft,
  subjectName: string,
  subjectType: CreationSubjectType | null
): string => {
  const focusLines = subjectName
    ? [
        `Sujet central: ${subjectName} est le point de vue central de cette publication.`,
        `Chacune des 3 propositions doit mentionner le nom complet de ${subjectName} dans le hook ou la premiere phrase.`,
        `Chacune des 3 propositions doit rester centree sur ${subjectName} dans tout le corps du texte.`,
        `Ne jamais transformer le contenu en communication generique du club plutot qu en publication centree sur ${subjectName}.`,
        `Utiliser les faits du match pour raconter ${subjectName}, jamais pour le remplacer comme sujet.`,
        subjectType === "person"
          ? `Ne jamais inventer la performance, les statistiques, le temps de jeu ou les declarations de ${subjectName}.`
          : "",
      ].filter(Boolean)
    : [];

  const lines = [
    afterMatch.opponent ? `Adversaire: ${normalize(afterMatch.opponent)}` : "",
    afterMatch.result ? `Resultat: ${normalize(afterMatch.result)}` : "",
    afterMatch.competition ? `Competition: ${normalize(afterMatch.competition)}` : "",
    afterMatch.matchDate ? `Date du match: ${normalize(afterMatch.matchDate)}` : "",
    afterMatch.keyFacts ? `Faits marquants: ${normalize(afterMatch.keyFacts)}` : "",
    afterMatch.nextFixture ? `Prochain rendez-vous: ${normalize(afterMatch.nextFixture)}` : "",
  ].filter(Boolean);

  const allLines = [...focusLines, ...lines];
  if (!allLines.length) return "";

  return ["[MATCH APRES-MATCH]", ...allLines].join("\n");
};

// Seuls les faits structures pertinents en tant que sujets obligatoires; les faits marquants restent en texte libre.
const buildAfterMatchTopics = (afterMatch: AfterMatchPresetDraft, subjectName: string): string[] => {
  return [
    subjectName ? `Sujet: ${subjectName}` : "",
    afterMatch.opponent ? `Adversaire: ${normalize(afterMatch.opponent)}` : "",
    afterMatch.result ? `Resultat: ${normalize(afterMatch.result)}` : "",
    afterMatch.competition ? `Competition: ${normalize(afterMatch.competition)}` : "",
    afterMatch.matchDate ? `Date du match: ${normalize(afterMatch.matchDate)}` : "",
    afterMatch.nextFixture ? `Prochain rendez-vous: ${normalize(afterMatch.nextFixture)}` : "",
  ].filter(Boolean);
};

const mergeTopics = (existing: string[], additions: string[]): string[] => {
  return [...existing, ...additions].filter(Boolean).slice(0, 12);
};

const mapContextTypeToSubjectType = (value?: string): CreationSubjectType => {
  if (value === "athlete") return "person";
  if (value === "partner") return "partner";
  if (value === "club") return "club";
  if (value === "organization") return "organization";
  return "free_topic";
};

export const createInitialAssistantDraft = (context: ContentCreationContext): CreationAssistantDraft => {
  const isContextual = context.mode === "contextual" && Boolean(context.subjectName);
  const isCrmContext = isContextual && Boolean(context.subjectId);
  const initialObjective = context.objective ?? "interview";
  const isPublication = initialObjective === "publication";
  const isReel = initialObjective === "reel";
  const isStory = initialObjective === "story";
  // Le preset n a de sens que pour l objectif Publication, seul flux qui le consommera.
  const initialPresetId = isPublication ? context.presetId : undefined;

  return {
    subject: {
      type: isContextual ? mapContextTypeToSubjectType(context.subjectType) : null,
      source: isCrmContext ? "crm" : "temporary",
      id: isCrmContext ? context.subjectId : undefined,
      displayName: isContextual ? normalize(context.subjectName ?? "") : "",
      description: "",
      sport: "",
      clubOrOrganization: "",
      photoAvailable: false,
    },
    objective: {
      objective: initialObjective,
      subtypeId: "",
    },
    parameters: {
      toneId: isPublication || isReel || isStory ? "authentic" : "",
      customTone: "",
      questionCountId: "",
      customQuestionCount: "",
      formatId: "",
      audienceId: isPublication || isReel || isStory ? "general" : "",
      customAudience: "",
      additionalContext: "",
      requiredTopics: "",
      avoidedTopics: "",
      useContextIntelligence: false,
      contextDateRangePreset: "last_30_days",
      contextCustomFrom: "",
      contextCustomTo: "",
      contextSourcePreference: "official_and_reliable",
      contextSearchDepth: "standard",
      contextEnableExternalNews: true,
      contextEnableProductions: true,
      contextEnableCrm: true,
      contextEnableManual: true,
      publicationObjectiveId: "inform",
      publicationCustomObjective: "",
      publicationSelectedAngle: "",
      publicationPlatform: "instagram",
      publicationLength: "medium",
      publicationCta: "",
      publicationHashtags: "",
      publicationUseEmojis: false,
      publicationSpecialInstructions: "",
      publicationIncludeElements: "",
      publicationAvoidElements: "",
      reelSelectedAngle: "",
      reelDuration: "30s",
      reelFormat: "face_camera",
      reelPlatform: "instagram",
      storySelectedAngle: "",
      storyFrameCount: "5",
      storyPlatform: "instagram",
    },
    presetId: initialPresetId,
    afterMatch:
      initialPresetId === "after-match"
        ? {
            opponent: "",
            result: "",
            competition: "",
            matchDate: "",
            keyFacts: "",
            nextFixture: "",
          }
        : undefined,
  };
};

export const ContentCreationAssistantService = {
  template(): CreationAssistantTemplate {
    return assistantTemplate;
  },

  parametersForObjective(objective: CreationObjectiveType | null): CreationObjectiveParametersTemplate | null {
    if (!objective) return null;
    return assistantTemplate.parametersByObjective[objective] ?? null;
  },

  preparePayload(args: {
    context: ContentCreationContext;
    draft: CreationAssistantDraft;
    selectedContextItems?: ContextItem[];
    contextResearchedAt?: string;
    contextDateRange?: ContextDateRange;
  }): CreationPreparationPayload | null {
    const subjectType = args.draft.subject.type;
    const objectiveId = args.draft.objective.objective;

    if (!subjectType || !objectiveId) return null;

    const params = this.parametersForObjective(objectiveId);
    const isInterview = objectiveId === "interview";
    const isPublication = objectiveId === "publication";
    const isReel = objectiveId === "reel";
    const isStory = objectiveId === "story";
    const isAfterMatch = isPublication && args.draft.presetId === "after-match";

    let questionCount = 0;
    let storyFrameCount = 0;
    if (isInterview) {
      if (!params) return null;

      const selectedCount = params.questionCountOptions.find((item) => item.id === args.draft.parameters.questionCountId);
      const customCount = Number(args.draft.parameters.customQuestionCount);

      questionCount = selectedCount?.value ?? 0;
      if (selectedCount?.isCustom) {
        questionCount = Number.isFinite(customCount) && customCount > 0 ? Math.floor(customCount) : 0;
      }

      if (!questionCount) return null;
      if (questionCount < CREATION_MIN_QUESTION_COUNT || questionCount > CREATION_MAX_QUESTION_COUNT) return null;
      if (!args.draft.parameters.toneId || !args.draft.parameters.formatId || !args.draft.parameters.audienceId) return null;
    } else if (isPublication || isReel || isStory) {
      if (!args.draft.parameters.toneId.trim() || !args.draft.parameters.audienceId.trim()) return null;
      if (isReel && !normalize(args.draft.parameters.reelSelectedAngle)) return null;
      if (isStory) {
        if (!normalize(args.draft.parameters.storySelectedAngle)) return null;

        const customFrameCount = Number(args.draft.parameters.storyFrameCount);
        storyFrameCount = Number.isFinite(customFrameCount) && customFrameCount > 0 ? Math.floor(customFrameCount) : 0;
        if (!storyFrameCount) return null;
      }
    } else {
      return null;
    }

    if (args.draft.parameters.toneId === "free" && !normalize(args.draft.parameters.customTone)) return null;
    if (args.draft.parameters.audienceId === "free" && !normalize(args.draft.parameters.customAudience)) return null;

    const selectedConnectorIds: ContextConnectorId[] = [];
    if (args.draft.parameters.contextEnableCrm) selectedConnectorIds.push("crm");
    if (args.draft.parameters.contextEnableProductions) selectedConnectorIds.push("productions");
    if (args.draft.parameters.contextEnableManual) selectedConnectorIds.push("manual");
    if (args.draft.parameters.contextEnableExternalNews) selectedConnectorIds.push("external_news");

    return {
      templateId: assistantTemplate.id,
      context: args.context,
      subject: {
        type: subjectType,
        source: args.draft.subject.source,
        id: args.draft.subject.id,
        displayName: normalize(args.draft.subject.displayName),
        description: normalize(args.draft.subject.description),
        sport: normalize(args.draft.subject.sport),
        clubOrOrganization: normalize(args.draft.subject.clubOrOrganization),
        disciplineOrPosition: "",
        photoUrl: args.draft.subject.photoUrl,
        photoAvailable: args.draft.subject.photoAvailable,
      },
      objective: {
        id: objectiveId,
        subtypeId: args.draft.objective.subtypeId,
      },
      parameters: {
        language: "fr-CH",
        toneId: resolveFreeOptionValue(args.draft.parameters.toneId, args.draft.parameters.customTone),
        questionCount: isInterview ? questionCount : 3,
        formatId: isPublication
          ? args.draft.parameters.publicationPlatform
          : isReel
            ? args.draft.parameters.reelFormat
            : isStory
              ? args.draft.parameters.storyPlatform
              : args.draft.parameters.formatId,
        audienceId: resolveFreeOptionValue(args.draft.parameters.audienceId, args.draft.parameters.customAudience),
        additionalContext: isAfterMatch && args.draft.afterMatch
          ? [
              normalize(args.draft.parameters.additionalContext),
              buildAfterMatchContextBlock(args.draft.afterMatch, normalize(args.draft.subject.displayName), subjectType),
            ]
              .filter(Boolean)
              .join("\n\n")
          : normalize(args.draft.parameters.additionalContext),
        requiredTopics: isAfterMatch && args.draft.afterMatch
          ? mergeTopics(
              parseTopics(args.draft.parameters.requiredTopics),
              buildAfterMatchTopics(args.draft.afterMatch, normalize(args.draft.subject.displayName))
            )
          : parseTopics(args.draft.parameters.requiredTopics),
        avoidedTopics: parseTopics(args.draft.parameters.avoidedTopics),
        contextIntelligence: {
          enabled: args.draft.parameters.useContextIntelligence,
          selectedConnectorIds,
          dateRange:
            args.contextDateRange ??
            buildDateRange(
              args.draft.parameters.contextDateRangePreset,
              args.draft.parameters.contextCustomFrom,
              args.draft.parameters.contextCustomTo
            ),
          sourcePreference: args.draft.parameters.contextSourcePreference,
          searchDepth: args.draft.parameters.contextSearchDepth,
          selectedContextItems: args.selectedContextItems ?? [],
          researchedAt: args.contextResearchedAt,
        },
        publication: isPublication
          ? {
              objectiveId: isAfterMatch ? "narrate" : args.draft.parameters.publicationObjectiveId,
              customObjective: normalize(args.draft.parameters.publicationCustomObjective),
              selectedAngle: normalize(args.draft.parameters.publicationSelectedAngle),
              platform: args.draft.parameters.publicationPlatform,
              length: args.draft.parameters.publicationLength,
              cta: normalize(args.draft.parameters.publicationCta),
              hashtags: parseTopics(args.draft.parameters.publicationHashtags),
              useEmojis: args.draft.parameters.publicationUseEmojis,
              specialInstructions: normalize(args.draft.parameters.publicationSpecialInstructions),
              includeElements: parseTopics(args.draft.parameters.publicationIncludeElements),
              avoidElements: parseTopics(args.draft.parameters.publicationAvoidElements),
            }
          : undefined,
        reel: isReel
          ? {
              selectedAngle: normalize(args.draft.parameters.reelSelectedAngle),
              duration: args.draft.parameters.reelDuration,
              format: args.draft.parameters.reelFormat,
              platform: args.draft.parameters.reelPlatform,
            }
          : undefined,
        story: isStory
          ? {
              selectedAngle: normalize(args.draft.parameters.storySelectedAngle),
              frameCount: storyFrameCount,
              platform: args.draft.parameters.storyPlatform,
            }
          : undefined,
      },
    };
  },
};
