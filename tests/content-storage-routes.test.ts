import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import { GET as getDraft, PATCH as patchDraft } from "@/app/api/contents/storage/drafts/[id]/route";
import { POST as postDraft } from "@/app/api/contents/storage/drafts/route";
import { GET as getSession } from "@/app/api/contents/storage/sessions/[sessionId]/route";
import { POST as postSessions } from "@/app/api/contents/storage/sessions/route";
import { GET as getVariant } from "@/app/api/contents/storage/variants/[id]/route";
import { GET as listVariants, POST as postVariants } from "@/app/api/contents/storage/variants/route";
import { validateContentDocumentWriteBody } from "@/lib/content-storage/validation";

const repo = vi.hoisted(() => ({
  createDraft: vi.fn(),
  getDraft: vi.fn(),
  updateDraft: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  createVariant: vi.fn(),
  getVariant: vi.fn(),
  listVariantsBySourceDocumentId: vi.fn(),
}));

vi.mock("@/lib/content-storage/repository", () => ({
  ContentStorageRepository: repo,
}));

const makeJsonRequest = (body: unknown): Request => {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
};

const makeNextRequest = (url: string): NextRequest => ({
  nextUrl: new URL(url),
} as unknown as NextRequest);

const validDocument = {
  id: "document-1",
  type: "interview",
  status: "draft",
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
  versions: [
    { id: "version-1", createdAt: "2026-08-08T10:00:00.000Z", label: "Version initiale", source: "generation" },
  ],
  activeVersionId: "version-1",
  sidebar: {
    subject: "Alpha Martin",
    source: "crm",
    objective: "portrait",
    tone: "authentic",
    audience: "general",
    format: "written",
    templateVersion: "v1",
    provider: "openai",
    model: "gpt",
    generatedAt: "2026-08-08T10:00:00.000Z",
  },
  metadata: {
    provider: "openai",
    model: "gpt",
    templateId: "interview",
    templateKey: "interview:v1",
    templateVersion: "1",
    promptVersion: "1",
    generatedAt: "2026-08-08T10:00:00.000Z",
    generationDurationMs: 10,
    questionCountRequested: 5,
    questionCountGenerated: 5,
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
    title: "Titre",
    editorialAngle: "Angle",
    introduction: "Intro",
    questions: [
      {
        id: "q1",
        text: "Question ?",
        purpose: "Purpose",
        topic: "Topic",
        followUps: [],
        locked: false,
        privateNotes: "Note privee",
      },
    ],
    conclusion: "Conclusion",
  },
};

const validSession = {
  payload: {
    templateId: "template-1",
    context: {},
    subject: {},
    objective: { id: "interview", subtypeId: "portrait" },
    parameters: {
      language: "fr-CH",
      toneId: "authentic",
      questionCount: 5,
      formatId: "written",
      audienceId: "general",
      additionalContext: "",
      requiredTopics: [],
      avoidedTopics: [],
      contextIntelligence: {
        enabled: false,
        selectedConnectorIds: [],
        dateRange: { preset: "last_7_days", from: "", to: "" },
        sourcePreference: "google-sheets",
        searchDepth: "shallow",
        selectedContextItems: [],
      },
    },
  },
  request: { requestType: "interview" },
  result: { title: "Title" },
  createdAt: "2026-08-08T10:00:00.000Z",
};

const validVariant = {
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
  structuredContent: {},
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

describe("content storage API routes", () => {
  beforeEach(() => {
    repo.createDraft.mockReset();
    repo.getDraft.mockReset();
    repo.updateDraft.mockReset();
    repo.createSession.mockReset();
    repo.getSession.mockReset();
    repo.createVariant.mockReset();
    repo.getVariant.mockReset();
    repo.listVariantsBySourceDocumentId.mockReset();

    repo.createDraft.mockResolvedValue({ document: validDocument, version: 1, workspaceId: "klique-os", userId: null });
    repo.getDraft.mockResolvedValue({ document: validDocument, version: 1, workspaceId: "klique-os", userId: null });
    repo.updateDraft.mockResolvedValue({ status: "updated", draft: { document: validDocument, version: 2, workspaceId: "klique-os", userId: null } });
    repo.createSession.mockResolvedValue({ sessionId: "session-1", session: validSession, workspaceId: "klique-os", userId: null, createdAt: validSession.createdAt, expiresAt: "2026-08-09T10:00:00.000Z" });
    repo.getSession.mockResolvedValue({ sessionId: "session-1", session: validSession, workspaceId: "klique-os", userId: null, createdAt: validSession.createdAt, expiresAt: "2026-08-09T10:00:00.000Z" });
    repo.createVariant.mockResolvedValue({ variant: validVariant, workspaceId: "klique-os", userId: null, createdAt: validVariant.createdAt, updatedAt: validVariant.updatedAt });
    repo.getVariant.mockResolvedValue({ variant: validVariant, workspaceId: "klique-os", userId: null, createdAt: validVariant.createdAt, updatedAt: validVariant.updatedAt });
    repo.listVariantsBySourceDocumentId.mockResolvedValue([{ variant: validVariant, workspaceId: "klique-os", userId: null, createdAt: validVariant.createdAt, updatedAt: validVariant.updatedAt }]);
  });

  it("creates and reads drafts with strict validation", async () => {
    expect(() => validateContentDocumentWriteBody({ document: validDocument })).not.toThrow();

    const response = await postDraft(makeJsonRequest({ document: validDocument }));
    expect(response.status).toBe(201);
    expect(repo.createDraft).toHaveBeenCalledTimes(1);

    const getResponse = await getDraft(new Request("http://localhost") as Request, { params: Promise.resolve({ id: "document-1" }) });
    expect(getResponse.status).toBe(200);
    expect(repo.getDraft).toHaveBeenCalledWith("document-1");
  });

  it("rejects draft update when the version is stale", async () => {
    repo.updateDraft.mockResolvedValueOnce({
      status: "version_conflict",
      currentVersion: 3,
      current: { document: validDocument, version: 3, workspaceId: "klique-os", userId: null },
    });

    const response = await patchDraft(makeJsonRequest({ document: validDocument, expectedVersion: 2 }), { params: Promise.resolve({ id: "document-1" }) });
    expect(response.status).toBe(409);
  });

  it("creates and reads sessions", async () => {
    const response = await postSessions(makeJsonRequest({ sessionId: "session-1", session: validSession, expiresAt: "2026-08-09T10:00:00.000Z" }));
    expect(response.status).toBe(201);

    const getResponse = await getSession(new Request("http://localhost") as Request, { params: Promise.resolve({ sessionId: "session-1" }) });
    expect(getResponse.status).toBe(200);
  });

  it("creates and lists variants", async () => {
    const response = await postVariants(makeJsonRequest({ variant: validVariant }));
    expect(response.status).toBe(201);

    const listResponse = await listVariants(makeNextRequest("http://localhost/api/contents/storage/variants?sourceDocumentId=document-1"));
    expect(listResponse.status).toBe(200);

    const getResponse = await getVariant(new Request("http://localhost") as Request, { params: Promise.resolve({ id: "variant-1" }) });
    expect(getResponse.status).toBe(200);
  });

  it("rejects invalid payloads", async () => {
    const response = await postDraft(makeJsonRequest({ document: { id: "" } }));
    expect(response.status).toBe(400);
  });
});
