import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentVariantRepositoryService } from "@/services/content-variants/repository";
import type { ContentVariant } from "@/types/content-variant";

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const createMemoryStorage = (): MemoryStorage => {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
};

const createResponse = (body: unknown, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

const baseVariant: ContentVariant = {
  id: "variant-1",
  sourceDocumentId: "document-1",
  sourceDocumentType: "interview",
  sourceDocumentVersionId: "version-1",
  sourceDocumentUpdatedAt: "2026-08-08T10:00:00.000Z",
  type: "publication",
  format: "instagram",
  platform: "instagram",
  objective: "inform",
  tone: "authentic",
  audience: "general",
  title: "Variant title",
  content: "Content",
  structuredContent: {
    angle: "Angle",
    hook: "Hook",
    body: "Body",
    callToAction: "CTA",
    hashtags: ["#tag"],
    visualIdea: "Visual",
  },
  status: "draft",
  generationMetadata: {
    provider: "openai",
    model: "gpt",
    generatedAt: "2026-08-08T10:00:00.000Z",
    generationDurationMs: 1,
    promptVersion: "1",
    variationTemplateVersion: "1",
    sourceDocumentVersionId: "version-1",
    sourceDocumentUpdatedAt: "2026-08-08T10:00:00.000Z",
    usedContextItemIds: [],
  },
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
};

const readLocalVariants = (storage: MemoryStorage) => {
  const raw = storage.getItem("klique.contents.variants.v1");
  return raw ? (JSON.parse(raw) as ContentVariant[]) : [];
};

describe("ContentVariantRepositoryService", () => {
  let storage: MemoryStorage;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = createMemoryStorage();
    fetchMock = vi.fn();
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads variants from cloud when available", async () => {
    fetchMock.mockResolvedValueOnce(createResponse({ ok: true, sourceDocumentId: "document-1", variants: [baseVariant] }));

    const items = await ContentVariantRepositoryService.listBySourceDocument("document-1");

    expect(items).toEqual([baseVariant]);
    expect(fetchMock).toHaveBeenCalledWith("/api/contents/storage/variants?sourceDocumentId=document-1");
  });

  it("falls back to local variants and backfills cloud when cloud is empty", async () => {
    const localVariant = { ...baseVariant, id: "variant-local", title: "Local variant" };
    storage.setItem("klique.contents.variants.v1", JSON.stringify([localVariant]));
    fetchMock
      .mockResolvedValueOnce(createResponse({ ok: true, sourceDocumentId: "document-1", variants: [] }))
      .mockResolvedValueOnce(createResponse({ ok: true, variant: localVariant }, 201));

    const items = await ContentVariantRepositoryService.listBySourceDocument("document-1");

    expect(items).toEqual([localVariant]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/contents/storage/variants?sourceDocumentId=document-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/contents/storage/variants",
      expect.objectContaining({ method: "POST" })
    );
    expect(readLocalVariants(storage)).toEqual([localVariant]);
  });

  it("saves to local storage and posts to cloud when the variant is missing remotely", async () => {
    fetchMock
      .mockResolvedValueOnce(createResponse({ ok: false, message: "Variante introuvable." }, 404))
      .mockResolvedValueOnce(createResponse({ ok: true, variant: baseVariant }, 201));

    await ContentVariantRepositoryService.save(baseVariant);

    expect(readLocalVariants(storage)).toEqual([baseVariant]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/contents/storage/variants/variant-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/contents/storage/variants",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("reads cloud by id first and then falls back to local storage", async () => {
    const localVariant = { ...baseVariant, title: "Local fallback" };
    storage.setItem("klique.contents.variants.v1", JSON.stringify([localVariant]));
    fetchMock.mockResolvedValueOnce(createResponse({ ok: true, variant: baseVariant }));

    const cloudVariant = await ContentVariantRepositoryService.getById("variant-1");

    expect(cloudVariant).toEqual(baseVariant);

    fetchMock.mockResolvedValueOnce(createResponse({ ok: false, message: "Variante introuvable." }, 404));
    const localFallback = await ContentVariantRepositoryService.getById("variant-1");

    expect(localFallback).toEqual(localVariant);
  });

  it("keeps local variants when the cloud is unavailable", async () => {
    const localVariant = { ...baseVariant, id: "variant-offline" };
    storage.setItem("klique.contents.variants.v1", JSON.stringify([localVariant]));
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    const items = await ContentVariantRepositoryService.listBySourceDocument("document-1");

    expect(items).toEqual([localVariant]);
    expect(readLocalVariants(storage)).toEqual([localVariant]);
  });

  it("avoids duplicate variants after cloud resynchronization", async () => {
    const localVariant = { ...baseVariant, id: "variant-dup" };
    storage.setItem("klique.contents.variants.v1", JSON.stringify([localVariant]));
    fetchMock
      .mockResolvedValueOnce(createResponse({ ok: true, sourceDocumentId: "document-1", variants: [] }))
      .mockResolvedValueOnce(createResponse({ ok: true, variant: localVariant }, 201))
      .mockResolvedValueOnce(createResponse({ ok: true, sourceDocumentId: "document-1", variants: [localVariant] }));

    const first = await ContentVariantRepositoryService.listBySourceDocument("document-1");
    const second = await ContentVariantRepositoryService.listBySourceDocument("document-1");

    expect(first).toEqual([localVariant]);
    expect(second).toEqual([localVariant]);
    expect(new Set(second.map((item) => item.id)).size).toBe(second.length);
  });
});