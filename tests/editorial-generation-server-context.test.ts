import { describe, expect, it, vi } from "vitest";
import {
  EditorialGenerationBlockedError,
  prepareEditorialGeneration,
} from "@/services/editorial-generation/server-context";
import type { EditorialContextCollectionStore } from "@/services/context-intelligence/collection-service";
import {
  editorialDossierItems,
  editorialDossierSubject,
} from "@/tests/fixtures/editorial-dossier";
import type { ContentAccessContext } from "@/lib/content-storage/access";

const access: ContentAccessContext = {
  clerkUserId: "admin-1",
  workspaceId: "workspace-1",
  role: "admin",
  mediaId: null,
  isAdmin: true,
};

const collection = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: "workspace-1",
  clerkUserId: "admin-1",
  role: "admin" as const,
  mediaId: null,
  items: editorialDossierItems,
  reports: [],
  summary: {
    totalItemsFound: editorialDossierItems.length,
    selectedItemsCount: editorialDossierItems.length,
    externalSourcesCount: 5,
    researchedAt: "2026-10-19T10:00:00.000Z",
    dateRange: { preset: "last_30_days" as const, from: "2026-09-19", to: "2026-10-19" },
    warnings: [],
  },
  createdAt: "2026-10-19T10:00:00.000Z",
  expiresAt: "2026-10-19T10:30:00.000Z",
};

const store = (value: typeof collection | null): EditorialContextCollectionStore => ({
  create: vi.fn(),
  getById: vi.fn(async (_id, requestedAccess) =>
    value
    && requestedAccess.workspaceId === value.workspaceId
    && requestedAccess.clerkUserId === value.clerkUserId
    && requestedAccess.role === value.role
      ? value
      : null),
});

describe("server EditorialDossier preparation", () => {
  it("rebuilds a compatible 8B2 dossier from an authorized 8B1 collection", async () => {
    const prepared = await prepareEditorialGeneration({
      contextSelection: {
        collectionId: collection.id,
        selectedItemIds: collection.items.map((item) => item.id),
        manualEdits: [],
      },
      subject: editorialDossierSubject,
      target: { type: "interview", interviewType: "portrait" },
      access,
      store: store(collection),
      now: new Date("2026-10-19T10:10:00.000Z"),
    });

    expect(prepared.selection.modelContext.subject.displayName).toBe("Mila Martin");
    expect(prepared.selection.metadata.dossierRevision).toBe(1);
    expect(prepared.selectedItems.length).toBeGreaterThan(0);
    expect(JSON.stringify(prepared.selectedItems)).not.toContain("Douleur au genou strictement privee");
    expect(prepared.selectedItems.every((item) => item.id.startsWith("editorial-"))).toBe(true);
  });

  it("refuses expired, foreign and modified collections before selection", async () => {
    const base = {
      contextSelection: {
        collectionId: collection.id,
        selectedItemIds: ["official-result"],
        manualEdits: [],
      },
      subject: editorialDossierSubject,
      target: { type: "article", articleType: "actualite" } as const,
      access,
    };

    await expect(prepareEditorialGeneration({
      ...base,
      store: store(collection),
      now: new Date("2026-10-19T10:31:00.000Z"),
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(prepareEditorialGeneration({
      ...base,
      access: { ...access, workspaceId: "workspace-2" },
      store: store(collection),
      now: new Date("2026-10-19T10:10:00.000Z"),
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(prepareEditorialGeneration({
      ...base,
      contextSelection: { ...base.contextSelection, selectedItemIds: ["invented-item"] },
      store: store(collection),
      now: new Date("2026-10-19T10:10:00.000Z"),
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("blocks before provider work when the dossier has no exploitable article fact", async () => {
    const limitedCollection = {
      ...collection,
      items: editorialDossierItems.filter((item) => item.id === "crm-name" || item.id === "manual-note"),
    };
    await expect(prepareEditorialGeneration({
      contextSelection: {
        collectionId: collection.id,
        selectedItemIds: limitedCollection.items.map((item) => item.id),
        manualEdits: [],
      },
      subject: editorialDossierSubject,
      target: { type: "article", articleType: "actualite" },
      access,
      store: store(limitedCollection),
      now: new Date("2026-10-19T10:10:00.000Z"),
    })).rejects.toBeInstanceOf(EditorialGenerationBlockedError);
  });
});
