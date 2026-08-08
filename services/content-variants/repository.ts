import type { ContentVariant } from "@/types/content-variant";

const STORAGE_KEY = "klique.contents.variants.v1";

type LocalVariantRecord = ContentVariant[];

type CloudVariantsListResponse = {
  ok?: boolean;
  sourceDocumentId?: string;
  variants?: ContentVariant[];
  message?: string;
};

type CloudVariantResponse = {
  ok?: boolean;
  variant?: ContentVariant;
  message?: string;
};

type CloudReadResult<T> =
  | { status: "ok"; value: T }
  | { status: "missing" }
  | { status: "unavailable"; message?: string };

export interface ContentVariantRepository {
  save(variant: ContentVariant): Promise<void>;
  listBySourceDocument(sourceDocumentId: string): Promise<ContentVariant[]>;
  getById(id: string): Promise<ContentVariant | null>;
}

class BrowserStorageContentVariantRepository implements ContentVariantRepository {
  private readAll(): LocalVariantRecord {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as ContentVariant[];
      return Array.isArray(parsed) ? this.uniqueById(parsed) : [];
    } catch {
      return [];
    }
  }

  private writeAll(items: ContentVariant[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.uniqueById(items)));
  }

  private uniqueById(items: ContentVariant[]): ContentVariant[] {
    const seen = new Map<string, ContentVariant>();
    for (const item of items) {
      seen.set(item.id, item);
    }
    return Array.from(seen.values());
  }

  private upsertLocal(variant: ContentVariant): ContentVariant[] {
    const all = this.readAll();
    const index = all.findIndex((item) => item.id === variant.id);
    if (index >= 0) {
      all[index] = variant;
    } else {
      all.unshift(variant);
    }
    const next = this.uniqueById(all);
    this.writeAll(next);
    return next;
  }

  private async parseJsonResponse<T>(response: Response): Promise<T | null> {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  private async readCloudVariants(sourceDocumentId: string): Promise<CloudReadResult<ContentVariant[]>> {
    if (typeof fetch === "undefined") return { status: "unavailable" };

    try {
      const response = await fetch(`/api/contents/storage/variants?sourceDocumentId=${encodeURIComponent(sourceDocumentId)}`);
      const payload = (await this.parseJsonResponse<CloudVariantsListResponse>(response)) ?? {};

      if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
          return { status: "missing" };
        }
        return { status: "unavailable", message: payload.message };
      }

      return { status: "ok", value: this.uniqueById(Array.isArray(payload.variants) ? payload.variants : []) };
    } catch {
      return { status: "unavailable" };
    }
  }

  private async readCloudVariantById(id: string): Promise<CloudReadResult<ContentVariant>> {
    if (typeof fetch === "undefined") return { status: "unavailable" };

    try {
      const response = await fetch(`/api/contents/storage/variants/${encodeURIComponent(id)}`);
      const payload = (await this.parseJsonResponse<CloudVariantResponse>(response)) ?? {};

      if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
          return { status: "missing" };
        }
        return { status: "unavailable", message: payload.message };
      }

      if (!payload.variant) {
        return { status: "unavailable", message: "Format de variante inattendu." };
      }

      return { status: "ok", value: payload.variant };
    } catch {
      return { status: "unavailable" };
    }
  }

  private async createCloudVariant(variant: ContentVariant): Promise<CloudReadResult<ContentVariant>> {
    if (typeof fetch === "undefined") return { status: "unavailable" };

    try {
      const response = await fetch("/api/contents/storage/variants", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ variant }),
      });

      const payload = (await this.parseJsonResponse<CloudVariantResponse>(response)) ?? {};

      if (!response.ok) {
        if (response.status === 409) {
          return { status: "missing" };
        }
        return { status: "unavailable", message: payload.message };
      }

      if (!payload.variant) {
        return { status: "unavailable", message: "Format de variante inattendu." };
      }

      return { status: "ok", value: payload.variant };
    } catch {
      return { status: "unavailable" };
    }
  }

  async save(variant: ContentVariant): Promise<void> {
    const existingLocal = this.upsertLocal(variant);

    if (typeof window === "undefined" || typeof fetch === "undefined") {
      this.writeAll(existingLocal);
      return;
    }

    const cloud = await this.readCloudVariantById(variant.id);
    if (cloud.status === "ok") {
      return;
    }

    if (cloud.status === "missing") {
      const created = await this.createCloudVariant(variant);
      if (created.status === "ok") {
        this.writeAll(existingLocal);
      }
    }
  }

  async listBySourceDocument(sourceDocumentId: string): Promise<ContentVariant[]> {
    const cloud = await this.readCloudVariants(sourceDocumentId);
    if (cloud.status === "ok") {
      if (cloud.value.length > 0) {
        return this.uniqueById(cloud.value.filter((item) => item.sourceDocumentId === sourceDocumentId));
      }

      const local = this.readAll().filter((item) => item.sourceDocumentId === sourceDocumentId);
      if (!local.length) return [];

      for (const item of local) {
        const created = await this.createCloudVariant(item);
        if (created.status === "ok") {
          continue;
        }
      }

      return this.uniqueById(local);
    }

    const local = this.readAll().filter((item) => item.sourceDocumentId === sourceDocumentId);
    return this.uniqueById(local);
  }

  async getById(id: string): Promise<ContentVariant | null> {
    const cloud = await this.readCloudVariantById(id);
    if (cloud.status === "ok") {
      return cloud.value;
    }

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
