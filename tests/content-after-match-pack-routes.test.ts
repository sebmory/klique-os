import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentAccessError } from "@/lib/content-storage/access";
import type { AfterMatchPackView } from "@/types/content-after-match-pack";
import type { ContentVariant } from "@/types/content-variant";

const serviceMocks = vi.hoisted(() => ({
  createOrResumeAfterMatchPack: vi.fn(),
  getAfterMatchPack: vi.fn(),
  getAfterMatchPackBySourceRevision: vi.fn(),
  resumeAfterMatchPack: vi.fn(),
}));

vi.mock("@/services/content-after-match-packs/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/content-after-match-packs/service")>();
  return { ...actual, ...serviceMocks };
});

import { AfterMatchPackError } from "@/services/content-after-match-packs/service";
import * as createRoute from "@/app/api/contents/packs/after-match/route";
import * as getRoute from "@/app/api/contents/packs/after-match/[packId]/route";
import * as resumeRoute from "@/app/api/contents/packs/after-match/[packId]/resume/route";
import { isMediaAllowedApi } from "@/proxy";

const packId = "22222222-2222-4222-8222-222222222222";
const sourceUpdatedAt = "2026-09-27T10:00:00.000Z";

const makeVariant = (type: "reel" | "stories"): ContentVariant => ({
  id: `variant-${type}`,
  sourceDocumentId: "publication-1",
  sourceDocumentType: "publication",
  sourceDocumentVersionId: "version-2",
  sourceDocumentUpdatedAt: sourceUpdatedAt,
  workspaceId: "workspace-secret",
  type,
  format: type === "reel" ? "short_video" : "stories",
  platform: "instagram",
  objective: "engagement",
  tone: "dynamic",
  audience: "supporters",
  title: `${type} title`,
  content: "Contenu utilisateur qui ne doit pas etre expose par la route du Pack.",
  structuredContent: type === "reel"
    ? {
        concept: "Recap",
        hook: "Le match",
        duration: "30 secondes",
        scenario: "Recit",
        scenes: [],
        onScreenText: [],
        callToAction: "Reagissez",
        caption: "Victoire",
        coverIdea: "Score",
      }
    : {
        sequenceTitle: "Le match",
        stories: [],
        callToAction: "Reagissez",
      },
  status: "draft",
  origin: { type: "after_match_pack", packId, deliverable: type },
  generationMetadata: {
    provider: "openai",
    model: "gpt",
    generatedAt: sourceUpdatedAt,
    generationDurationMs: 10,
    promptVersion: "1",
    variationTemplateVersion: "variation-v1",
    sourceDocumentVersionId: "version-2",
    sourceDocumentUpdatedAt: sourceUpdatedAt,
    usedContextItemIds: [],
  },
  createdAt: sourceUpdatedAt,
  updatedAt: sourceUpdatedAt,
});

const completedPack = (): AfterMatchPackView => ({
  id: packId,
  sourceDocumentId: "publication-1",
  sourceDocumentStorageVersion: 3,
  sourceDocumentVersionId: "version-2",
  sourceDocumentUpdatedAt: sourceUpdatedAt,
  status: "completed",
  reel: {
    status: "completed",
    attemptCount: 1,
    creditStatus: "consumed",
    errorCode: null,
    variant: makeVariant("reel"),
  },
  stories: {
    status: "completed",
    attemptCount: 1,
    creditStatus: "consumed",
    errorCode: null,
    variant: makeVariant("stories"),
  },
  createdAt: "2026-09-27T10:01:00.000Z",
  updatedAt: "2026-09-27T10:02:00.000Z",
  startedAt: "2026-09-27T10:01:00.000Z",
  finishedAt: "2026-09-27T10:02:00.000Z",
});

const createBody = {
  sourceDocumentId: "publication-1",
  sourceDocumentRevision: 3,
  sourceDocumentVersionId: "version-2",
  sourceDocumentUpdatedAt: sourceUpdatedAt,
};

const lookupUrl = (query = "sourceDocumentId=publication-1&sourceDocumentRevision=3") =>
  `http://localhost/api/contents/packs/after-match?${query}`;

const jsonRequest = (url: string, method: "POST" | "GET", body?: unknown): Request => new Request(url, {
  method,
  headers: body === undefined ? undefined : { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const routeParams = (id = packId) => ({ params: Promise.resolve({ packId: id }) });
const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  await response.json() as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.createOrResumeAfterMatchPack.mockResolvedValue(completedPack());
  serviceMocks.getAfterMatchPack.mockResolvedValue(completedPack());
  serviceMocks.getAfterMatchPackBySourceRevision.mockResolvedValue(completedPack());
  serviceMocks.resumeAfterMatchPack.mockResolvedValue(completedPack());
});

describe("After-match Pack API routes", () => {
  it("exports only the intended HTTP method for each route", () => {
    expect(createRoute.POST).toBeTypeOf("function");
    expect(createRoute.GET).toBeTypeOf("function");
    expect(createRoute).not.toHaveProperty("PATCH");
    expect(getRoute.GET).toBeTypeOf("function");
    expect(getRoute).not.toHaveProperty("POST");
    expect(resumeRoute.POST).toBeTypeOf("function");
    expect(resumeRoute).not.toHaveProperty("GET");
  });

  it("allows Media to read and create only on the Pack collection route", () => {
    expect(isMediaAllowedApi("/api/contents/packs/after-match", "GET")).toBe(true);
    expect(isMediaAllowedApi("/api/contents/packs/after-match", "POST")).toBe(true);
    expect(isMediaAllowedApi("/api/contents/packs/after-match", "PATCH")).toBe(false);
  });

  it.each(["pending", "generating", "partial", "completed"] as const)(
    "restores a %s Pack by source revision",
    async (status) => {
      const pack = completedPack();
      pack.status = status;
      if (status === "pending") {
        pack.reel = { status: "pending", attemptCount: 0, creditStatus: "pending", errorCode: null, variant: null };
        pack.stories = { status: "pending", attemptCount: 0, creditStatus: "pending", errorCode: null, variant: null };
      } else if (status === "generating") {
        pack.reel = { status: "generating", attemptCount: 1, creditStatus: "consumed", errorCode: null, variant: null };
        pack.stories = { status: "pending", attemptCount: 0, creditStatus: "pending", errorCode: null, variant: null };
      } else if (status === "partial") {
        pack.stories = {
          status: "failed",
          attemptCount: 1,
          creditStatus: "refunded",
          errorCode: "VARIATION_GENERATION_FAILED",
          variant: null,
        };
      }
      serviceMocks.getAfterMatchPackBySourceRevision.mockResolvedValueOnce(pack);
      const request = jsonRequest(lookupUrl(), "GET");

      const response = await createRoute.GET(request);
      const payload = await readJson(response);

      expect(response.status).toBe(200);
      expect(serviceMocks.getAfterMatchPackBySourceRevision).toHaveBeenCalledWith(request, {
        sourceDocumentId: "publication-1",
        sourceDocumentRevision: 3,
      });
      expect(payload).toMatchObject({ ok: true, pack: { id: packId, status } });
      if (status === "generating") {
        expect(payload).toMatchObject({ pack: { reel: { status: "generating" } } });
        expect((payload.pack as { reel: Record<string, unknown> }).reel).not.toHaveProperty("variantId");
      }
      expect(serviceMocks.createOrResumeAfterMatchPack).not.toHaveBeenCalled();
      expect(serviceMocks.getAfterMatchPack).not.toHaveBeenCalled();
      expect(serviceMocks.resumeAfterMatchPack).not.toHaveBeenCalled();
    }
  );

  it("returns 200 with a null Pack when no accessible Pack exists", async () => {
    serviceMocks.getAfterMatchPackBySourceRevision.mockResolvedValueOnce(null);

    const response = await createRoute.GET(jsonRequest(lookupUrl(), "GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, pack: null });
  });

  it("returns a null Pack for a different revision", async () => {
    serviceMocks.getAfterMatchPackBySourceRevision.mockResolvedValueOnce(null);
    const request = jsonRequest(lookupUrl("sourceDocumentId=publication-1&sourceDocumentRevision=4"), "GET");

    const response = await createRoute.GET(request);

    expect(response.status).toBe(200);
    expect(serviceMocks.getAfterMatchPackBySourceRevision).toHaveBeenCalledWith(request, {
      sourceDocumentId: "publication-1",
      sourceDocumentRevision: 4,
    });
    await expect(response.json()).resolves.toEqual({ ok: true, pack: null });
  });

  it.each([
    ["missing revision", "sourceDocumentId=publication-1"],
    ["missing document id", "sourceDocumentRevision=3"],
    ["extra parameter", "sourceDocumentId=publication-1&sourceDocumentRevision=3&details=1"],
    ["duplicate revision", "sourceDocumentId=publication-1&sourceDocumentRevision=3&sourceDocumentRevision=3"],
    ["duplicate document id", "sourceDocumentId=publication-1&sourceDocumentId=publication-1&sourceDocumentRevision=3"],
    ["empty document id", "sourceDocumentId=%20&sourceDocumentRevision=3"],
    ["leading-zero revision", "sourceDocumentId=publication-1&sourceDocumentRevision=03"],
    ["zero revision", "sourceDocumentId=publication-1&sourceDocumentRevision=0"],
    ["negative revision", "sourceDocumentId=publication-1&sourceDocumentRevision=-1"],
    ["decimal revision", "sourceDocumentId=publication-1&sourceDocumentRevision=1.5"],
    ["signed revision", "sourceDocumentId=publication-1&sourceDocumentRevision=%2B3"],
  ])("rejects a lookup with %s", async (_label, query) => {
    const response = await createRoute.GET(jsonRequest(lookupUrl(query), "GET"));

    expect(response.status).toBe(400);
    expect(serviceMocks.getAfterMatchPackBySourceRevision).not.toHaveBeenCalled();
  });

  it.each([
    [new ContentAccessError("UNAUTHORIZED"), 401],
    [new ContentAccessError("FORBIDDEN"), 403],
  ])("maps lookup access errors to HTTP %s", async (error, expectedStatus) => {
    serviceMocks.getAfterMatchPackBySourceRevision.mockRejectedValueOnce(error);

    const response = await createRoute.GET(jsonRequest(lookupUrl(), "GET"));

    expect(response.status).toBe(expectedStatus);
  });

  it("returns a generic 500 response for an internal lookup error", async () => {
    serviceMocks.getAfterMatchPackBySourceRevision.mockRejectedValueOnce(new Error("private database detail"));

    const response = await createRoute.GET(jsonRequest(lookupUrl(), "GET"));
    const payload = await readJson(response);

    expect(response.status).toBe(500);
    expect(payload).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    expect(JSON.stringify(payload)).not.toContain("private database detail");
  });

  it("restores the same Pack for the same identity without browser state", async () => {
    const first = await createRoute.GET(jsonRequest(lookupUrl(), "GET"));
    const second = await createRoute.GET(jsonRequest(lookupUrl(), "GET"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(serviceMocks.getAfterMatchPackBySourceRevision).toHaveBeenCalledTimes(2);
    expect(await first.json()).toEqual(await second.json());
  });

  it("returns only the public projection from the source lookup", async () => {
    const response = await createRoute.GET(jsonRequest(lookupUrl(), "GET"));
    const payload = await readJson(response);
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual({
      ok: true,
      pack: {
        id: packId,
        kind: "after_match",
        status: "completed",
        source: {
          documentId: "publication-1",
          revision: 3,
          versionId: "version-2",
          updatedAt: sourceUpdatedAt,
        },
        reel: { status: "completed", variantId: "variant-reel" },
        stories: { status: "completed", variantId: "variant-stories" },
        createdAt: "2026-09-27T10:01:00.000Z",
        updatedAt: "2026-09-27T10:02:00.000Z",
        startedAt: "2026-09-27T10:01:00.000Z",
        finishedAt: "2026-09-27T10:02:00.000Z",
      },
    });
    for (const forbidden of [
      "workspace-secret",
      "userId",
      "mediaId",
      "creditStatus",
      "idempotency",
      "Contenu utilisateur",
      "structuredContent",
      "generationMetadata",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("creates or resumes from the four strict source markers and returns 200", async () => {
    const request = jsonRequest("http://localhost/api/contents/packs/after-match", "POST", createBody);
    const response = await createRoute.POST(request);

    expect(response.status).toBe(200);
    expect(serviceMocks.createOrResumeAfterMatchPack).toHaveBeenCalledWith(request, {
      sourceDocumentId: "publication-1",
      expectedSourceDocumentStorageVersion: 3,
      expectedSourceDocumentVersionId: "version-2",
      expectedSourceDocumentUpdatedAt: sourceUpdatedAt,
    });
    expect(serviceMocks.getAfterMatchPack).not.toHaveBeenCalled();
    expect(serviceMocks.resumeAfterMatchPack).not.toHaveBeenCalled();
  });

  it("returns 200 for an idempotent repetition because the service exposes no creation flag", async () => {
    const first = await createRoute.POST(jsonRequest("http://localhost/api/contents/packs/after-match", "POST", createBody));
    const repeated = await createRoute.POST(jsonRequest("http://localhost/api/contents/packs/after-match", "POST", createBody));

    expect(first.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(serviceMocks.createOrResumeAfterMatchPack).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["extra field", { ...createBody, sourceDocument: { content: "forbidden" } }],
    ["missing field", { ...createBody, sourceDocumentVersionId: undefined }],
    ["invalid document id", { ...createBody, sourceDocumentId: "" }],
    ["non-integer revision", { ...createBody, sourceDocumentRevision: 1.5 }],
    ["invalid revision", { ...createBody, sourceDocumentRevision: 0 }],
    ["invalid date", { ...createBody, sourceDocumentUpdatedAt: "27/09/2026" }],
  ])("rejects a strict create body with %s", async (_label, body) => {
    const response = await createRoute.POST(jsonRequest("http://localhost/api/contents/packs/after-match", "POST", body));
    expect(response.status).toBe(400);
    expect(serviceMocks.createOrResumeAfterMatchPack).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/api/contents/packs/after-match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const response = await createRoute.POST(request);
    expect(response.status).toBe(400);
    expect(serviceMocks.createOrResumeAfterMatchPack).not.toHaveBeenCalled();
  });

  it("rejects query parameters on all three routes", async () => {
    const createResponse = await createRoute.POST(jsonRequest("http://localhost/api/contents/packs/after-match?retry=1", "POST", createBody));
    const getResponse = await getRoute.GET(
      jsonRequest(`http://localhost/api/contents/packs/after-match/${packId}?details=1`, "GET"),
      routeParams()
    );
    const resumeResponse = await resumeRoute.POST(
      jsonRequest(`http://localhost/api/contents/packs/after-match/${packId}/resume?force=1`, "POST", { deliverables: ["reel"] }),
      routeParams()
    );

    expect([createResponse.status, getResponse.status, resumeResponse.status]).toEqual([400, 400, 400]);
    expect(serviceMocks.createOrResumeAfterMatchPack).not.toHaveBeenCalled();
    expect(serviceMocks.getAfterMatchPack).not.toHaveBeenCalled();
    expect(serviceMocks.resumeAfterMatchPack).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID packId before GET or resume", async () => {
    const getResponse = await getRoute.GET(
      jsonRequest("http://localhost/api/contents/packs/after-match/not-an-id", "GET"),
      routeParams("not-an-id")
    );
    const resumeResponse = await resumeRoute.POST(
      jsonRequest("http://localhost/api/contents/packs/after-match/not-an-id/resume", "POST", { deliverables: ["reel"] }),
      routeParams("not-an-id")
    );

    expect(getResponse.status).toBe(400);
    expect(resumeResponse.status).toBe(400);
    expect(serviceMocks.getAfterMatchPack).not.toHaveBeenCalled();
    expect(serviceMocks.resumeAfterMatchPack).not.toHaveBeenCalled();
  });

  it("restores a projected pack after reload through GET only", async () => {
    const request = jsonRequest(`http://localhost/api/contents/packs/after-match/${packId}`, "GET");
    const response = await getRoute.GET(request, routeParams());
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(serviceMocks.getAfterMatchPack).toHaveBeenCalledWith(request, packId);
    expect(serviceMocks.createOrResumeAfterMatchPack).not.toHaveBeenCalled();
    expect(serviceMocks.resumeAfterMatchPack).not.toHaveBeenCalled();
    expect(payload).toMatchObject({ ok: true, pack: { id: packId, kind: "after_match", status: "completed" } });
  });

  it.each(["reel", "stories"] as const)("resumes only %s through the resume service", async (deliverable) => {
    const request = jsonRequest(
      `http://localhost/api/contents/packs/after-match/${packId}/resume`,
      "POST",
      { deliverables: [deliverable] }
    );
    const response = await resumeRoute.POST(request, routeParams());

    expect(response.status).toBe(200);
    expect(serviceMocks.resumeAfterMatchPack).toHaveBeenCalledWith(request, packId, [deliverable]);
    expect(serviceMocks.createOrResumeAfterMatchPack).not.toHaveBeenCalled();
    expect(serviceMocks.getAfterMatchPack).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", { deliverables: [] }],
    ["unknown", { deliverables: ["carousel"] }],
    ["duplicate", { deliverables: ["reel", "reel"] }],
    ["extra field", { deliverables: ["reel"], force: true }],
    ["missing property", {}],
  ])("rejects an invalid resume body with %s deliverables", async (_label, body) => {
    const response = await resumeRoute.POST(
      jsonRequest(`http://localhost/api/contents/packs/after-match/${packId}/resume`, "POST", body),
      routeParams()
    );
    expect(response.status).toBe(400);
    expect(serviceMocks.resumeAfterMatchPack).not.toHaveBeenCalled();
  });

  it.each([
    [new ContentAccessError("UNAUTHORIZED"), 401],
    [new ContentAccessError("FORBIDDEN"), 403],
    [new AfterMatchPackError("PACK_ACCESS_CONFLICT"), 403],
    [new AfterMatchPackError("SOURCE_NOT_FOUND"), 404],
    [new AfterMatchPackError("SOURCE_VERSION_CONFLICT"), 409],
    [new AfterMatchPackError("PACK_STATE_CONFLICT"), 409],
    [new AfterMatchPackError("AI_CREDIT_INSUFFICIENT"), 402],
    [new Error("database details must stay private"), 500],
  ])("maps a create service error to HTTP %s", async (error, expectedStatus) => {
    serviceMocks.createOrResumeAfterMatchPack.mockRejectedValueOnce(error);
    const response = await createRoute.POST(jsonRequest("http://localhost/api/contents/packs/after-match", "POST", createBody));
    const payload = await readJson(response);

    expect(response.status).toBe(expectedStatus);
    expect(JSON.stringify(payload)).not.toContain("database details");
  });

  it("maps a missing pack to 404", async () => {
    serviceMocks.getAfterMatchPack.mockRejectedValueOnce(new AfterMatchPackError("PACK_NOT_FOUND"));
    const response = await getRoute.GET(
      jsonRequest(`http://localhost/api/contents/packs/after-match/${packId}`, "GET"),
      routeParams()
    );
    expect(response.status).toBe(404);
  });

  it("returns 409 with the safe projection when requested work is already generating", async () => {
    const pack = completedPack();
    pack.status = "generating";
    pack.reel = { ...pack.reel, status: "generating", variant: null };
    serviceMocks.resumeAfterMatchPack.mockResolvedValueOnce(pack);

    const response = await resumeRoute.POST(
      jsonRequest(`http://localhost/api/contents/packs/after-match/${packId}/resume`, "POST", { deliverables: ["reel"] }),
      routeParams()
    );
    const payload = await readJson(response);

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({ ok: false, code: "PACK_IN_PROGRESS", pack: { id: packId } });
  });

  it("uses the existing 402 status when a requested deliverable lacks AI credits", async () => {
    const pack = completedPack();
    pack.status = "partial";
    pack.reel = {
      status: "failed",
      attemptCount: 1,
      creditStatus: "not_consumed",
      errorCode: "AI_CREDIT_INSUFFICIENT",
      variant: null,
    };
    serviceMocks.resumeAfterMatchPack.mockResolvedValueOnce(pack);

    const response = await resumeRoute.POST(
      jsonRequest(`http://localhost/api/contents/packs/after-match/${packId}/resume`, "POST", { deliverables: ["reel"] }),
      routeParams()
    );
    expect(response.status).toBe(402);
  });

  it("projects a partial pack with only the successful variant ID and a safe failure code", async () => {
    const pack = completedPack();
    pack.status = "partial";
    pack.stories = {
      status: "failed",
      attemptCount: 1,
      creditStatus: "refunded",
      errorCode: "VARIATION_GENERATION_FAILED",
      variant: null,
    };
    serviceMocks.getAfterMatchPack.mockResolvedValueOnce(pack);

    const response = await getRoute.GET(
      jsonRequest(`http://localhost/api/contents/packs/after-match/${packId}`, "GET"),
      routeParams()
    );
    const payload = await readJson(response);

    expect(payload).toMatchObject({
      pack: {
        reel: { status: "completed", variantId: "variant-reel" },
        stories: { status: "failed", errorCode: "VARIATION_GENERATION_FAILED" },
      },
    });
    expect((payload.pack as { stories: Record<string, unknown> }).stories).not.toHaveProperty("variantId");
  });

  it("returns a minimal projection without sensitive or internal fields", async () => {
    const response = await getRoute.GET(
      jsonRequest(`http://localhost/api/contents/packs/after-match/${packId}`, "GET"),
      routeParams()
    );
    const payload = await readJson(response);
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual({
      ok: true,
      pack: {
        id: packId,
        kind: "after_match",
        status: "completed",
        source: {
          documentId: "publication-1",
          revision: 3,
          versionId: "version-2",
          updatedAt: sourceUpdatedAt,
        },
        reel: { status: "completed", variantId: "variant-reel" },
        stories: { status: "completed", variantId: "variant-stories" },
        createdAt: "2026-09-27T10:01:00.000Z",
        updatedAt: "2026-09-27T10:02:00.000Z",
        startedAt: "2026-09-27T10:01:00.000Z",
        finishedAt: "2026-09-27T10:02:00.000Z",
      },
    });
    for (const forbidden of [
      "workspace-secret",
      "userId",
      "mediaId",
      "creditStatus",
      "idempotency",
      "Contenu utilisateur",
      "structuredContent",
      "generationMetadata",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
