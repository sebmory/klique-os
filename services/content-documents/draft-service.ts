import type { ContentDocument } from "@/types/content-document";

const DRAFT_KEY_PREFIX = "klique.contents.document-editor.draft.v1";

export interface ContentDocumentDraftRepository {
  saveDraft(document: ContentDocument): Promise<void>;
  loadDraft(documentId: string): Promise<ContentDocument | null>;
}

class BrowserStorageDocumentDraftRepository implements ContentDocumentDraftRepository {
  async saveDraft(document: ContentDocument): Promise<void> {
    if (typeof window === "undefined") return;
    const key = `${DRAFT_KEY_PREFIX}:${document.id}`;
    window.localStorage.setItem(key, JSON.stringify(document));
  }

  async loadDraft(documentId: string): Promise<ContentDocument | null> {
    if (typeof window === "undefined") return null;
    const key = `${DRAFT_KEY_PREFIX}:${documentId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as ContentDocument;
    } catch {
      return null;
    }
  }
}

const repository = new BrowserStorageDocumentDraftRepository();

export const ContentDocumentDraftService = {
  saveDraft(document: ContentDocument): Promise<void> {
    return repository.saveDraft(document);
  },
  loadDraft(documentId: string): Promise<ContentDocument | null> {
    return repository.loadDraft(documentId);
  },
};
