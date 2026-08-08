import type { ContentDocument } from "@/types/content-document";
import type { ContentVariant } from "@/types/content-variant";
import type {
  InterviewGenerationRequest,
  InterviewGenerationResult,
  PublicationGenerationRequest,
  PublicationGenerationResult,
  ReelGenerationRequest,
  ReelGenerationResult,
} from "@/types/content-generation";
import type { CreationPreparationPayload } from "@/services/content-creation-assistant";

type StoredDraftRecordV2 = {
  document: ContentDocument;
  cloudVersion?: number;
};

type StoredInterviewResult = {
  payload: CreationPreparationPayload;
  request: InterviewGenerationRequest | PublicationGenerationRequest | ReelGenerationRequest;
  result: InterviewGenerationResult | PublicationGenerationResult | ReelGenerationResult;
  createdAt: string;
  sessionId?: string;
};

type BackfillMarker = {
  version: 1;
  completedAt?: string;
  drafts?: Record<string, string>;
  variants?: Record<string, string>;
  sessions?: Record<string, string>;
};

type CloudCheckResult =
  | { status: "exists" }
  | { status: "missing" }
  | { status: "unavailable" };

type BackfillResult = {
  draftsCreated: number;
  variantsCreated: number;
  sessionsCreated: number;
  failures: number;
};

const BACKFILL_MARKER_KEY = "klique.contents.backfill.v1";
const DRAFT_STORAGE_KEY_PREFIX = "klique.contents.document-editor.draft.v1";
const DRAFT_STORAGE_KEY_PREFIX_V2 = "klique.contents.document-editor.draft.v2";
const VARIANTS_STORAGE_KEY = "klique.contents.variants.v1";
const RESULT_STORAGE_KEY = "klique.contents.creation-assistant.interview-result.v1";
const SESSION_TTL_HOURS = 24;

let inFlightBackfill: Promise<BackfillResult> | null = null;

const hasWindow = () => typeof window !== "undefined";

const readJson = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (!hasWindow()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const readMarker = (): BackfillMarker => {
  if (!hasWindow()) return { version: 1 };
  const parsed = readJson<BackfillMarker>(window.localStorage.getItem(BACKFILL_MARKER_KEY));
  if (!parsed || parsed.version !== 1) {
    return { version: 1 };
  }
  return {
    version: 1,
    completedAt: parsed.completedAt,
    drafts: parsed.drafts ?? {},
    variants: parsed.variants ?? {},
    sessions: parsed.sessions ?? {},
  };
};

const writeMarker = (marker: BackfillMarker) => {
  if (!hasWindow()) return;
  window.localStorage.setItem(BACKFILL_MARKER_KEY, JSON.stringify(marker));
};

const updateMarker = (scope: "drafts" | "variants" | "sessions", id: string) => {
  const marker = readMarker();
  marker[scope] = {
    ...(marker[scope] ?? {}),
    [id]: new Date().toISOString(),
  };
  marker.completedAt = new Date().toISOString();
  writeMarker(marker);
};

const recordAlreadyBackfilled = (scope: "drafts" | "variants" | "sessions", id: string) => {
  const marker = readMarker();
  return Boolean(marker[scope]?.[id]);
};

const listStorageKeys = (prefix: string): string[] => {
  if (!hasWindow()) return [];
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(`${prefix}:`)) {
      keys.push(key);
    }
  }
  return keys;
};

const parseLocalDrafts = (): Array<{ id: string; document: ContentDocument }> => {
  if (!hasWindow()) return [];

  const items: Array<{ id: string; document: ContentDocument }> = [];
  const seen = new Set<string>();

  for (const key of listStorageKeys(DRAFT_STORAGE_KEY_PREFIX)) {
    const id = key.slice(DRAFT_STORAGE_KEY_PREFIX.length + 1);
    if (!id || seen.has(id)) continue;
    const parsed = readJson<ContentDocument>(window.localStorage.getItem(key));
    if (!parsed?.id) continue;
    seen.add(parsed.id);
    items.push({ id: parsed.id, document: parsed });
  }

  for (const key of listStorageKeys(DRAFT_STORAGE_KEY_PREFIX_V2)) {
    const id = key.slice(DRAFT_STORAGE_KEY_PREFIX_V2.length + 1);
    if (!id || seen.has(id)) continue;
    const parsed = readJson<StoredDraftRecordV2>(window.localStorage.getItem(key));
    if (!parsed?.document?.id) continue;
    seen.add(parsed.document.id);
    items.push({ id: parsed.document.id, document: parsed.document });
  }

  return items;
};

const parseLocalVariants = (): ContentVariant[] => {
  if (!hasWindow()) return [];

  const parsed = readJson<ContentVariant[]>(window.localStorage.getItem(VARIANTS_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];

  const seen = new Map<string, ContentVariant>();
  for (const item of parsed) {
    if (!item?.id) continue;
    seen.set(item.id, item);
  }
  return Array.from(seen.values());
};

const readLocalSession = (): StoredInterviewResult | null => {
  if (!hasWindow() || typeof window.sessionStorage === "undefined") return null;
  const parsed = readJson<StoredInterviewResult>(window.sessionStorage.getItem(RESULT_STORAGE_KEY));
  if (!parsed?.payload || !parsed?.request || !parsed?.result || !parsed?.createdAt) return null;
  return parsed.sessionId ? parsed : { ...parsed, sessionId: `content-session-${parsed.createdAt}` };
};

const checkCloudDocument = async (id: string): Promise<CloudCheckResult> => {
  try {
    const response = await fetch(`/api/contents/storage/drafts/${encodeURIComponent(id)}`);
    if (response.ok) return { status: "exists" };
    if (response.status === 404 || response.status === 410) return { status: "missing" };
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
};

const createCloudDocument = async (document: ContentDocument): Promise<boolean> => {
  try {
    const response = await fetch("/api/contents/storage/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const checkCloudVariant = async (id: string): Promise<CloudCheckResult> => {
  try {
    const response = await fetch(`/api/contents/storage/variants/${encodeURIComponent(id)}`);
    if (response.ok) return { status: "exists" };
    if (response.status === 404 || response.status === 410) return { status: "missing" };
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
};

const createCloudVariant = async (variant: ContentVariant): Promise<boolean> => {
  try {
    const response = await fetch("/api/contents/storage/variants", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variant }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const checkCloudSession = async (sessionId: string): Promise<CloudCheckResult> => {
  try {
    const response = await fetch(`/api/contents/storage/sessions/${encodeURIComponent(sessionId)}`);
    if (response.ok) return { status: "exists" };
    if (response.status === 404 || response.status === 410) return { status: "missing" };
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
};

const createCloudSession = async (session: StoredInterviewResult, sessionId: string): Promise<boolean> => {
  try {
    const response = await fetch("/api/contents/storage/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        session,
        expiresAt: new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString(),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const backfillDrafts = async (): Promise<{ created: number; failures: number }> => {
  let created = 0;
  let failures = 0;
  for (const entry of parseLocalDrafts()) {
    if (recordAlreadyBackfilled("drafts", entry.id)) continue;

    const cloud = await checkCloudDocument(entry.id);
    if (cloud.status === "exists") {
      updateMarker("drafts", entry.id);
      continue;
    }

    if (cloud.status === "missing") {
      const ok = await createCloudDocument(entry.document);
      if (ok) {
        created += 1;
        updateMarker("drafts", entry.id);
      } else {
        failures += 1;
        console.warn("[content-backfill] draft backfill failed", entry.id);
      }
      continue;
    }

    failures += 1;
    console.warn("[content-backfill] draft cloud unavailable", entry.id);
  }
  return { created, failures };
};

const backfillVariants = async (): Promise<{ created: number; failures: number }> => {
  let created = 0;
  let failures = 0;
  const localVariants = parseLocalVariants();

  for (const variant of localVariants) {
    if (recordAlreadyBackfilled("variants", variant.id)) continue;

    const cloud = await checkCloudVariant(variant.id);
    if (cloud.status === "exists") {
      updateMarker("variants", variant.id);
      continue;
    }

    if (cloud.status === "missing") {
      const ok = await createCloudVariant(variant);
      if (ok) {
        created += 1;
        updateMarker("variants", variant.id);
      } else {
        failures += 1;
        console.warn("[content-backfill] variant backfill failed", variant.id);
      }
      continue;
    }

    failures += 1;
    console.warn("[content-backfill] variant cloud unavailable", variant.id);
  }

  return { created, failures };
};

const backfillSession = async (): Promise<{ created: number; failures: number }> => {
  let created = 0;
  let failures = 0;
  const localSession = readLocalSession();

  if (!localSession) return { created, failures };

  const sessionId = localSession.sessionId || `content-session-${localSession.createdAt}`;
  if (recordAlreadyBackfilled("sessions", sessionId)) return { created, failures };

  const cloud = await checkCloudSession(sessionId);
  if (cloud.status === "exists") {
    updateMarker("sessions", sessionId);
    return { created, failures };
  }

  if (cloud.status === "missing") {
    const ok = await createCloudSession(localSession, sessionId);
    if (ok) {
      created += 1;
      updateMarker("sessions", sessionId);
    } else {
      failures += 1;
      console.warn("[content-backfill] session backfill failed", sessionId);
    }
    return { created, failures };
  }

  failures += 1;
  console.warn("[content-backfill] session cloud unavailable", sessionId);
  return { created, failures };
};

export const runContentsBackfill = async (): Promise<BackfillResult> => {
  if (!hasWindow()) {
    return { draftsCreated: 0, variantsCreated: 0, sessionsCreated: 0, failures: 0 };
  }

  if (!inFlightBackfill) {
    inFlightBackfill = (async () => {
      const [drafts, variants, sessions] = await Promise.all([backfillDrafts(), backfillVariants(), backfillSession()]);
      return {
        draftsCreated: drafts.created,
        variantsCreated: variants.created,
        sessionsCreated: sessions.created,
        failures: drafts.failures + variants.failures + sessions.failures,
      };
    })().catch((error: unknown) => {
      console.warn("[content-backfill] unexpected failure", error);
      return { draftsCreated: 0, variantsCreated: 0, sessionsCreated: 0, failures: 1 };
    }).finally(() => {
      inFlightBackfill = null;
    });
  }

  return inFlightBackfill;
};