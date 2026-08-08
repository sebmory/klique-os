import type { CreationPreparationPayload } from "@/services/content-creation-assistant";
import type { ContextItem, ContextUsage } from "@/types/context-intelligence";
import type {
  ContentVariationRequest,
  ContentVariationResult,
} from "@/types/content-variant";

export type ContentGenerationErrorCode =
  | "INVALID_REQUEST"
  | "MISSING_SUBJECT"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_NOT_AVAILABLE"
  | "GENERATION_FAILED"
  | "INVALID_VARIATION_REQUEST"
  | "SOURCE_DOCUMENT_MISSING"
  | "VARIATION_TEMPLATE_NOT_FOUND"
  | "INVALID_VARIATION_RESPONSE"
  | "VARIATION_GENERATION_FAILED"
  | "QUOTE_NOT_FOUND"
  | "INVALID_PROVIDER_RESPONSE"
  | "PROVIDER_REFUSAL"
  | "EMPTY_PROVIDER_RESPONSE"
  | "INCOMPLETE_PROVIDER_RESPONSE"
  | "RATE_LIMITED";

export type ContentLanguage = "fr" | "fr-CH";

export type ContentSubjectSource = "crm" | "temporary";

export type ContentTemplateFamily =
  | "interview"
  | "publication"
  | "reel"
  | "story"
  | "podcast"
  | "article";

export type ContentTemplateKey =
  | "interview:v1"
  | "publication:v1"
  | "reel:v1"
  | "story:v1"
  | "podcast:v1"
  | "article:v1";

export type InterviewTypeId =
  | "portrait"
  | "before_match"
  | "after_match"
  | "fast_questions"
  | "journey"
  | "performance"
  | "mental"
  | "injury_return"
  | "new_club"
  | "free";

export type InterviewToneId =
  | "institutional"
  | "journalistic"
  | "authentic"
  | "inspiring"
  | "dynamic"
  | "casual"
  | "free";

export type InterviewFormatId = "written" | "video" | "podcast" | "social";

export type InterviewAudienceId =
  | "supporters"
  | "journalists"
  | "sponsors"
  | "general"
  | "youth"
  | "professionals"
  | "free";

export type PublicationObjectiveId =
  | "announce"
  | "inform"
  | "narrate"
  | "highlight"
  | "engage"
  | "inspire"
  | "promote"
  | "congratulate"
  | "thank"
  | "introduce"
  | "build_expectation"
  | "free";

export type PublicationPlatformId =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "x"
  | "threads"
  | "site_blog"
  | "newsletter"
  | "other";

export type PublicationLengthId = "short" | "medium" | "long" | "free";

export type ReelDurationId = "15s" | "30s" | "45s" | "60s" | "90s";

export type ReelFormatId =
  | "face_camera"
  | "voice_over"
  | "dynamic_montage"
  | "short_interview"
  | "storytelling";

export type ReelPlatformId = "instagram" | "tiktok" | "youtube_shorts";

export type ContentConstraints = {
  requiredTopics: string[];
  avoidedTopics: string[];
  questionCount: number;
};

export type ContentContext = {
  subjectId?: string;
  source: ContentSubjectSource;
  subjectType: string;
  displayName: string;
  sport?: string;
  disciplineOrPosition?: string;
  clubOrOrganization?: string;
  biography?: string;
  knownFacts: string[];
  manualContext?: string;
  objective: string;
  audience: string;
  templateKey: ContentTemplateKey;
  contentType: string;
  interviewType?: string;
  format: string;
  tone: string;
  internalFacts: string[];
  externalVerifiedFacts: string[];
  userProvidedContextItems: string[];
  editorialLeads: string[];
  excludedContext: string[];
  constraints: ContentConstraints;
};

export type ContentSubjectContext = ContentContext;

export type InterviewBrief = {
  interviewType: InterviewTypeId;
  objective: string;
  tone: InterviewToneId;
  questionCount: number;
  format: InterviewFormatId;
  audience: InterviewAudienceId;
  requiredTopics: string[];
  avoidedTopics: string[];
  additionalContext: string;
};

export type PublicationBrief = {
  objective: PublicationObjectiveId;
  customObjective?: string;
  selectedAngle: string;
  platform: PublicationPlatformId;
  tone: string;
  length: PublicationLengthId;
  audience: string;
  cta: string;
  hashtags: string[];
  useEmojis: boolean;
  specialInstructions: string;
  includeElements: string[];
  avoidElements: string[];
  additionalContext: string;
};

export type ReelBrief = {
  objective: "reel";
  selectedAngle: string;
  duration: ReelDurationId;
  format: ReelFormatId;
  platform: ReelPlatformId;
  tone: string;
  audience: string;
  additionalContext: string;
};

export type ContentRequestTemplateRef = {
  key: ContentTemplateKey;
  family: ContentTemplateFamily;
  name: string;
  version: string;
};

type ContentGenerationRequestBase = {
  language: ContentLanguage;
  template: ContentRequestTemplateRef;
  context: ContentContext;
  selectedContextItems: ContextItem[];
  contextSelection: {
    researchedAt?: string;
    dateRange?: { preset: "last_7_days" | "last_30_days" | "last_90_days" | "last_12_months" | "custom"; from: string; to: string };
  };
  rulesVersion: string;
  externalContext: null;
};

export type InterviewGenerationRequest = ContentGenerationRequestBase & {
  requestType: "interview";
  brief: InterviewBrief;
};

export type PublicationGenerationRequest = ContentGenerationRequestBase & {
  requestType: "publication";
  brief: PublicationBrief;
};

export type ReelGenerationRequest = ContentGenerationRequestBase & {
  requestType: "reel";
  brief: ReelBrief;
};

export type ContentGenerationRequest = InterviewGenerationRequest;
export type AnyContentGenerationRequest = InterviewGenerationRequest | PublicationGenerationRequest | ReelGenerationRequest;

export type PublicationAngleSuggestion = {
  id: string;
  title: string;
  rationale: string;
};

export type PublicationProposal = {
  id: string;
  hook: string;
  text: string;
  cta: string;
  hashtags: string[];
  visualSuggestion: string;
  editorialNote: string;
};

export type ContentTemplateDefinition = {
  key: ContentTemplateKey;
  family: ContentTemplateFamily;
  name: string;
  version: string;
  description: string;
  buildPrompt: (request: AnyContentGenerationRequest) => string;
};

export type InterviewQuestion = {
  id: string;
  text: string;
  purpose: string;
  followUps: string[];
  optional: boolean;
  topic: string;
};

export type ReelIdea = {
  id: string;
  title: string;
  concept: string;
  suggestedHook: string;
};

export type StoryIdea = {
  id: string;
  title: string;
  concept: string;
  suggestedHook: string;
};

export type PublicationIdea = {
  id: string;
  title: string;
  concept: string;
  suggestedHook: string;
};

export type ContentGenerationMetadata = {
  provider: string;
  model: string;
  templateId: "interview" | "publication" | "reel";
  templateKey: ContentTemplateKey;
  templateVersion: string;
  promptVersion: string;
  generatedAt: string;
  generationDurationMs: number;
  questionCountRequested: number;
  questionCountGenerated: number;
  reliabilityNotes: string[];
  missingInformation: string[];
  externalContextUsed: boolean;
};

export type InterviewGenerationMetadata = ContentGenerationMetadata;

export type InterviewGenerationResult = {
  title: string;
  editorialAngle: string;
  introduction: string;
  questions: InterviewQuestion[];
  conclusion: string;
  reelIdeas: ReelIdea[];
  storyIdeas: StoryIdea[];
  publicationIdeas: PublicationIdea[];
  contextUsage: ContextUsage;
  metadata: ContentGenerationMetadata;
};

export type PublicationGenerationResult = {
  title: string;
  selectedAngle: string;
  proposals: PublicationProposal[];
  qualityWarnings?: string[];
  contextUsage: ContextUsage;
  metadata: ContentGenerationMetadata;
};

export type ReelGenerationResult = {
  title: string;
  selectedAngle: string;
  concepts: ReelConcept[];
  contextUsage: ContextUsage;
  metadata: ContentGenerationMetadata;
};

export type ReelConceptScene = {
  id: string;
  order: number;
  durationSeconds: number;
  role: string;
  shotPlan: string;
  action: string;
  onScreenText: string;
  voiceOver: string;
  bRoll: string;
  transition: string;
  ambianceMusic: string;
  direction?: string;
};

export type ReelConcept = {
  id: string;
  hook: string;
  concept: string;
  scenes: ReelConceptScene[];
  cta: string;
  caption: string;
  hashtags: string[];
  coverIdea: string;
};

export type ContentGenerationResult = InterviewGenerationResult;
export type AnyContentGenerationResult = InterviewGenerationResult | PublicationGenerationResult | ReelGenerationResult;

export type PublicationAngleSuggestionsResult = {
  suggestions: PublicationAngleSuggestion[];
};

export type PublicationRegenerateOneResult = {
  proposal: PublicationProposal;
};

export type GenerateContentApiRequest = {
  operation?: "interview" | "variation" | "publication_angles" | "publication_regenerate_one";
  payload?: CreationPreparationPayload;
  variation?: ContentVariationRequest;
  publication?: {
    request?: PublicationGenerationRequest;
    result?: PublicationGenerationResult;
    proposalId?: string;
  };
};

export type GenerateContentApiSuccess = {
  ok: true;
  request: AnyContentGenerationRequest;
  result: AnyContentGenerationResult;
};

export type GenerateContentApiError = {
  ok: false;
  code: ContentGenerationErrorCode;
  message: string;
};

export type GenerateVariationApiSuccess = {
  ok: true;
  operation: "variation";
  result: ContentVariationResult;
};

export type GeneratePublicationAnglesApiSuccess = {
  ok: true;
  operation: "publication_angles";
  result: PublicationAngleSuggestionsResult;
};

export type GeneratePublicationRegenerateOneApiSuccess = {
  ok: true;
  operation: "publication_regenerate_one";
  result: PublicationRegenerateOneResult;
};

export type GenerateContentApiResponse =
  | GenerateContentApiSuccess
  | GenerateVariationApiSuccess
  | GeneratePublicationAnglesApiSuccess
  | GeneratePublicationRegenerateOneApiSuccess
  | GenerateContentApiError;

export type GenerateInterviewApiRequest = GenerateContentApiRequest;
export type GenerateInterviewApiSuccess = GenerateContentApiSuccess;
export type GenerateInterviewApiError = GenerateContentApiError;
export type GenerateInterviewApiResponse = GenerateContentApiResponse;
