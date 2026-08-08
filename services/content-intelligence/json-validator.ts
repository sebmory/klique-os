import { ContentGenerationError } from "@/services/content-generation/errors";
import type {
  ContentGenerationResult,
  ContentTemplateKey,
  InterviewQuestion,
  PublicationIdea,
  ReelIdea,
  StoryIdea,
} from "@/types/content-generation";
import type { InterviewGenerationResultRaw } from "@/services/content-intelligence/interview-schema";
import type { ContextDateRange, ContextItem } from "@/types/context-intelligence";

const normalize = (value: unknown): string => String(value ?? "").trim();

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalize(item)).filter(Boolean);
};

const normalizeQuestion = (value: unknown, index: number): InterviewQuestion | null => {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const text = normalize(obj.text);
  const purpose = normalize(obj.purpose);
  const topic = normalize(obj.topic);
  const followUps = toStringArray(obj.followUps);
  if (!text) return null;
  if (!purpose || !topic) return null;
  if (!followUps.length) return null;

  return {
    id: `question-${index + 1}`,
    text,
    purpose,
    followUps,
    optional: false,
    topic,
  };
};

const normalizeReelIdea = (value: unknown, index: number): ReelIdea | null => {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const title = normalize(obj.title);
  const concept = normalize(obj.concept);
  const hook = normalize(obj.suggestedHook);
  if (!title || !concept || !hook) return null;
  return { id: `reel-${index + 1}`, title, concept, suggestedHook: hook };
};

const normalizeStoryIdea = (value: unknown, index: number): StoryIdea | null => {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const title = normalize(obj.title);
  const concept = normalize(obj.concept);
  const hook = normalize(obj.suggestedHook);
  if (!title || !concept || !hook) return null;
  return {
    id: `story-${index + 1}`,
    title,
    concept,
    suggestedHook: hook,
  };
};

const normalizePublicationIdea = (value: unknown, index: number): PublicationIdea | null => {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const title = normalize(obj.title);
  const concept = normalize(obj.concept);
  const hook = normalize(obj.suggestedHook);
  if (!title || !concept || !hook) return null;
  return { id: `publication-${index + 1}`, title, concept, suggestedHook: hook };
};

const parseProviderJson = (raw: string): unknown => {
  const direct = raw.trim();
  if (!direct) {
    throw new ContentGenerationError("EMPTY_PROVIDER_RESPONSE", "Sortie texte vide du fournisseur");
  }

  try {
    return JSON.parse(direct);
  } catch {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Reponse structuree impossible a parser");
  }
};

const hasExactDuplicateQuestions = (questions: InterviewQuestion[]): boolean => {
  const seen = new Set<string>();
  for (const question of questions) {
    const key = normalize(question.text).toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};

const extractMissingFieldsSummary = (obj: Record<string, unknown>): string[] => {
  const missing: string[] = [];
  if (!normalize(obj.title)) missing.push("title");
  if (!normalize(obj.editorialAngle)) missing.push("editorialAngle");
  if (!normalize(obj.introduction)) missing.push("introduction");
  if (!Array.isArray(obj.questions)) missing.push("questions");
  if (!normalize(obj.conclusion)) missing.push("conclusion");
  if (!Array.isArray(obj.reelIdeas)) missing.push("reelIdeas");
  if (!Array.isArray(obj.storyIdeas)) missing.push("storyIdeas");
  if (!Array.isArray(obj.publicationIdeas)) missing.push("publicationIdeas");
  if (!obj.metadata || typeof obj.metadata !== "object") missing.push("metadata");
  return missing;
};

export const validateContentGenerationJson = (args: {
  rawContent?: string;
  parsedContent?: unknown;
  requestStartedAt: number;
  provider: string;
  model: string;
  templateKey: ContentTemplateKey;
  templateVersion: string;
  promptVersion: string;
  questionCount: number;
  missingInformation: string[];
  selectedContextItems?: ContextItem[];
  contextResearchedAt?: string;
  contextDateRange?: ContextDateRange;
}): ContentGenerationResult => {
  const parsed = args.parsedContent ?? parseProviderJson(args.rawContent ?? "");

  if (!parsed || typeof parsed !== "object") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure JSON invalide");
  }

  const obj = parsed as Record<string, unknown>;
  const missingFields = extractMissingFieldsSummary(obj);
  if (missingFields.length > 0) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Champs obligatoires manquants: ${missingFields.join(", ")}`);
  }

  const rawResult = obj as InterviewGenerationResultRaw;
  const title = normalize(obj.title);
  const editorialAngle = normalize(obj.editorialAngle);
  const introduction = normalize(obj.introduction);
  const conclusion = normalize(obj.conclusion);
  if (!title || !editorialAngle || !introduction || !conclusion) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Champs texte essentiels vides");
  }

  const questions = (Array.isArray(rawResult.questions) ? rawResult.questions : [])
    .map((item, index) => normalizeQuestion(item, index))
    .filter((item): item is InterviewQuestion => item !== null);

  if (questions.length !== args.questionCount) {
    throw new ContentGenerationError(
      "INVALID_PROVIDER_RESPONSE",
      `Nombre de questions invalide: attendu ${args.questionCount}, recu ${questions.length}`
    );
  }

  if (hasExactDuplicateQuestions(questions)) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Questions dupliquees detectees");
  }

  const reelIdeas = (Array.isArray(rawResult.reelIdeas) ? rawResult.reelIdeas : [])
    .map((item, index) => normalizeReelIdea(item, index))
    .filter((item): item is ReelIdea => item !== null);

  const storyIdeas = (Array.isArray(rawResult.storyIdeas) ? rawResult.storyIdeas : [])
    .map((item, index) => normalizeStoryIdea(item, index))
    .filter((item): item is StoryIdea => item !== null);

  const publicationIdeas = (Array.isArray(rawResult.publicationIdeas) ? rawResult.publicationIdeas : [])
    .map((item, index) => normalizePublicationIdea(item, index))
    .filter((item): item is PublicationIdea => item !== null);

  if (!reelIdeas.length || !storyIdeas.length || !publicationIdeas.length) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Declinaisons manquantes ou invalides");
  }

  const metadata = rawResult.metadata;
  if (!metadata || metadata.templateId !== "interview" || metadata.templateVersion !== "v1") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Metadata template incoherentes");
  }

  const selectedContextItems = args.selectedContextItems ?? [];
  const usedSourceIds = Array.from(
    new Set(
      selectedContextItems
        .map((item) => `${normalize(item.sourceName)}|${normalize(item.sourceUrl)}`)
        .filter((item) => item !== "|")
    )
  );

  return {
    title,
    editorialAngle,
    introduction,
    questions,
    conclusion,
    reelIdeas,
    storyIdeas,
    publicationIdeas,
    contextUsage: {
      usedContextItemIds: selectedContextItems.filter((item) => item.isSelected).map((item) => item.id),
      usedSourceIds,
      unusedSelectedContextItemIds: [],
      researchedAt: args.contextResearchedAt,
      dateRange: args.contextDateRange,
      externalContextUsed: selectedContextItems.some((item) => item.connectorId === "external_news" && item.isSelected),
      selectedItems: selectedContextItems.filter((item) => item.isSelected),
    },
    metadata: {
      provider: args.provider,
      model: args.model,
      templateId: metadata.templateId,
      templateKey: args.templateKey,
      templateVersion: args.templateVersion,
      promptVersion: args.promptVersion,
      generatedAt: new Date().toISOString(),
      generationDurationMs: Date.now() - args.requestStartedAt,
      questionCountRequested: args.questionCount,
      questionCountGenerated: questions.length,
      reliabilityNotes: [
        "Utiliser uniquement les faits fournis.",
        "Ne pas presenter une supposition comme un fait.",
      ],
      missingInformation: args.missingInformation,
      externalContextUsed: selectedContextItems.some((item) => item.connectorId === "external_news" && item.isSelected),
    },
  };
};
