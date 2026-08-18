import type { ContentDocument } from "@/types/content-document";

const STORAGE_KEY_PREFIX = "klique.contents.document-editor.draft.v2";

export type ContentDocumentDraftCloudStatus = "created" | "updated" | "conflict" | "unavailable";

export type ContentDocumentDraftSaveResult = {
  document: ContentDocument;
  local: {
    status: "saved";
    storageKey: string;
  };
  cloud: {
    status: ContentDocumentDraftCloudStatus;
    version?: number;
    currentVersion?: number;
    message?: string;
  };
};

type StoredDraftRecord = {
  document: ContentDocument;
  cloudVersion?: number;
  syncedAt?: string;
  lastCloudStatus?: ContentDocumentDraftCloudStatus;
  lastCloudMessage?: string;
};

type CloudDraftResponse = {
  ok?: boolean;
  version?: number;
  document?: ContentDocument;
  currentVersion?: number;
  currentDocument?: ContentDocument;
  message?: string;
};

type CloudFetchResult =
  | { status: "ok"; document: ContentDocument; version: number }
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

const writeStoredDraft = (document: ContentDocument, cloudVersion?: number, cloudStatus?: ContentDocumentDraftCloudStatus, cloudMessage?: string) => {
  if (!hasWindow()) return;

  const record: StoredDraftRecord = {
    document,
    cloudVersion,
    syncedAt: new Date().toISOString(),
    lastCloudStatus: cloudStatus,
    lastCloudMessage: cloudMessage,
  };

  window.localStorage.setItem(getStorageKey(document.id), JSON.stringify(record));
};

const getStoredDraftDocument = (documentId: string): ContentDocument | null => readStoredDraft(documentId)?.document ?? null;

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
    if (!payload.document || typeof payload.version !== "number") {
      throw new Error("Format inattendu pour le brouillon cloud.");
    }

    return { status: "ok" as const, document: payload.document, version: payload.version };
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
    if (!payload.document || typeof payload.version !== "number") {
      throw new Error("Format inattendu pour la creation du brouillon cloud.");
    }

    return { status: "created" as const, version: payload.version, document: payload.document };
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
    if (!payload.document || typeof payload.version !== "number") {
      throw new Error("Format inattendu pour la mise a jour du brouillon cloud.");
    }

    return { status: "updated" as const, version: payload.version, document: payload.document };
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

export const ContentDocumentDraftService = {
  async loadDraft(documentId: string): Promise<ContentDocument | null> {
    const normalizedDocumentId = normalizeDocumentId(documentId);
    if (!normalizedDocumentId) return null;

    const localDraft = getStoredDraftDocument(normalizedDocumentId);

    try {
      const cloud = await fetchCloudDraft(normalizedDocumentId);
      if (cloud.status === "ok") {
        writeStoredDraft(cloud.document, cloud.version, "updated");
        return cloud.document;
      }

      if (!localDraft) return null;

      if (cloud.status === "missing") {
        try {
          const created = await createCloudDraft(localDraft);
          if (created.status === "created") {
            writeStoredDraft(localDraft, created.version, "created");
          } else {
            writeStoredDraft(localDraft, readStoredDraft(normalizedDocumentId)?.cloudVersion, created.status, created.message);
          }
        } catch {
          writeStoredDraft(localDraft, readStoredDraft(normalizedDocumentId)?.cloudVersion, "unavailable", "Synchronisation cloud indisponible.");
        }

        return localDraft;
      }

      return localDraft;
    } catch {
      return localDraft;
    }
  },

  async saveDraft(document: ContentDocument): Promise<ContentDocumentDraftSaveResult> {
    const normalizedDocumentId = normalizeDocumentId(document.id);
    const storageKey = getStorageKey(normalizedDocumentId);
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
          writeStoredDraft(document, updated.version, "updated");
          return {
            document,
            local: { status: "saved", storageKey },
            cloud: { status: "updated", version: updated.version },
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
          writeStoredDraft(document, createdAfterMissing.version, "created");
          return {
            document,
            local: { status: "saved", storageKey },
            cloud: { status: "created", version: createdAfterMissing.version },
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
        writeStoredDraft(document, created.version, "created");
        return {
          document,
          local: { status: "saved", storageKey },
          cloud: { status: "created", version: created.version },
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