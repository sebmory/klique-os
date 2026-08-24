import { ContentGenerationError } from "@/services/content-generation/errors";
import type { StoryGenerationResultRaw, StorySequenceRaw } from "@/services/content-intelligence/story-schema";
import type { StoryBrief, StoryGenerationResult, StorySequence, StorySequenceFrame } from "@/types/content-generation";
import type { StoryCardType } from "@/types/content-variant";
import type { ContextDateRange, ContextItem } from "@/types/context-intelligence";

const normalize = (value: unknown): string => String(value ?? "").trim();

const storyCardTypes: readonly StoryCardType[] = [
  "introduction",
  "contexte",
  "citation",
  "sondage",
  "quiz",
  "question",
  "teaser",
  "appel_a_action",
];

const isStoryCardType = (value: unknown): value is StoryCardType => {
  return typeof value === "string" && (storyCardTypes as readonly string[]).includes(value);
};

const parseProviderJson = (parsed: unknown): StoryGenerationResultRaw => {
  if (!parsed || typeof parsed !== "object") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure JSON Story invalide");
  }

  return parsed as StoryGenerationResultRaw;
};

const mapFrames = (raw: StorySequenceRaw["frames"], sequenceIndex: number): StorySequenceFrame[] => {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Frames Story incompletes");
  }

  const frames = raw.map((frame, frameIndex) => {
    const type = frame?.type;
    const content = normalize(frame?.content);
    const order = Number.isFinite(frame?.order) ? Math.max(1, Math.floor(frame.order)) : frameIndex + 1;
    const interaction = frame && "interaction" in frame && frame.interaction !== null ? normalize(frame.interaction) || undefined : undefined;

    if (!isStoryCardType(type)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Type de frame Story invalide");
    }

    if (!content) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Contenu de frame Story vide");
    }

    return {
      id: `sequence-${sequenceIndex + 1}-frame-${frameIndex + 1}`,
      order,
      type,
      content,
      interaction,
    };
  });

  const sortedByOrder = [...frames].sort((a, b) => a.order - b.order);
  const isSequential = sortedByOrder.every((frame, index) => frame.order === index + 1);
  if (!isSequential) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Ordre des frames Story invalide");
  }

  return sortedByOrder;
};

const mapSequence = (raw: StorySequenceRaw, index: number): StorySequence => {
  const hook = normalize(raw?.hook);
  const caption = normalize(raw?.caption);
  const cta = normalize(raw?.cta);
  const hashtags = Array.isArray(raw?.hashtags) ? raw.hashtags.map((item) => normalize(item)).filter(Boolean) : [];
  const frames = mapFrames(raw?.frames, index);

  if (!hook || !caption) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Sequence Story incomplete");
  }

  return {
    id: `sequence-${index + 1}`,
    hook,
    frames,
    cta,
    caption,
    hashtags,
  };
};

const toMinimalContextUsage = (args: {
  selectedContextItems: ContextItem[];
  contextResearchedAt?: string;
  contextDateRange?: ContextDateRange;
}) => ({
  usedContextItemIds: args.selectedContextItems.filter((item) => item.isSelected).map((item) => item.id),
  usedSourceIds: Array.from(
    new Set(
      args.selectedContextItems
        .filter((item) => item.isSelected)
        .map((item) => item.sourceUrl || `${item.sourceType}:${item.sourceName}`)
    )
  ),
  unusedSelectedContextItemIds: args.selectedContextItems.filter((item) => !item.isSelected).map((item) => item.id),
  researchedAt: args.contextResearchedAt,
  dateRange: args.contextDateRange,
  externalContextUsed: args.selectedContextItems.some((item) => item.isSelected && item.sourceType !== "internal"),
  selectedItems: args.selectedContextItems,
});

export const validateStoryGenerationJson = (args: {
  parsedContent: unknown;
  requestStartedAt: number;
  provider: string;
  model: string;
  templateKey: "story:v1";
  templateVersion: "v1";
  promptVersion: string;
  brief: Pick<StoryBrief, "frameCount">;
  selectedContextItems: ContextItem[];
  contextResearchedAt?: string;
  contextDateRange?: ContextDateRange;
}): StoryGenerationResult => {
  const parsed = parseProviderJson(args.parsedContent);

  const title = normalize(parsed.title);
  const selectedAngle = normalize(parsed.selectedAngle);
  const sequences = Array.isArray(parsed.sequences) ? parsed.sequences.map(mapSequence) : [];

  if (!title || !selectedAngle || sequences.length !== 3) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Champs Story essentiels vides");
  }

  if (!parsed.metadata || parsed.metadata.templateId !== "story" || parsed.metadata.templateVersion !== "v1") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Metadata Story incoherentes");
  }

  for (const sequence of sequences) {
    if (sequence.frames.length !== args.brief.frameCount) {
      throw new ContentGenerationError(
        "INVALID_PROVIDER_RESPONSE",
        `Nombre de frames Story invalide: attendu ${args.brief.frameCount}, recu ${sequence.frames.length}`
      );
    }
  }

  const generatedAt = new Date().toISOString();

  return {
    title,
    selectedAngle,
    sequences,
    contextUsage: toMinimalContextUsage({
      selectedContextItems: args.selectedContextItems,
      contextResearchedAt: args.contextResearchedAt,
      contextDateRange: args.contextDateRange,
    }),
    metadata: {
      provider: args.provider,
      model: args.model,
      templateId: "story",
      templateKey: args.templateKey,
      templateVersion: args.templateVersion,
      promptVersion: args.promptVersion,
      generatedAt,
      generationDurationMs: Math.max(1, Date.now() - args.requestStartedAt),
      questionCountRequested: 0,
      questionCountGenerated: 0,
      reliabilityNotes: [],
      missingInformation: [],
      externalContextUsed: args.selectedContextItems.some((item) => item.isSelected && item.sourceType !== "internal"),
    },
  };
};
