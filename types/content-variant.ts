import type { ContentDocumentType } from "@/types/content-document";
import type { ContextDateRange, ContextItem } from "@/types/context-intelligence";

export type ContentVariantType =
  | "publication"
  | "carousel"
  | "reel"
  | "stories"
  | "teaser"
  | "short_article"
  | "quote_visual"
  | "podcast_intro";

export type ContentVariantPlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "tiktok"
  | "youtube_shorts"
  | "website"
  | "newsletter"
  | "media"
  | "free";

export type ContentVariantObjective =
  | "inform"
  | "inspire"
  | "present"
  | "promote"
  | "tease"
  | "engagement"
  | "highlight_subject"
  | "highlight_partner"
  | "traffic"
  | "free";

export type ContentVariantStatus = "draft" | "ready" | "approved" | "planned" | "published" | "archived";

export type ContentVariantTone =
  | "institutional"
  | "journalistic"
  | "authentic"
  | "inspiring"
  | "dynamic"
  | "casual"
  | "free";

export type WorkspaceEditorialProfile = {
  defaultTone?: string;
  vocabularyPreferences?: string[];
  forbiddenExpressions?: string[];
  preferredStructure?: string;
  targetAudiences?: string[];
  brandVoice?: string;
  editorialPrinciples?: string[];
  platformPreferences?: Record<string, string>;
};

export type ContentVariationConstraints = {
  language: "fr" | "fr-CH";
  audience: string;
  length?: "short" | "medium" | "long";
  durationSeconds?: number;
  slideCount?: number;
  storyCount?: number;
  callToAction?: string;
  includeTopics: string[];
  avoidTopics: string[];
  additionalContext?: string;
  includePrivateNotes: boolean;
  includedPrivateNoteQuestionIds: string[];
};

export type SourceDocumentSnapshot = {
  documentId: string;
  documentType: ContentDocumentType;
  documentVersionId: string;
  documentUpdatedAt: string;
  subjectId?: string;
  subjectName: string;
  title: string;
  editorialAngle: string;
  introduction: string;
  questions: Array<{
    id: string;
    text: string;
    purpose: string;
    topic: string;
    followUps: string[];
    includedPrivateNote?: string;
  }>;
  conclusion: string;
  selectedContextItems: ContextItem[];
  contextDateRange?: ContextDateRange;
  contextResearchedAt?: string;
};

export type ContentVariationRequest = {
  sourceDocument: SourceDocumentSnapshot;
  sourceDocumentId: string;
  sourceDocumentType: ContentDocumentType;
  selectedContextItems: ContextItem[];
  variationType: ContentVariantType;
  platform: ContentVariantPlatform;
  objective: ContentVariantObjective;
  tone: ContentVariantTone;
  audience: string;
  constraints: ContentVariationConstraints;
  language: "fr" | "fr-CH";
  workspaceId?: string;
  workspaceEditorialProfile?: WorkspaceEditorialProfile;
};

export type PublicationStructuredContent = {
  angle: string;
  hook: string;
  body: string;
  callToAction: string;
  hashtags: string[];
  visualIdea: string;
};

export type CarouselStructuredContent = {
  title: string;
  cover: string;
  slides: Array<{ index: number; text: string }>;
  conclusion: string;
  callToAction: string;
  caption: string;
};

export type ReelStructuredContent = {
  concept: string;
  hook: string;
  duration: string;
  scenario: string;
  scenes: Array<{ index: number; shot: string; action: string }>;
  onScreenText: string[];
  voiceOver?: string;
  callToAction: string;
  caption: string;
  coverIdea: string;
};

export type StoryCardType =
  | "introduction"
  | "contexte"
  | "citation"
  | "sondage"
  | "quiz"
  | "question"
  | "teaser"
  | "appel_a_action";

export type StoriesStructuredContent = {
  sequenceTitle: string;
  stories: Array<{
    index: number;
    type: StoryCardType;
    content: string;
    interaction?: string;
  }>;
  callToAction: string;
};

export type TeaserStructuredContent = {
  shortVersion: string;
  mediumVersion: string;
  hook: string;
  callToAction: string;
  recommendedChannel: string;
};

export type ShortArticleStructuredContent = {
  title: string;
  chapo: string;
  introduction: string;
  structure: string[];
  body: string;
  conclusion: string;
};

export type QuoteVisualStructuredContent = {
  hasQuote: boolean;
  quote?: string;
  sourceSection?: string;
  context?: string;
  visualHighlight?: string;
  shortCaption?: string;
  messageIfMissing?: string;
};

export type PodcastIntroStructuredContent = {
  title: string;
  openingHook: string;
  introScript: string;
  callToAction: string;
};

export type ContentVariantStructuredContent =
  | PublicationStructuredContent
  | CarouselStructuredContent
  | ReelStructuredContent
  | StoriesStructuredContent
  | TeaserStructuredContent
  | ShortArticleStructuredContent
  | QuoteVisualStructuredContent
  | PodcastIntroStructuredContent;

export type ContentVariantGenerationMetadata = {
  provider: string;
  model: string;
  generatedAt: string;
  generationDurationMs: number;
  promptVersion: string;
  variationTemplateVersion: string;
  sourceDocumentVersionId: string;
  sourceDocumentUpdatedAt: string;
  usedContextItemIds: string[];
};

export type ContentVariant = {
  id: string;
  sourceDocumentId: string;
  sourceDocumentType: ContentDocumentType;
  sourceDocumentVersionId: string;
  sourceDocumentUpdatedAt: string;
  subjectId?: string;
  workspaceId?: string;
  type: ContentVariantType;
  format: string;
  platform: ContentVariantPlatform;
  objective: ContentVariantObjective;
  tone: ContentVariantTone;
  audience: string;
  title: string;
  content: string;
  structuredContent: ContentVariantStructuredContent;
  status: ContentVariantStatus;
  generationMetadata: ContentVariantGenerationMetadata;
  createdAt: string;
  updatedAt: string;
};

export type ContentVariationResult = {
  id: string;
  type: ContentVariantType;
  title: string;
  summary: string;
  content: string;
  structuredContent: ContentVariantStructuredContent;
  generationMetadata: ContentVariantGenerationMetadata;
};

export type GenerateVariationApiRequest = {
  operation: "variation";
  variation: ContentVariationRequest;
};

export type GenerateVariationApiSuccess = {
  ok: true;
  operation: "variation";
  result: ContentVariationResult;
};

export type GenerateVariationApiError = {
  ok: false;
  operation: "variation";
  code: string;
  message: string;
};

export type GenerateVariationApiResponse =
  | GenerateVariationApiSuccess
  | GenerateVariationApiError;
