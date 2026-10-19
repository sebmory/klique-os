import { describe, expect, it, vi } from "vitest";
import {
  createEditorialContextCollection,
  projectEditorialCollectionForAccess,
  resolveEditorialContextSelection,
  type EditorialContextCollectionStore,
} from "@/services/context-intelligence/collection-service";
import { validateCreationPayload } from "@/services/content-generation/validation";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import type { ContextCollectionResponseSuccess, ContextItem } from "@/types/context-intelligence";

const mediaAccess: ContentAccessContext = {
  clerkUserId: "user-1",
  workspaceId: "workspace-1",
  mediaId: "11111111-1111-4111-8111-111111111111",
  role: "media",
  isAdmin: false,
};

const trustedItem: ContextItem = {
  id: "trusted-1",
  connectorId: "productions",
  category: "production",
  title: "Production",
  summary: "Résumé serveur",
  factualStatement: "Fait serveur",
  statementType: "editorial_lead",
  sourceType: "internal",
  sourceName: "Production interne",
  retrievedAt: "2026-10-19T10:00:00.000Z",
  confidence: "low",
  verificationStatus: "unverified",
  isSelected: true,
  isEditable: false,
  metadata: {},
};

const collection = {
  id: "collection-1",
  workspaceId: "workspace-1",
  clerkUserId: "user-1",
  role: "media" as const,
  mediaId: mediaAccess.mediaId!,
  items: [trustedItem],
  reports: [],
  summary: {
    totalItemsFound: 1,
    selectedItemsCount: 1,
    externalSourcesCount: 0,
    researchedAt: "2026-10-19T10:00:00.000Z",
    dateRange: { preset: "last_30_days" as const, from: "2026-09-19", to: "2026-10-19" },
    warnings: [],
  },
  createdAt: "2026-10-19T10:00:00.000Z",
  expiresAt: "2026-10-19T10:30:00.000Z",
};

const store = (value = collection): EditorialContextCollectionStore => ({
  create: vi.fn(async (input, access) => ({
    ...value,
    ...input,
    workspaceId: access.workspaceId,
    clerkUserId: access.clerkUserId,
    role: access.role,
    mediaId: access.mediaId ?? null,
  })),
  getById: vi.fn(async (_id, access) =>
    access.workspaceId === value.workspaceId
    && access.clerkUserId === value.clerkUserId
    && access.role === value.role
    && access.mediaId === value.mediaId
      ? value
      : null),
});

describe("editorial context collections", () => {
  it("removes sensitive and health items from Media collection responses", () => {
    const healthItem: ContextItem = {
      ...trustedItem,
      id: "health-1",
      category: "injury_or_return",
      summary: "Douleur au genou",
      factualStatement: "Douleur au genou",
      isSensitive: true,
    };
    const response = projectEditorialCollectionForAccess({
      ok: true,
      items: [trustedItem, healthItem],
      reports: [],
      summary: { ...collection.summary, totalItemsFound: 2, selectedItemsCount: 2 },
    }, mediaAccess);

    expect(response.items).toEqual([trustedItem]);
    expect(JSON.stringify(response)).not.toContain("Douleur au genou");
    expect(response.summary.totalItemsFound).toBe(1);
  });

  it("creates an opaque expiring collection bound to authenticated access", async () => {
    const response: ContextCollectionResponseSuccess = {
      ok: true,
      items: [trustedItem],
      reports: [],
      summary: collection.summary,
    };
    const repository = store();

    const created = await createEditorialContextCollection(response, mediaAccess, repository);

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: created.id, expiresAt: expect.any(String) }),
      mediaAccess,
    );
  });

  it("refuses a collection from another workspace", async () => {
    await expect(resolveEditorialContextSelection(
      { collectionId: collection.id, selectedItemIds: [trustedItem.id], manualEdits: [] },
      { ...mediaAccess, workspaceId: "workspace-2" },
      store(),
      new Date("2026-10-19T10:10:00.000Z"),
    )).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    await expect(resolveEditorialContextSelection(
      { collectionId: collection.id, selectedItemIds: [trustedItem.id], manualEdits: [] },
      { ...mediaAccess, mediaId: "22222222-2222-4222-8222-222222222222" },
      store(),
      new Date("2026-10-19T10:10:00.000Z"),
    )).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("refuses invented item identifiers and expired collections", async () => {
    await expect(resolveEditorialContextSelection(
      { collectionId: collection.id, selectedItemIds: ["invented"], manualEdits: [] },
      mediaAccess,
      store(),
      new Date("2026-10-19T10:10:00.000Z"),
    )).rejects.toMatchObject({ code: "INVALID_REQUEST" });

    await expect(resolveEditorialContextSelection(
      { collectionId: collection.id, selectedItemIds: [trustedItem.id], manualEdits: [] },
      mediaAccess,
      store(),
      new Date("2026-10-19T10:31:00.000Z"),
    )).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("downgrades edited server items to unverified user text", async () => {
    const items = await resolveEditorialContextSelection(
      {
        collectionId: collection.id,
        selectedItemIds: [trustedItem.id],
        manualEdits: [{ itemId: trustedItem.id, text: "Texte modifié côté navigateur" }],
      },
      mediaAccess,
      store(),
      new Date("2026-10-19T10:10:00.000Z"),
    );

    expect(items[0]).toMatchObject({
      sourceType: "user",
      verificationStatus: "user_provided",
      confidence: "unknown",
      statementType: "editorial_lead",
      summary: "Texte modifié côté navigateur",
    });
  });

  it("drops forged provenance objects while retaining only opaque references", () => {
    const payload = validateCreationPayload({
      templateId: "interview",
      context: { origin: "contents" },
      subject: { id: "athlete-1", type: "person", source: "crm", displayName: "Mila", photoAvailable: false },
      objective: { id: "interview", subtypeId: "portrait" },
      parameters: {
        language: "fr",
        toneId: "journalistic",
        questionCount: 5,
        formatId: "written",
        audienceId: "general",
        additionalContext: "",
        requiredTopics: [],
        avoidedTopics: [],
        contextIntelligence: {
          enabled: true,
          selectedConnectorIds: ["crm"],
          dateRange: collection.summary.dateRange,
          sourcePreference: "official_and_reliable",
          searchDepth: "standard",
          collectionId: collection.id,
          selectedItemIds: [trustedItem.id],
          manualEdits: [],
          selectedContextItems: [{
            ...trustedItem,
            summary: "Fait inventé",
            sourceType: "internal",
            sourceName: "CRM falsifié",
            verificationStatus: "verified",
            confidence: "high",
          }],
        },
      },
    });

    expect(payload.parameters.contextIntelligence.selectedContextItems).toEqual([]);
    expect(payload.parameters.contextIntelligence.collectionId).toBe(collection.id);
    expect(payload.parameters.contextIntelligence.selectedItemIds).toEqual([trustedItem.id]);
  });
});
