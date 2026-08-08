import type { ContentDocument } from "@/types/content-document";
import type { ContentVariant } from "@/types/content-variant";
import type {
  ContentGenerationRequest,
  InterviewGenerationRequest,
  InterviewGenerationResult,
  PublicationGenerationRequest,
  PublicationGenerationResult,
  ReelGenerationRequest,
  ReelGenerationResult,
} from "@/types/content-generation";
import type { CreationPreparationPayload } from "@/services/content-creation-assistant";

export type StoredInterviewResult = {
  payload: CreationPreparationPayload;
  request: InterviewGenerationRequest | PublicationGenerationRequest | ReelGenerationRequest;
  result: InterviewGenerationResult | PublicationGenerationResult | ReelGenerationResult;
  createdAt: string;
};

export class ContentStorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentStorageValidationError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const requireObject = (value: unknown, fieldName: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new ContentStorageValidationError(`${fieldName} doit etre un objet.`);
  }
  return value;
};

const requireString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new ContentStorageValidationError(`${fieldName} doit etre une chaine non vide.`);
  }
  return value.trim();
};

const requireOptionalString = (value: unknown, fieldName: string): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new ContentStorageValidationError(`${fieldName} doit etre une chaine ou null.`);
  }
  return value.trim();
};

const requireBoolean = (value: unknown, fieldName: string): boolean => {
  if (typeof value !== "boolean") {
    throw new ContentStorageValidationError(`${fieldName} doit etre un booleen.`);
  }
  return value;
};

const requireNumber = (value: unknown, fieldName: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ContentStorageValidationError(`${fieldName} doit etre un nombre.`);
  }
  return value;
};

const requireStringArray = (value: unknown, fieldName: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ContentStorageValidationError(`${fieldName} doit etre un tableau de chaines.`);
  }
  return value.map((item) => item.trim());
};

const validateDateString = (value: unknown, fieldName: string): string => {
  const text = requireString(value, fieldName);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new ContentStorageValidationError(`${fieldName} doit etre une date ISO valide.`);
  }
  return text;
};

const assertAllowed = <T extends string>(value: unknown, fieldName: string, allowed: readonly T[]): T => {
  const text = requireString(value, fieldName) as T;
  if (!allowed.includes(text)) {
    throw new ContentStorageValidationError(`${fieldName} contient une valeur non supportee.`);
  }
  return text;
};

const validateDocumentSidebar = (value: unknown): void => {
  const sidebar = requireObject(value, "sidebar");
  requireString(sidebar.subject, "sidebar.subject");
  assertAllowed(sidebar.source, "sidebar.source", ["crm", "temporary"] as const);
  requireString(sidebar.objective, "sidebar.objective");
  if (sidebar.interviewType !== undefined && sidebar.interviewType !== null) requireString(sidebar.interviewType, "sidebar.interviewType");
  if (sidebar.platform !== undefined && sidebar.platform !== null) requireString(sidebar.platform, "sidebar.platform");
  if (sidebar.length !== undefined && sidebar.length !== null) requireString(sidebar.length, "sidebar.length");
  requireString(sidebar.tone, "sidebar.tone");
  requireString(sidebar.audience, "sidebar.audience");
  requireString(sidebar.format, "sidebar.format");
  if (sidebar.questionCount !== undefined && sidebar.questionCount !== null) requireNumber(sidebar.questionCount, "sidebar.questionCount");
  requireString(sidebar.templateVersion, "sidebar.templateVersion");
  requireString(sidebar.provider, "sidebar.provider");
  requireString(sidebar.model, "sidebar.model");
  validateDateString(sidebar.generatedAt, "sidebar.generatedAt");
};

const validateMetadata = (value: unknown): void => {
  const metadata = requireObject(value, "metadata");
  requireString(metadata.provider, "metadata.provider");
  requireString(metadata.model, "metadata.model");
  requireString(metadata.templateId, "metadata.templateId");
  requireString(metadata.templateKey, "metadata.templateKey");
  requireString(metadata.templateVersion, "metadata.templateVersion");
  requireString(metadata.promptVersion, "metadata.promptVersion");
  validateDateString(metadata.generatedAt, "metadata.generatedAt");
  requireNumber(metadata.generationDurationMs, "metadata.generationDurationMs");
  requireNumber(metadata.questionCountRequested, "metadata.questionCountRequested");
  requireNumber(metadata.questionCountGenerated, "metadata.questionCountGenerated");
  requireStringArray(metadata.reliabilityNotes ?? [], "metadata.reliabilityNotes");
  requireStringArray(metadata.missingInformation ?? [], "metadata.missingInformation");
  if (typeof metadata.externalContextUsed !== "boolean") {
    throw new ContentStorageValidationError("metadata.externalContextUsed doit etre un booleen.");
  }
};

const validateContextUsage = (value: unknown): void => {
  const contextUsage = requireObject(value, "contextUsage");
  if (typeof contextUsage !== "object") {
    throw new ContentStorageValidationError("contextUsage doit etre un objet.");
  }
};

const validateInterviewSections = (value: unknown): void => {
  const sections = requireObject(value, "sections");
  requireString(sections.title, "sections.title");
  requireString(sections.editorialAngle, "sections.editorialAngle");
  requireString(sections.introduction, "sections.introduction");
  if (!Array.isArray(sections.questions)) {
    throw new ContentStorageValidationError("sections.questions doit etre un tableau.");
  }
  sections.questions.forEach((question, index) => {
    const item = requireObject(question, `sections.questions[${index}]`);
    requireString(item.id, `sections.questions[${index}].id`);
    requireString(item.text, `sections.questions[${index}].text`);
    requireString(item.purpose, `sections.questions[${index}].purpose`);
    requireString(item.topic, `sections.questions[${index}].topic`);
    requireStringArray(item.followUps, `sections.questions[${index}].followUps`);
    requireBoolean(item.locked, `sections.questions[${index}].locked`);
    requireString(item.privateNotes, `sections.questions[${index}].privateNotes`);
  });
  requireString(sections.conclusion, "sections.conclusion");
};

const validatePublicationSections = (value: unknown): void => {
  const sections = requireObject(value, "sections");
  requireString(sections.title, "sections.title");
  requireString(sections.editorialAngle, "sections.editorialAngle");
  requireString(sections.hook, "sections.hook");
  requireString(sections.text, "sections.text");
  requireString(sections.cta, "sections.cta");
  requireStringArray(sections.hashtags, "sections.hashtags");
  requireString(sections.visualSuggestion, "sections.visualSuggestion");
  requireString(sections.editorialNote, "sections.editorialNote");
};

const validateReelSections = (value: unknown): void => {
  const sections = requireObject(value, "sections");
  requireString(sections.title, "sections.title");
  requireString(sections.editorialAngle, "sections.editorialAngle");
  requireString(sections.hook, "sections.hook");
  requireString(sections.concept, "sections.concept");
  if (!Array.isArray(sections.scenes)) {
    throw new ContentStorageValidationError("sections.scenes doit etre un tableau.");
  }
  sections.scenes.forEach((scene, index) => {
    const item = requireObject(scene, `sections.scenes[${index}]`);
    requireString(item.id, `sections.scenes[${index}].id`);
    requireNumber(item.order, `sections.scenes[${index}].order`);
    requireNumber(item.durationSeconds, `sections.scenes[${index}].durationSeconds`);
    requireString(item.role, `sections.scenes[${index}].role`);
    requireString(item.shotPlan, `sections.scenes[${index}].shotPlan`);
    requireString(item.action, `sections.scenes[${index}].action`);
    requireString(item.onScreenText, `sections.scenes[${index}].onScreenText`);
    requireString(item.voiceOver, `sections.scenes[${index}].voiceOver`);
    requireString(item.bRoll, `sections.scenes[${index}].bRoll`);
    requireString(item.transition, `sections.scenes[${index}].transition`);
    requireString(item.ambianceMusic, `sections.scenes[${index}].ambianceMusic`);
    if (item.direction !== undefined && item.direction !== null) requireString(item.direction, `sections.scenes[${index}].direction`);
  });
  requireString(sections.cta, "sections.cta");
  requireString(sections.caption, "sections.caption");
  requireStringArray(sections.hashtags, "sections.hashtags");
  requireString(sections.coverIdea, "sections.coverIdea");
};

const validateContentDocumentType = (value: unknown): ContentDocument["type"] => {
  return assertAllowed(value, "type", ["interview", "publication", "reel"] as const);
};

const validateContentDocument = (value: unknown): ContentDocument => {
  const document = requireObject(value, "document");
  requireString(document.id, "id");
  const type = validateContentDocumentType(document.type);
  assertAllowed(document.status, "status", ["draft", "in_progress", "final", "archived"] as const);
  validateDateString(document.createdAt, "createdAt");
  validateDateString(document.updatedAt, "updatedAt");
  if (!Array.isArray(document.versions)) {
    throw new ContentStorageValidationError("versions doit etre un tableau.");
  }
  document.versions.forEach((version, index) => {
    const item = requireObject(version, `versions[${index}]`);
    requireString(item.id, `versions[${index}].id`);
    validateDateString(item.createdAt, `versions[${index}].createdAt`);
    requireString(item.label, `versions[${index}].label`);
    assertAllowed(item.source, `versions[${index}].source`, ["generation", "manual"] as const);
  });
  requireString(document.activeVersionId, "activeVersionId");
  validateDocumentSidebar(document.sidebar);
  validateMetadata(document.metadata);
  validateContextUsage(document.contextUsage);

  if (type === "interview") {
    validateInterviewSections(document.sections);
  } else if (type === "publication") {
    validatePublicationSections(document.sections);
  } else {
    validateReelSections(document.sections);
  }

  return document as ContentDocument;
};

const validateContentVariant = (value: unknown): ContentVariant => {
  const variant = requireObject(value, "variant");
  requireString(variant.id, "id");
  requireString(variant.sourceDocumentId, "sourceDocumentId");
  requireString(variant.sourceDocumentType, "sourceDocumentType");
  requireString(variant.sourceDocumentVersionId, "sourceDocumentVersionId");
  validateDateString(variant.sourceDocumentUpdatedAt, "sourceDocumentUpdatedAt");
  if (variant.subjectId !== undefined && variant.subjectId !== null) requireString(variant.subjectId, "subjectId");
  if (variant.workspaceId !== undefined && variant.workspaceId !== null) requireString(variant.workspaceId, "workspaceId");
  requireString(variant.type, "type");
  requireString(variant.format, "format");
  requireString(variant.platform, "platform");
  requireString(variant.objective, "objective");
  requireString(variant.tone, "tone");
  requireString(variant.audience, "audience");
  requireString(variant.title, "title");
  requireString(variant.content, "content");
  requireObject(variant.structuredContent, "structuredContent");
  assertAllowed(variant.status, "status", ["draft", "ready", "approved", "planned", "published", "archived"] as const);
  const metadata = requireObject(variant.generationMetadata, "generationMetadata");
  requireString(metadata.provider, "generationMetadata.provider");
  requireString(metadata.model, "generationMetadata.model");
  validateDateString(metadata.generatedAt, "generationMetadata.generatedAt");
  requireNumber(metadata.generationDurationMs, "generationMetadata.generationDurationMs");
  requireString(metadata.promptVersion, "generationMetadata.promptVersion");
  requireString(metadata.variationTemplateVersion, "generationMetadata.variationTemplateVersion");
  requireString(metadata.sourceDocumentVersionId, "generationMetadata.sourceDocumentVersionId");
  validateDateString(metadata.sourceDocumentUpdatedAt, "generationMetadata.sourceDocumentUpdatedAt");
  requireStringArray(metadata.usedContextItemIds, "generationMetadata.usedContextItemIds");
  validateDateString(variant.createdAt, "createdAt");
  validateDateString(variant.updatedAt, "updatedAt");
  return variant as ContentVariant;
};

const validateStoredInterviewResult = (value: unknown): StoredInterviewResult => {
  const session = requireObject(value, "session");
  requireObject(session.payload, "payload");
  requireObject(session.request, "request");
  requireObject(session.result, "result");
  validateDateString(session.createdAt, "createdAt");
  return session as StoredInterviewResult;
};

const validateContentDocumentWriteBody = (value: unknown): ContentDocument => {
  const body = requireObject(value, "body");
  return validateContentDocument(body.document);
};

const validateContentDocumentUpdateBody = (value: unknown): { document: ContentDocument; expectedVersion: number } => {
  const body = requireObject(value, "body");
  const document = validateContentDocument(body.document);
  const expectedVersion = requireNumber(body.expectedVersion, "expectedVersion");
  if (expectedVersion < 1) {
    throw new ContentStorageValidationError("expectedVersion doit etre superieur ou egal a 1.");
  }
  return { document, expectedVersion };
};

const validateStoredInterviewResultWriteBody = (value: unknown): { sessionId: string; session: StoredInterviewResult; expiresAt: string } => {
  const body = requireObject(value, "body");
  const sessionId = requireString(body.sessionId, "sessionId");
  const session = validateStoredInterviewResult(body.session);
  const expiresAt = validateDateString(body.expiresAt, "expiresAt");
  return { sessionId, session, expiresAt };
};

const validateContentVariantWriteBody = (value: unknown): ContentVariant => {
  const body = requireObject(value, "body");
  return validateContentVariant(body.variant);
};

export {
  validateContentDocument,
  validateContentDocumentWriteBody,
  validateContentDocumentUpdateBody,
  validateStoredInterviewResult,
  validateStoredInterviewResultWriteBody,
  validateContentVariant,
  validateContentVariantWriteBody,
};
