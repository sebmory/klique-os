import type { ContentVariant, StoriesStructuredContent } from "@/types/content-variant";
import type {
  StoryStudioFrame,
  StoryStudioFrameRole,
  StoryStudioProjectPayload,
  StoryStudioTemplateKey,
} from "@/types/story-studio";

export const afterMatchStoryFrameRoles = ["result", "context", "poll", "question"] as const;

export const afterMatchStoryFramePurposes: Record<StoryStudioFrameRole, string> = {
  result: "resultat",
  context: "fait_marquant",
  poll: "sondage",
  question: "question",
};

export class StoryStudioMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryStudioMappingError";
  }
}

const isAfterMatchStoriesVariant = (variant: ContentVariant): boolean =>
  variant.type === "stories"
  && variant.origin?.type === "after_match_pack"
  && variant.origin.deliverable === "stories"
  && typeof variant.structuredContent === "object"
  && variant.structuredContent !== null
  && "stories" in variant.structuredContent;

const emptyElements: StoryStudioFrame["elements"] = {
  athleteName: false,
  score: false,
  competition: false,
  logo: false,
  signature: false,
  interactionZone: false,
};

const defaultEyebrows: Record<StoryStudioFrameRole, string> = {
  result: "Résultat",
  context: "Fait marquant",
  poll: "Votre avis",
  question: "Posez votre question",
};

export const splitStoryStudioText = (value: unknown): Pick<StoryStudioFrame["text"], "headline" | "body"> => {
  const content = String(value ?? "").trim();
  if (!content) return { headline: "", body: "" };

  const explicitHook = content.match(/^(?:accroche|titre)\s*:\s*([^\r\n]+)(?:\r?\n+([\s\S]*))?$/i);
  if (explicitHook) {
    return {
      headline: explicitHook[1].trim(),
      body: String(explicitHook[2] ?? "").trim(),
    };
  }

  const firstSentence = content.match(/^([\s\S]*?[.!?…][”»"']?)(?:\s+|$)([\s\S]*)$/);
  if (!firstSentence) return { headline: content, body: "" };
  return {
    headline: firstSentence[1].trim(),
    body: firstSentence[2].trim(),
  };
};

export const mapAfterMatchStoriesToStudioPayload = (
  variant: ContentVariant,
  templateKey: StoryStudioTemplateKey = "editorial_klique"
): StoryStudioProjectPayload => {
  if (!isAfterMatchStoriesVariant(variant)) {
    throw new StoryStudioMappingError("Une variante Stories issue d'un Pack Apres-match est requise.");
  }

  const structuredContent = variant.structuredContent as StoriesStructuredContent;
  const stories = [...structuredContent.stories]
    .sort((left, right) => left.index - right.index)
    .slice(0, 4);

  const frames = afterMatchStoryFrameRoles.map((role, index): StoryStudioFrame => {
    const story = stories[index];
    const interaction = String(story?.interaction ?? "").trim();
    const storyText = splitStoryStudioText(story?.content);

    return {
      id: `${variant.id}:frame:${index + 1}`,
      order: (index + 1) as StoryStudioFrame["order"],
      role,
      sourceStoryIndex: story?.index ?? null,
      text: {
        eyebrow: defaultEyebrows[role],
        headline: storyText.headline,
        body: storyText.body,
        interaction,
      },
      photo: {
        assetId: null,
        visible: false,
        scale: 1,
        x: 0,
        y: 0,
      },
      elements: {
        ...emptyElements,
        interactionZone: Boolean(interaction),
      },
    };
  }) as StoryStudioProjectPayload["frames"];

  return {
    schemaVersion: 1,
    templateKey,
    frames,
  };
};