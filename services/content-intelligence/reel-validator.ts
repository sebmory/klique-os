import { ContentGenerationError } from "@/services/content-generation/errors";
import type { ReelGenerationResultRaw } from "@/services/content-intelligence/reel-schema";
import type { ReelBrief, ReelConcept, ReelGenerationResult } from "@/types/content-generation";
import type { ContextDateRange, ContextItem } from "@/types/context-intelligence";

const normalize = (value: unknown): string => String(value ?? "").trim();

const parseProviderJson = (parsed: unknown): ReelGenerationResultRaw => {
  if (!parsed || typeof parsed !== "object") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Structure JSON Reel invalide");
  }

  return parsed as ReelGenerationResultRaw;
};

const normalizeForSimilarity = (value: string): string[] => {
  return normalize(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
};

const jaccardSimilarity = (a: string[], b: string[]): number => {
  const aSet = new Set(a);
  const bSet = new Set(b);
  if (!aSet.size && !bSet.size) return 1;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }

  const union = new Set([...aSet, ...bSet]).size;
  return union ? intersection / union : 0;
};

const durationToSeconds: Record<ReelBrief["duration"], number> = {
  "15s": 15,
  "30s": 30,
  "45s": 45,
  "60s": 60,
  "90s": 90,
};

const mapConcept = (raw: ReelGenerationResultRaw["concepts"][number], index: number): ReelConcept => {
  const hook = normalize(raw.hook);
  const concept = normalize(raw.concept);
  const caption = normalize(raw.caption);
  const coverIdea = normalize(raw.coverIdea);
  const cta = normalize(raw.cta);
  const hashtags = Array.isArray(raw.hashtags) ? raw.hashtags.map((item) => normalize(item)).filter(Boolean) : [];
  const scenes = Array.isArray(raw.scenes)
    ? raw.scenes.map((scene, sceneIndex) => ({
        id: `scene-${index + 1}-${sceneIndex + 1}`,
        order: Number.isFinite(scene.order) ? Math.max(1, Math.floor(scene.order)) : sceneIndex + 1,
        durationSeconds: Number.isFinite(scene.durationSeconds) ? Math.max(1, Math.floor(scene.durationSeconds)) : 0,
        role: normalize((scene as { role?: unknown }).role),
        shotPlan: normalize(scene.shotPlan),
        action: normalize((scene as { action?: unknown }).action),
        onScreenText: normalize(scene.onScreenText),
        voiceOver: normalize(scene.voiceOver),
        bRoll: normalize(scene.bRoll),
        transition: normalize(scene.transition),
        ambianceMusic: normalize(scene.ambianceMusic),
        direction:
          (scene as { direction?: unknown }).direction === null
            ? (null as unknown as string)
            : normalize((scene as { direction?: unknown }).direction) || undefined,
      }))
    : [];

  if (!hook || !concept || !caption || !coverIdea || scenes.length < 2) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Concept Reel incomplet");
  }

  for (const scene of scenes) {
    if (!scene.role || !scene.action) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Role/action de scene Reel manquants");
    }
    if (!scene.durationSeconds) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Duree de scene Reel invalide");
    }
    if (!scene.shotPlan || !scene.onScreenText || !scene.bRoll || !scene.transition || !scene.ambianceMusic) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Scene Reel incomplete");
    }
  }

  return {
    id: `concept-${index + 1}`,
    hook,
    concept,
    scenes,
    cta,
    caption,
    hashtags,
    coverIdea,
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

export const validateReelGenerationJson = (args: {
  parsedContent: unknown;
  requestStartedAt: number;
  provider: string;
  model: string;
  templateKey: "reel:v1";
  templateVersion: "v1";
  promptVersion: string;
  brief: Pick<ReelBrief, "duration" | "format">;
  selectedContextItems: ContextItem[];
  contextResearchedAt?: string;
  contextDateRange?: ContextDateRange;
}): ReelGenerationResult => {
  const parsed = parseProviderJson(args.parsedContent);

  const title = normalize(parsed.title);
  const selectedAngle = normalize(parsed.selectedAngle);
  const concepts = Array.isArray(parsed.concepts) ? parsed.concepts.map(mapConcept) : [];

  if (!title || !selectedAngle || concepts.length !== 3) {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Champs Reel essentiels vides");
  }

  if (!parsed.metadata || parsed.metadata.templateId !== "reel" || parsed.metadata.templateVersion !== "v1") {
    throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Metadata Reel incoherentes");
  }

  const targetDuration = durationToSeconds[args.brief.duration];
  for (const concept of concepts) {
    const totalDuration = concept.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    if (totalDuration !== targetDuration) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", `Duree Reel invalide: ${totalDuration}s au lieu de ${targetDuration}s`);
    }
    if (args.brief.format === "voice_over" && !concept.scenes.some((scene) => scene.voiceOver.length > 0)) {
      throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Voix off requise pour le format voice_over");
    }
  }

  const combinedTexts = concepts.map((concept) => `${concept.hook} ${concept.concept} ${concept.caption}`);
  for (let i = 0; i < combinedTexts.length; i += 1) {
    for (let j = i + 1; j < combinedTexts.length; j += 1) {
      const similarity = jaccardSimilarity(normalizeForSimilarity(combinedTexts[i]), normalizeForSimilarity(combinedTexts[j]));
      if (similarity >= 0.75) {
        throw new ContentGenerationError("INVALID_PROVIDER_RESPONSE", "Concepts Reel trop similaires");
      }
    }
  }

  const generatedAt = new Date().toISOString();

  return {
    title,
    selectedAngle,
    concepts,
    contextUsage: toMinimalContextUsage({
      selectedContextItems: args.selectedContextItems,
      contextResearchedAt: args.contextResearchedAt,
      contextDateRange: args.contextDateRange,
    }),
    metadata: {
      provider: args.provider,
      model: args.model,
      templateId: "reel",
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
