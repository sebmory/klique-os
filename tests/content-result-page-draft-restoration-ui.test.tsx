// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentDocumentEditor } from "@/components/contents/ContentDocumentEditor";
import type { PublicationDocument } from "@/types/content-document";

const mocks = vi.hoisted(() => ({
  loadDraftRecord: vi.fn(),
  saveDraft: vi.fn(),
  restoreInterviewResultSession: vi.fn(),
  restoreArticleResultSession: vi.fn(),
  restoreLegacyArticlePreviewSession: vi.fn(),
  runContentsBackfill: vi.fn(),
}));

vi.mock("@/services/content-documents/draft-service", () => ({
  ContentDocumentDraftService: {
    loadDraftRecord: mocks.loadDraftRecord,
    saveDraft: mocks.saveDraft,
  },
}));

vi.mock("@/services/content-result-sessions", () => ({
  restoreInterviewResultSession: mocks.restoreInterviewResultSession,
  restoreArticleResultSession: mocks.restoreArticleResultSession,
  restoreLegacyArticlePreviewSession: mocks.restoreLegacyArticlePreviewSession,
  saveArticleResultSession: vi.fn(),
  isStoredArticleResult: vi.fn(() => false),
}));

vi.mock("@/services/content-backfill", () => ({
  runContentsBackfill: mocks.runContentsBackfill,
}));

vi.mock("@/components/contents/ContentDocumentEditor", () => ({
  ContentDocumentEditor: ({ initialDocument, initialSourceDocumentRevision, initialSourceDocumentStorageUpdatedAt }: ComponentProps<typeof ContentDocumentEditor>) =>
    createElement("section", {
      "data-testid": "document-editor",
      "data-revision": initialSourceDocumentRevision,
      "data-storage-updated-at": initialSourceDocumentStorageUpdatedAt,
    }, initialDocument.sections.title),
}));

vi.mock("@/components/contents/InterviewResultScreen", () => ({
  InterviewResultScreen: () => createElement("section", { "data-testid": "proposal-choice" }, "Choisir une proposition"),
}));

vi.mock("@/components/contents/ArticleResultScreen", () => ({
  ArticleResultScreen: () => null,
}));

vi.mock("@/components/contents/ArticleDocumentEditor", () => ({
  ArticleDocumentEditor: () => null,
}));

import { InterviewResultPageClient } from "@/components/contents/InterviewResultPageClient";

const savedPublication = {
  id: "publication-1",
  type: "publication",
  status: "draft",
  createdAt: "2026-09-28T08:39:00.000Z",
  updatedAt: "2026-09-28T08:39:00.000Z",
  versions: [{ id: "version-2", createdAt: "2026-09-28T08:39:00.000Z", label: "Version 2", source: "manual" }],
  activeVersionId: "version-2",
  sidebar: {
    subject: "Klique FC",
    source: "temporary",
    objective: "engagement",
    tone: "dynamic",
    audience: "supporters",
    format: "social",
    templateVersion: "1",
    provider: "openai",
    model: "gpt",
    generatedAt: "2026-09-28T08:39:00.000Z",
  },
  metadata: {
    provider: "openai",
    model: "gpt",
    templateId: "publication",
    templateKey: "publication:v1",
    templateVersion: "1",
    promptVersion: "1",
    generatedAt: "2026-09-28T08:39:00.000Z",
    generationDurationMs: 10,
    questionCountRequested: 0,
    questionCountGenerated: 0,
    reliabilityNotes: [],
    missingInformation: [],
    externalContextUsed: false,
  },
  contextUsage: {
    usedContextItemIds: [],
    usedSourceIds: [],
    unusedSelectedContextItemIds: [],
    externalContextUsed: false,
    selectedItems: [],
  },
  sections: {
    title: "Publication sauvegardée",
    editorialAngle: "Angle",
    hook: "Accroche",
    text: "Texte",
    cta: "CTA",
    hashtags: [],
    visualSuggestion: "Visuel",
    editorialNote: "",
  },
  sourceContext: { afterMatch: { opponent: "FC Exemple", result: "2-1" } },
} satisfies PublicationDocument;

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadDraftRecord.mockResolvedValue({
    document: savedPublication,
    version: 4,
    storageUpdatedAt: "2026-09-28T08:45:00.000Z",
  });
  mocks.runContentsBackfill.mockResolvedValue(undefined);
  mocks.restoreArticleResultSession.mockResolvedValue(null);
  mocks.restoreLegacyArticlePreviewSession.mockReturnValue(null);
  mocks.restoreInterviewResultSession.mockResolvedValue({ source: "cloud", result: {} });
  window.history.replaceState(null, "", "/contents/create/result?sessionId=session-proposals&documentId=publication-1");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Content result page saved draft restoration", () => {
  it("opens a saved Publication directly instead of returning to proposal choice", async () => {
    await act(async () => root.render(<InterviewResultPageClient />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.loadDraftRecord).toHaveBeenCalledWith("publication-1");
    const editor = container.querySelector('[data-testid="document-editor"]');
    expect(editor?.textContent).toBe("Publication sauvegardée");
    expect(editor?.getAttribute("data-revision")).toBe("4");
    expect(editor?.getAttribute("data-storage-updated-at")).toBe("2026-09-28T08:45:00.000Z");
    expect(container.querySelector('[data-testid="proposal-choice"]')).toBeNull();
    expect(mocks.restoreInterviewResultSession).not.toHaveBeenCalled();
  });
});