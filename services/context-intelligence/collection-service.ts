import { randomUUID } from "node:crypto";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import {
  EditorialContextCollectionRepository,
  type EditorialContextCollection,
} from "@/lib/context-collections/repository";
import { ContentGenerationError } from "@/services/content-generation/errors";
import { contextIntelligenceConfig } from "@/services/context-intelligence/config";
import { clampText, isSensitiveText, normalize } from "@/services/context-intelligence/utils";
import type {
  ContextCollectionResponseSuccess,
  ContextItem,
  ContextManualEdit,
  ContextSelectionReference,
} from "@/types/context-intelligence";

export const EDITORIAL_CONTEXT_COLLECTION_TTL_MS = 30 * 60 * 1000;

export type EditorialContextCollectionStore = {
  create(
    input: Pick<EditorialContextCollection, "id" | "items" | "reports" | "summary" | "expiresAt">,
    access: ContentAccessContext,
  ): Promise<EditorialContextCollection>;
  getById(collectionId: string, access: ContentAccessContext): Promise<EditorialContextCollection | null>;
};

const isMediaExcludedItem = (item: ContextItem): boolean =>
  item.isSensitive === true || item.category === "injury_or_return";

export const projectEditorialCollectionForAccess = (
  response: ContextCollectionResponseSuccess,
  access: ContentAccessContext,
): ContextCollectionResponseSuccess => {
  if (access.role !== "media") return response;

  const items = response.items.filter((item) => !isMediaExcludedItem(item));
  const removedCount = response.items.length - items.length;
  if (!removedCount) return response;

  return {
    ...response,
    items,
    summary: {
      ...response.summary,
      totalItemsFound: items.length,
      selectedItemsCount: items.filter((item) => item.isSelected).length,
      externalSourcesCount: items.filter((item) =>
        item.sourceType === "official" || item.sourceType === "media" || item.sourceType === "external").length,
      warnings: [...response.summary.warnings, `${removedCount} element(s) sensible(s) exclu(s) du contexte Media.`],
    },
  };
};

const normalizeIds = (values: string[]): string[] =>
  values.map(normalize).filter(Boolean);

const manualEditByItemId = (manualEdits: ContextManualEdit[]): Map<string, string> => {
  const result = new Map<string, string>();
  for (const edit of manualEdits) {
    const itemId = normalize(edit.itemId);
    const text = clampText(normalize(edit.text), contextIntelligenceConfig.limits.maxCharactersPerItem);
    if (itemId && text) result.set(itemId, text);
  }
  return result;
};

const toUserProvidedEdit = (item: ContextItem, text: string): ContextItem => ({
  id: `manual-edit-${item.id}`,
  connectorId: "manual",
  category: "user_note",
  title: `Texte utilisateur pour ${item.title}`,
  summary: text,
  factualStatement: text,
  statementType: "editorial_lead",
  sourceType: "user",
  sourceName: "Ajoute par l utilisateur",
  retrievedAt: new Date().toISOString(),
  confidence: "unknown",
  verificationStatus: "user_provided",
  isSelected: true,
  isEditable: true,
  metadata: { editedFromItemId: item.id },
  isSensitive: isSensitiveText(text),
});

export const createEditorialContextCollection = async (
  response: ContextCollectionResponseSuccess,
  access: ContentAccessContext,
  store: EditorialContextCollectionStore = EditorialContextCollectionRepository,
): Promise<EditorialContextCollection> => {
  const expiresAt = new Date(Date.now() + EDITORIAL_CONTEXT_COLLECTION_TTL_MS).toISOString();
  return store.create({
    id: randomUUID(),
    items: response.items.map((item) => ({ ...item, editedSummary: undefined })),
    reports: response.reports,
    summary: response.summary,
    expiresAt,
  }, access);
};

export const resolveEditorialContextSelection = async (
  selection: ContextSelectionReference,
  access: ContentAccessContext,
  store: EditorialContextCollectionStore = EditorialContextCollectionRepository,
  now = new Date(),
): Promise<ContextItem[]> => {
  const collectionId = normalize(selection.collectionId);
  const selectedItemIds = normalizeIds(selection.selectedItemIds ?? []);
  const edits = manualEditByItemId(selection.manualEdits ?? []);

  if (!collectionId) {
    if (selectedItemIds.length || edits.size) {
      throw new ContentGenerationError("INVALID_REQUEST", "Collection de contexte obligatoire.");
    }
    return [];
  }

  if (new Set(selectedItemIds).size !== selectedItemIds.length) {
    throw new ContentGenerationError("INVALID_REQUEST", "Selection de contexte dupliquee.");
  }

  const collection = await store.getById(collectionId, access);
  if (!collection) {
    throw new ContentGenerationError("INVALID_REQUEST", "Collection de contexte introuvable pour cet acces.");
  }
  if (new Date(collection.expiresAt).getTime() <= now.getTime()) {
    throw new ContentGenerationError("INVALID_REQUEST", "Collection de contexte expiree.");
  }

  const itemById = new Map(collection.items.map((item) => [item.id, item]));
  const unknownItemId = selectedItemIds.find((itemId) => !itemById.has(itemId));
  if (unknownItemId) {
    throw new ContentGenerationError("INVALID_REQUEST", "Un element de contexte selectionne est invalide.");
  }
  const editedUnknownItemId = [...edits.keys()].find((itemId) => !selectedItemIds.includes(itemId));
  if (editedUnknownItemId) {
    throw new ContentGenerationError("INVALID_REQUEST", "Une edition de contexte ne correspond pas a la selection.");
  }

  return selectedItemIds.map((itemId) => {
    const item = itemById.get(itemId)!;
    const editedText = edits.get(itemId);
    if (editedText && editedText !== normalize(item.summary)) {
      return toUserProvidedEdit(item, editedText);
    }
    return {
      ...item,
      isSelected: true,
      editedSummary: undefined,
      originalSummary: undefined,
    };
  });
};
