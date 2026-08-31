import { ContentDocumentDraftService } from "@/services/content-documents/draft-service";
import type { CreationPreparationPayload } from "@/services/content-creation-assistant";
import type {
  ArticleFinalResult,
  ArticleGenerationRequest,
  ArticleStructureSuggestion,
  InterviewGenerationRequest,
  InterviewGenerationResult,
  PublicationGenerationRequest,
  PublicationGenerationResult,
  ReelGenerationRequest,
  ReelGenerationResult,
  StoryGenerationRequest,
  StoryGenerationResult,
} from "@/types/content-generation";
import type { ContentDocument } from "@/types/content-document";

export type StoredInterviewResult = {
  payload: CreationPreparationPayload;
  request: InterviewGenerationRequest | PublicationGenerationRequest | ReelGenerationRequest | StoryGenerationRequest;
  result: InterviewGenerationResult | PublicationGenerationResult | ReelGenerationResult | StoryGenerationResult;
  createdAt: string;
  sessionId?: string;
};

export type StoredArticleGenerationMetadata = {
  provider: "openai";
  model: string;
  generatedAt: string;
  generationDurationMs: number;
};

export type StoredArticleResult = {
  request: ArticleGenerationRequest;
  result: ArticleFinalResult;
  selectedAngle: { id: string; title: string };
  selectedStructure: ArticleStructureSuggestion;
  generationMetadata: StoredArticleGenerationMetadata;
  createdAt: string;
  sessionId?: string;
};

export type StoredContentResult = StoredInterviewResult | StoredArticleResult;

export type StoredArticlePreviewResult = {
  request: ArticleGenerationRequest;
  result: ArticleFinalResult;
  createdAt: string;
  sessionId?: string;
};

type StoredSessionRecord = StoredInterviewResult & {
  sessionId: string;
};

type StoredArticleSessionRecord = StoredArticleResult & {
  sessionId: string;
};

export type RestoredArticleResultSession = StoredArticleResult & {
  sessionId: string;
};

type CloudSessionResponse = {
  ok?: boolean;
  sessionId?: string;
  expiresAt?: string;
  session?: StoredInterviewResult;
  message?: string;
};

type RestoreResult =
  | { source: "cloud"; result: StoredSessionRecord }
  | { source: "sessionStorage"; result: StoredSessionRecord }
  | { source: "draft"; document: ContentDocument }
  | { source: "missing" };

const RESULT_STORAGE_KEY = "klique.contents.creation-assistant.interview-result.v1";
const ARTICLE_RESULT_STORAGE_KEY = "klique.contents.creation-assistant.article-result.v1";
const DEFAULT_SESSION_TTL_HOURS = 24;

const hasWindow = () => typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const parseJsonResponse = async (response: Response): Promise<CloudSessionResponse> => {
  try {
    return (await response.json()) as CloudSessionResponse;
  } catch {
    return {};
  }
};

const readStoredSession = (): StoredSessionRecord | null => {
  if (!hasWindow()) return null;

  const raw = window.sessionStorage.getItem(RESULT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredSessionRecord;
    if (!parsed?.payload || !parsed?.request || !parsed?.result || !parsed?.createdAt) {
      return null;
    }
    return {
      ...parsed,
      sessionId: parsed.sessionId || createResultSessionId(),
    };
  } catch {
    return null;
  }
};

const writeStoredSession = (record: StoredSessionRecord) => {
  if (!hasWindow()) return;

  window.sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(record));
};

const writeStoredArticleSession = (record: StoredArticleSessionRecord) => {
  if (!hasWindow()) return;

  window.sessionStorage.setItem(ARTICLE_RESULT_STORAGE_KEY, JSON.stringify(record));
};

const isStoredArticleResult = (value: unknown): value is StoredArticleResult => {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<StoredArticleResult>;
  return session.request?.requestType === "article" &&
    Boolean(session.result?.title) &&
    Array.isArray(session.result?.sections) &&
    Boolean(session.selectedAngle?.id) &&
    Boolean(session.selectedAngle?.title) &&
    Boolean(session.selectedStructure?.id) &&
    session.generationMetadata?.provider === "openai" &&
    Boolean(session.generationMetadata?.model) &&
    Boolean(session.generationMetadata?.generatedAt) &&
    typeof session.generationMetadata?.generationDurationMs === "number" &&
    Boolean(session.createdAt);
};

const isStoredArticlePreviewResult = (value: unknown): value is StoredArticlePreviewResult => {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<StoredArticlePreviewResult>;
  return session.request?.requestType === "article" &&
    Boolean(session.result?.title) &&
    Array.isArray(session.result?.sections) &&
    Boolean(session.createdAt);
};

const readStoredArticleSession = (sessionId: string): RestoredArticleResultSession | null => {
  if (!hasWindow()) return null;
  const raw = window.sessionStorage.getItem(ARTICLE_RESULT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredArticleResult;
    return isStoredArticleResult(parsed) && parsed.sessionId === sessionId ? { ...parsed, sessionId } : null;
  } catch {
    return null;
  }
};

const readLegacyArticlePreviewSession = (): StoredArticlePreviewResult | null => {
  if (!hasWindow()) return null;
  const raw = window.sessionStorage.getItem(ARTICLE_RESULT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredArticlePreviewResult;
    return isStoredArticlePreviewResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const createResultSessionId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `content-session-${crypto.randomUUID()}`;
  }

  return `content-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const buildResultUrl = (sessionId: string, documentId: string): string => {
  const params = new URLSearchParams();
  params.set("sessionId", sessionId);
  if (documentId.trim()) {
    params.set("documentId", documentId.trim());
  }
  return `/contents/create/result?${params.toString()}`;
};

export const saveInterviewResultSession = async (record: StoredInterviewResult): Promise<StoredSessionRecord> => {
  const sessionId = record.sessionId || createResultSessionId();
  const storedRecord: StoredSessionRecord = { ...record, sessionId };
  writeStoredSession(storedRecord);

  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  try {
    const response = await fetch("/api/contents/storage/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        session: record,
        expiresAt,
      }),
    });

    if (!response.ok) {
      return storedRecord;
    }

    const payload = await parseJsonResponse(response);
    if (payload.sessionId && payload.sessionId !== sessionId) {
      return storedRecord;
    }

    return storedRecord;
  } catch {
    return storedRecord;
  }
};

const readCloudSession = async (sessionId: string): Promise<StoredSessionRecord | null> => {
  const response = await fetch(`/api/contents/storage/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      return null;
    }
    return null;
  }

  const payload = await parseJsonResponse(response);
  if (!payload.session) return null;

  return {
    ...payload.session,
    sessionId: payload.sessionId || sessionId,
  };
};

const readStoredSessionFromWindow = (): StoredSessionRecord | null => readStoredSession();

export const restoreInterviewResultSession = async (sessionId: string, documentId: string): Promise<RestoreResult> => {
  const normalizedSessionId = sessionId.trim();
  const normalizedDocumentId = documentId.trim();

  if (normalizedSessionId) {
    try {
      const cloud = await readCloudSession(normalizedSessionId);
      if (cloud) {
        writeStoredSession(cloud);
        return { source: "cloud", result: cloud };
      }
    } catch {
      // Fall through to local storage and draft fallback.
    }
  }

  const local = readStoredSessionFromWindow();
  if (local) {
    return { source: "sessionStorage", result: local };
  }

  if (normalizedDocumentId) {
    const draft = await ContentDocumentDraftService.loadDraft(normalizedDocumentId);
    if (draft) {
      return { source: "draft", document: draft };
    }
  }

  return { source: "missing" };
};

export const saveArticleResultSession = async (record: StoredArticleResult): Promise<StoredArticleSessionRecord> => {
  const sessionId = record.sessionId || createResultSessionId();
  const storedRecord: StoredArticleSessionRecord = { ...record, sessionId };
  writeStoredArticleSession(storedRecord);

  const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  try {
    const response = await fetch("/api/contents/storage/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, session: record, expiresAt }),
    });
    if (!response.ok) return storedRecord;

    const payload = (await response.json().catch(() => null)) as { sessionId?: string } | null;
    return payload?.sessionId && payload.sessionId !== sessionId ? storedRecord : storedRecord;
  } catch {
    return storedRecord;
  }
};

export const restoreArticleResultSession = async (sessionId: string): Promise<RestoredArticleResultSession | null> => {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) return null;

  try {
    const response = await fetch(`/api/contents/storage/sessions/${encodeURIComponent(normalizedSessionId)}`);
    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as { sessionId?: string; session?: unknown } | null;
      if (payload?.sessionId === normalizedSessionId && isStoredArticleResult(payload.session)) {
        const restored = { ...payload.session, sessionId: normalizedSessionId };
        writeStoredArticleSession(restored);
        return restored;
      }
    }
  } catch {
    // Fall through to the matching local Article session.
  }

  return readStoredArticleSession(normalizedSessionId);
};

export const restoreLegacyArticlePreviewSession = (): StoredArticlePreviewResult | null => readLegacyArticlePreviewSession();