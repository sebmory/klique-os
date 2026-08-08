import { ContentDocumentDraftService } from "@/services/content-documents/draft-service";
import type { CreationPreparationPayload } from "@/services/content-creation-assistant";
import type {
  InterviewGenerationRequest,
  InterviewGenerationResult,
  PublicationGenerationRequest,
  PublicationGenerationResult,
  ReelGenerationRequest,
  ReelGenerationResult,
} from "@/types/content-generation";
import type { ContentDocument } from "@/types/content-document";

export type StoredInterviewResult = {
  payload: CreationPreparationPayload;
  request: InterviewGenerationRequest | PublicationGenerationRequest | ReelGenerationRequest;
  result: InterviewGenerationResult | PublicationGenerationResult | ReelGenerationResult;
  createdAt: string;
  sessionId?: string;
};

type StoredSessionRecord = StoredInterviewResult & {
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