import type { ContentVariant } from "@/types/content-variant";

const STORAGE_KEY = "klique.contents.variants.v1";

export interface ContentVariantRepository {
  save(variant: ContentVariant): Promise<void>;
  listBySourceDocument(sourceDocumentId: string): Promise<ContentVariant[]>;
  getById(id: string): Promise<ContentVariant | null>;
}

class BrowserStorageContentVariantRepository implements ContentVariantRepository {
  private readAll(): ContentVariant[] {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as ContentVariant[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeAll(items: ContentVariant[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  async save(variant: ContentVariant): Promise<void> {
    const all = this.readAll();
    const index = all.findIndex((item) => item.id === variant.id);
    if (index >= 0) {
      all[index] = variant;
    } else {
      all.unshift(variant);
    }
    this.writeAll(all);
  }

  async listBySourceDocument(sourceDocumentId: string): Promise<ContentVariant[]> {
    const all = this.readAll();
    return all.filter((item) => item.sourceDocumentId === sourceDocumentId);
  }

  async getById(id: string): Promise<ContentVariant | null> {
    const all = this.readAll();
    return all.find((item) => item.id === id) ?? null;
  }
}

const repository = new BrowserStorageContentVariantRepository();

export const ContentVariantRepositoryService = {
  save(variant: ContentVariant): Promise<void> {
    return repository.save(variant);
  },
  listBySourceDocument(sourceDocumentId: string): Promise<ContentVariant[]> {
    return repository.listBySourceDocument(sourceDocumentId);
  },
  getById(id: string): Promise<ContentVariant | null> {
    return repository.getById(id);
  },
};
