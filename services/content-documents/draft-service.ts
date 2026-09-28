import type { ContentDocument } from "@/types/content-document";
import { canUseLocalContentStorage } from "@/services/content-storage-access";

const STORAGE_KEY_PREFIX = "klique.contents.document-editor.draft.v2";

export type ContentDocumentDraftCloudStatus = "created" | "updated" | "conflict" | "unavailable";

export type ContentDocumentDraftSaveResult = {
  document: ContentDocument;
  local: {
    status: "saved" | "skipped";
    storageKey: string;
  };
  cloud: {
    status: ContentDocumentDraftCloudStatus;
    version?: number;
    storageUpdatedAt?: string;
    currentVersion?: number;
    message?: string;
  };
};

type StoredDraftRecord = {
  document: ContentDocument;
  cloudVersion?: number;
  cloudStorageUpdatedAt?: string;
  syncedAt?: string;
  lastCloudStatus?: ContentDocumentDraftCloudStatus;
  lastCloudMessage?: string;
};

type CloudDraftResponse = {
  ok?: boolean;
  version?: number;
  storageUpdatedAt?: string;
  document?: ContentDocument;
  currentVersion?: number;
  currentDocument?: ContentDocument;
  message?: string;
};

type CloudFetchResult =
  | { status: "ok"; document: ContentDocument; version: number; storageUpdatedAt: string }
  | { status: "missing" }
  | { status: "error"; message: string; code: number };

const hasWindow = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const getStorageKey = (documentId: string) => `${STORAGE_KEY_PREFIX}:${documentId}`;

const normalizeDocumentId = (documentId: string) => documentId.trim();

const readStoredDraft = (documentId: string): StoredDraftRecord | null => {
  if (!hasWindow()) return null;

  const raw = window.localStorage.getItem(getStorageKey(documentId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredDraftRecord;
    if (!parsed?.document || typeof parsed.document !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredDraft = (document: ContentDocument, cloudVersion?: number, cloudStatus?: ContentDocumentDraftCloudStatus, cloudMessage?: string, cloudStorageUpdatedAt?: string) => {
  if (!hasWindow()) return;

  const record: StoredDraftRecord = {
    document,
    cloudVersion,
    cloudStorageUpdatedAt,
    syncedAt: new Date().toISOString(),
    lastCloudStatus: cloudStatus,
    lastCloudMessage: cloudMessage,
  };

  window.localStorage.setItem(getStorageKey(document.id), JSON.stringify(record));
};

export type ContentDocumentDraftLoadResult = {
  document: ContentDocument;
  version?: number;
  storageUpdatedAt?: string;
};

const parseCloudDraftResponse = async (response: Response): Promise<CloudDraftResponse> => {
  try {
    return (await response.json()) as CloudDraftResponse;
  } catch {
    return {};
  }
};

const fetchCloudDraft = async (documentId: string): Promise<CloudFetchResult> => {
  const response = await fetch(`/api/contents/storage/drafts/${encodeURIComponent(documentId)}`, {
    credentials: "include",
  });
  if (response.ok) {
    const payload = await parseCloudDraftResponse(response);
    if (!payload.document || typeof payload.version !== "number" || typeof payload.storageUpdatedAt !== "string") {
      throw new Error("Format inattendu pour le brouillon cloud.");
    }

    return { status: "ok" as const, document: payload.document, version: payload.version, storageUpdatedAt: payload.storageUpdatedAt };
  }

  if (response.status === 404) {
    return { status: "missing" as const };
  }

  const payload = await parseCloudDraftResponse(response);
  return {
    status: "error" as const,
    message: payload.message || "Synchronisation cloud indisponible.",
    code: response.status,
  };
};

const createCloudDraft = async (document: ContentDocument) => {
  const response = await fetch("/api/contents/storage/drafts", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ document }),
  });

  const payload = await parseCloudDraftResponse(response);
  if (response.ok) {
    if (!payload.document || typeof payload.version !== "number" || typeof payload.storageUpdatedAt !== "string") {
      throw new Error("Format inattendu pour la creation du brouillon cloud.");
    }

    return { status: "created" as const, version: payload.version, storageUpdatedAt: payload.storageUpdatedAt, document: payload.document };
  }

  if (response.status === 409) {
    return {
      status: "conflict" as const,
      currentVersion: payload.currentVersion,
      document: payload.currentDocument,
      message: payload.message || "Conflit de version du brouillon.",
    };
  }

  return {
    status: "unavailable" as const,
    message: payload.message || "Synchronisation cloud indisponible.",
  };
};

const updateCloudDraft = async (document: ContentDocument, expectedVersion: number) => {
  const response = await fetch(`/api/contents/storage/drafts/${encodeURIComponent(document.id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ document, expectedVersion }),
  });

  const payload = await parseCloudDraftResponse(response);
  if (response.ok) {
    if (!payload.document || typeof payload.version !== "number" || typeof payload.storageUpdatedAt !== "string") {
      throw new Error("Format inattendu pour la mise a jour du brouillon cloud.");
    }

    return { status: "updated" as const, version: payload.version, storageUpdatedAt: payload.storageUpdatedAt, document: payload.document };
  }

  if (response.status === 409) {
    return {
      status: "conflict" as const,
      currentVersion: payload.currentVersion,
      document: payload.currentDocument,
      message: payload.message || "Conflit de version du brouillon.",
    };
  }

  if (response.status === 404) {
    return {
      status: "unavailable" as const,
      message: payload.message || "Brouillon cloud introuvable.",
    };
  }

  return {
    status: "unavailable" as const,
    message: payload.message || "Synchronisation cloud indisponible.",
  };
};

const loadDraftRecord = async (documentId: string): Promise<ContentDocumentDraftLoadResult | null> => {
  const normalizedDocumentId = normalizeDocumentId(documentId);
  if (!normalizedDocumentId) return null;

  const useLocalStorage = canUseLocalContentStorage();
  if (!useLocalStorage) {
    try {
      const cloud = await fetchCloudDraft(normalizedDocumentId);
      return cloud.status === "ok"
        ? { document: cloud.document, version: cloud.version, storageUpdatedAt: cloud.storageUpdatedAt }
        : null;
    } catch {
      return null;
    }
  }

  const localRecord = readStoredDraft(normalizedDocumentId);
  const localDraft = localRecord?.document ?? null;

  try {
    const cloud = await fetchCloudDraft(normalizedDocumentId);
    if (cloud.status === "ok") {
      writeStoredDraft(cloud.document, cloud.version, "updated", undefined, cloud.storageUpdatedAt);
      return { document: cloud.document, version: cloud.version, storageUpdatedAt: cloud.storageUpdatedAt };
    }

    if (!localDraft) return null;

    if (cloud.status === "missing") {
      try {
        const created = await createCloudDraft(localDraft);
        if (created.status === "created") {
          writeStoredDraft(localDraft, created.version, "created", undefined, created.storageUpdatedAt);
          return { document: localDraft, version: created.version, storageUpdatedAt: created.storageUpdatedAt };
        }
        writeStoredDraft(localDraft, localRecord?.cloudVersion, created.status, created.message, localRecord?.cloudStorageUpdatedAt);
      } catch {
        writeStoredDraft(localDraft, localRecord?.cloudVersion, "unavailable", "Synchronisation cloud indisponible.", localRecord?.cloudStorageUpdatedAt);
      }
    }

    return {
      document: localDraft,
      version: localRecord?.cloudVersion,
      storageUpdatedAt: localRecord?.cloudStorageUpdatedAt,
    };
  } catch {
    return localDraft
      ? { document: localDraft, version: localRecord?.cloudVersion, storageUpdatedAt: localRecord?.cloudStorageUpdatedAt }
      : null;
  }
};

export const ContentDocumentDraftService = {
  async loadDraft(documentId: string): Promise<ContentDocument | null> {
    return (await loadDraftRecord(documentId))?.document ?? null;
  },

  async loadDraftRecord(documentId: string): Promise<ContentDocumentDraftLoadResult | null> {
    return loadDraftRecord(documentId);
  },

  async saveDraft(document: ContentDocument): Promise<ContentDocumentDraftSaveResult> {
    const normalizedDocumentId = normalizeDocumentId(document.id);
    const storageKey = getStorageKey(normalizedDocumentId);
    const useLocalStorage = canUseLocalContentStorage();

    if (!useLocalStorage) {
      try {
        const cloud = await fetchCloudDraft(normalizedDocumentId);
        if (cloud.status === "ok") {
          const updated = await updateCloudDraft(document, cloud.version);
          return {
            document: updated.status === "updated" ? updated.document : document,
            local: { status: "skipped", storageKey },
            cloud: updated.status === "updated"
              ? { status: "updated", version: updated.version, storageUpdatedAt: updated.storageUpdatedAt }
              : {
                  status: updated.status,
                  currentVersion: updated.currentVersion,
                  message: updated.message,
                },
          };
        }

        if (cloud.status === "missing") {
          const created = await createCloudDraft(document);
          return {
            document: created.status === "created" ? created.document : document,
            local: { status: "skipped", storageKey },
            cloud: created.status === "created"
              ? { status: "created", version: created.version, storageUpdatedAt: created.storageUpdatedAt }
              : { status: created.status, message: created.message },
          };
        }
      } catch {
        // The media path is cloud-only and must never fall back to browser storage.
      }

      return {
        document,
        local: { status: "skipped", storageKey },
        cloud: { status: "unavailable", message: "Synchronisation cloud indisponible." },
      };
    }

    const existingDraft = readStoredDraft(normalizedDocumentId);
    const cloudVersion = existingDraft?.cloudVersion;
    writeStoredDraft(document, cloudVersion, existingDraft?.lastCloudStatus, existingDraft?.lastCloudMessage);

    if (!hasWindow()) {
      return {
        document,
        local: { status: "saved", storageKey },
        cloud: { status: "unavailable", message: "Synchronisation cloud indisponible." },
      };
    }

    try {
      if (typeof cloudVersion === "number") {
        const updated = await updateCloudDraft(document, cloudVersion);
        if (updated.status === "updated") {
          writeStoredDraft(updated.document, updated.version, "updated", undefined, updated.storageUpdatedAt);
          return {
            document: updated.document,
            local: { status: "saved", storageKey },
            cloud: { status: "updated", version: updated.version, storageUpdatedAt: updated.storageUpdatedAt },
          };
        }

        if (updated.status === "conflict") {
          writeStoredDraft(document, cloudVersion, "conflict", updated.message);
          return {
            document,
            local: { status: "saved", storageKey },
            cloud: {
              status: "conflict",
              currentVersion: updated.currentVersion,
              message: updated.message,
            },
          };
        }

        const createdAfterMissing = await createCloudDraft(document);
        if (createdAfterMissing.status === "created") {
          writeStoredDraft(createdAfterMissing.document, createdAfterMissing.version, "created", undefined, createdAfterMissing.storageUpdatedAt);
          return {
            document: createdAfterMissing.document,
            local: { status: "saved", storageKey },
            cloud: { status: "created", version: createdAfterMissing.version, storageUpdatedAt: createdAfterMissing.storageUpdatedAt },
          };
        }

        writeStoredDraft(document, cloudVersion, createdAfterMissing.status, createdAfterMissing.message);
        return {
          document,
          local: { status: "saved", storageKey },
          cloud: {
            status: createdAfterMissing.status,
            message: createdAfterMissing.message,
          },
        };
      }

      const created = await createCloudDraft(document);
      if (created.status === "created") {
        writeStoredDraft(created.document, created.version, "created", undefined, created.storageUpdatedAt);
        return {
          document: created.document,
          local: { status: "saved", storageKey },
          cloud: { status: "created", version: created.version, storageUpdatedAt: created.storageUpdatedAt },
        };
      }

      writeStoredDraft(document, cloudVersion, created.status, created.message);
      return {
        document,
        local: { status: "saved", storageKey },
        cloud: {
          status: created.status,
          message: created.message,
        },
      };
    } catch {
      writeStoredDraft(document, existingDraft?.cloudVersion, "unavailable", "Synchronisation cloud indisponible.");
      return {
        document,
        local: { status: "saved", storageKey },
        cloud: { status: "unavailable", message: "Synchronisation cloud indisponible." },
      };
    }
  },
};