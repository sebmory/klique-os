import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import type { ContentDocument } from "@/types/content-document";
import type { ContentVariant } from "@/types/content-variant";
import type { StoredContentResult } from "@/lib/content-storage/validation";

const { sqlMock, createContentStorageClientMock } = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

import { ContentStorageRepository } from "@/lib/content-storage/repository";

const mediaId = "11111111-1111-4111-8111-111111111111";
const mediaAccess: ContentAccessContext = {
  clerkUserId: "user-media",
  workspaceId: "workspace-1",
  mediaId,
  role: "media",
  isAdmin: false,
};
const adminAccess: ContentAccessContext = {
  clerkUserId: "user-admin",
  workspaceId: "workspace-1",
  mediaId: null,
  role: "admin",
  isAdmin: true,
};

const document = {
  id: "document-1",
  type: "interview",
  status: "draft",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:00:00.000Z",
  versions: [{ id: "version-1", source: "generation" }],
  activeVersionId: "version-1",
} as unknown as ContentDocument;

const session = {
  createdAt: "2026-09-15T10:00:00.000Z",
} as unknown as StoredContentResult;

const variant = {
  id: "variant-1",
  sourceDocumentId: "document-1",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:00:00.000Z",
} as unknown as ContentVariant;

const draftRow = (storedMediaId: string | null) => ({
  id: document.id,
  workspace_id: "workspace-1",
  user_id: "author-1",
  media_id: storedMediaId,
  type: document.type,
  status: document.status,
  source: "generation",
  created_at: document.createdAt,
  updated_at: document.updatedAt,
  payload_json: document,
  version: 1,
});

const sessionRow = (storedMediaId: string | null) => ({
  session_id: "session-1",
  workspace_id: "workspace-1",
  user_id: "author-1",
  media_id: storedMediaId,
  created_at: session.createdAt,
  expires_at: "2026-09-16T10:00:00.000Z",
  payload_json: session,
});

const variantRow = (storedMediaId: string | null) => ({
  id: variant.id,
  source_document_id: variant.sourceDocumentId,
  workspace_id: "workspace-1",
  user_id: "author-1",
  media_id: storedMediaId,
  created_at: variant.createdAt,
  updated_at: variant.updatedAt,
  payload_json: variant,
});

type SqlCall = { text: string; values: unknown[] };

const sqlCalls = (): SqlCall[] => sqlMock.mock.calls.map((call) => {
  const [strings, ...values] = call as unknown as [TemplateStringsArray, ...unknown[]];
  return { text: strings.join("?").replace(/\s+/g, " ").trim(), values };
});

const expectMediaOwnershipPredicate = (call: SqlCall) => {
  expect(call.text).toContain("workspace_id = ?");
  expect(call.text).toContain("OR media_id = ?::uuid");
  expect(call.text).not.toContain("OR user_id = ?");
  expect(call.values).toContain("workspace-1");
  expect(call.values).toContain(mediaId);
};

describe("content storage media ownership", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    createContentStorageClientMock.mockReset();
    createContentStorageClientMock.mockReturnValue(sqlMock);
  });

  it("stores the session mediaId and individual author for media creations", async () => {
    sqlMock
      .mockResolvedValueOnce([draftRow(mediaId)])
      .mockResolvedValueOnce([sessionRow(mediaId)])
      .mockResolvedValueOnce([variantRow(mediaId)]);

    await ContentStorageRepository.createDraft(document, mediaAccess);
    await ContentStorageRepository.createSession("session-1", session, sessionRow(mediaId).expires_at, mediaAccess);
    await ContentStorageRepository.createVariant(variant, mediaAccess);

    for (const call of sqlCalls()) {
      expect(call.text).toContain("media_id");
      expect(call.values).toContain("user-media");
      expect(call.values).toContain(mediaId);
    }
  });

  it("stores a null mediaId and the individual author for admin creations", async () => {
    sqlMock
      .mockResolvedValueOnce([draftRow(null)])
      .mockResolvedValueOnce([sessionRow(null)])
      .mockResolvedValueOnce([variantRow(null)]);

    await ContentStorageRepository.createDraft(document, adminAccess);
    await ContentStorageRepository.createSession("session-1", session, sessionRow(null).expires_at, adminAccess);
    await ContentStorageRepository.createVariant(variant, adminAccess);

    for (const call of sqlCalls()) {
      expect(call.text).toContain("media_id");
      expect(call.values).toContain("user-admin");
      expect(call.values).toContain(null);
    }
  });

  it("filters every media read by workspaceId and mediaId instead of clerkUserId", async () => {
    sqlMock.mockResolvedValue([]);

    await ContentStorageRepository.listDrafts(mediaAccess);
    await ContentStorageRepository.getDraft("document-1", mediaAccess);
    await ContentStorageRepository.getSession("session-1", mediaAccess);
    await ContentStorageRepository.getVariant("variant-1", mediaAccess);
    await ContentStorageRepository.listVariantsBySourceDocumentId("document-1", mediaAccess);

    expect(sqlCalls()).toHaveLength(5);
    for (const call of sqlCalls()) {
      expectMediaOwnershipPredicate(call);
    }
  });

  it("filters media draft updates by workspaceId and mediaId", async () => {
    sqlMock
      .mockResolvedValueOnce([draftRow(mediaId)])
      .mockResolvedValueOnce([{ ...draftRow(mediaId), version: 2 }]);

    const result = await ContentStorageRepository.updateDraft("document-1", document, 1, mediaAccess);
    const calls = sqlCalls();

    expect(result.status).toBe("updated");
    expect(calls).toHaveLength(2);
    expectMediaOwnershipPredicate(calls[0]);
    expectMediaOwnershipPredicate(calls[1]);
  });

  it("lets admins read historical null-media rows across their workspace", async () => {
    sqlMock.mockResolvedValue([draftRow(null)]);

    const result = await ContentStorageRepository.listDrafts(adminAccess);
    const [call] = sqlCalls();

    expect(result).toHaveLength(1);
    expect(result[0].mediaId).toBeNull();
    expect(call.text).toContain("OR media_id = ?::uuid");
    expect(call.values).toContain(true);
    expect(call.values).toContain(null);
  });
});
