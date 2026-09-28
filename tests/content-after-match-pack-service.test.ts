import { describe, expect, it, vi } from "vitest";
import type { ContentAccessContext } from "@/lib/content-storage/access";
import {
  AFTER_MATCH_PACK_STALE_AFTER_MS,
  AfterMatchPackRepository,
  type AfterMatchPackRecord,
} from "@/lib/content-after-match-packs/repository";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import {
  AfterMatchPackError,
  createAfterMatchPackService,
} from "@/services/content-after-match-packs/service";
import { ContentGenerationError } from "@/services/content-generation/errors";
import type {
  AiCreditConsumeInput,
  AiCreditConsumeResult,
  AiCreditRefundInput,
  AiCreditRefundResult,
} from "@/types/ai-usage";
import type { PublicationDocument } from "@/types/content-document";
import type {
  ContentVariationRequest,
  ContentVariationResult,
  ContentVariant,
  ContentVariantType,
} from "@/types/content-variant";

const mediaId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-09-27T12:00:00.000Z");
const sourceUpdatedAt = "2026-09-27T10:00:00.000Z";
const sourceStorageUpdatedAt = "2026-09-28T06:39:50.865Z";

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

const publication = {
  id: "publication-1",
  type: "publication",
  status: "draft",
  createdAt: sourceUpdatedAt,
  updatedAt: sourceUpdatedAt,
  versions: [{ id: "editorial-version-2", createdAt: sourceUpdatedAt, label: "Version 2", source: "manual" }],
  activeVersionId: "editorial-version-2",
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
    generatedAt: sourceUpdatedAt,
  },
  metadata: {},
  contextUsage: {
    usedContextItemIds: [],
    usedSourceIds: [],
    unusedSelectedContextItemIds: [],
    externalContextUsed: false,
    selectedItems: [],
  },
  sections: {
    title: "Victoire a domicile",
    editorialAngle: "Une victoire collective",
    hook: "Trois points au bout du suspense.",
    text: "Klique FC s impose deux buts a un.",
    cta: "Votre moment du match ?",
    hashtags: ["KliqueFC"],
    visualSuggestion: "Le groupe devant la tribune",
    editorialNote: "Rester factuel",
  },
  sourceContext: {
    afterMatch: {
      opponent: "FC Exemple",
      result: "2-1",
      competition: "Championnat",
      matchDate: "2026-09-26",
      keyFacts: "But decisif a la 88e minute",
      nextFixture: "Coupe, mercredi",
    },
  },
} as unknown as PublicationDocument;

const generationResult = (type: "reel" | "stories"): ContentVariationResult => ({
  id: `engine-${type}`,
  type,
  title: `${type} apres-match`,
  summary: "Resume",
  content: `Contenu ${type}`,
  structuredContent: type === "reel"
    ? {
        concept: "Recap",
        hook: "Le match en images",
        duration: "30 secondes",
        scenario: "Recit chronologique",
        scenes: [],
        onScreenText: [],
        callToAction: "Reagissez",
        caption: "Victoire",
        coverIdea: "Score final",
      }
    : {
        sequenceTitle: "Le match",
        stories: [],
        callToAction: "Reagissez",
      },
  generationMetadata: {
    provider: "openai",
    model: "gpt",
    generatedAt: now.toISOString(),
    generationDurationMs: 10,
    promptVersion: "1",
    variationTemplateVersion: "variation-v1",
    sourceDocumentVersionId: publication.activeVersionId,
    sourceDocumentUpdatedAt: publication.updatedAt,
    usedContextItemIds: [],
  },
});

const requirePackDeliverable = (variationType: ContentVariantType): "reel" | "stories" => {
  if (variationType !== "reel" && variationType !== "stories") {
    throw new Error(`Type de livrable Pack inattendu dans le test: ${variationType}`);
  }
  return variationType;
};

const makePack = (overrides: Partial<AfterMatchPackRecord> = {}): AfterMatchPackRecord => ({
  id: "22222222-2222-4222-8222-222222222222",
  workspaceId: mediaAccess.workspaceId,
  userId: mediaAccess.clerkUserId,
  mediaId,
  sourceDocumentId: publication.id,
  sourceDocumentStorageVersion: 3,
  sourceDocumentVersionId: publication.activeVersionId,
  sourceDocumentUpdatedAt: sourceStorageUpdatedAt,
  status: "pending",
  reelStatus: "pending",
  storiesStatus: "pending",
  reelAttemptCount: 0,
  storiesAttemptCount: 0,
  reelVariantId: null,
  storiesVariantId: null,
  reelCreditStatus: "pending",
  storiesCreditStatus: "pending",
  reelCreditIdempotencyKey: null,
  storiesCreditIdempotencyKey: null,
  reelErrorCode: null,
  storiesErrorCode: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  startedAt: null,
  finishedAt: null,
  ...overrides,
});

const sourceInput = {
  sourceDocumentId: publication.id,
  expectedSourceDocumentStorageVersion: 3,
  expectedSourceDocumentVersionId: publication.activeVersionId,
  expectedSourceDocumentUpdatedAt: sourceStorageUpdatedAt,
};

const sourceLookupInput = {
  sourceDocumentId: publication.id,
  sourceDocumentRevision: 3,
};

type HarnessOptions = {
  access?: ContentAccessContext;
  pack?: AfterMatchPackRecord;
  sourceDocument?: PublicationDocument | null;
  failGenerationFor?: "reel" | "stories";
  failPersistenceFor?: "reel" | "stories";
  failRefund?: boolean;
};

const makeHarness = (options: HarnessOptions = {}) => {
  const access = options.access ?? mediaAccess;
  let pack = options.pack ?? makePack({
    userId: access.clerkUserId,
    mediaId: access.isAdmin ? null : access.mediaId ?? null,
  });
  const variants = new Map<string, ContentVariant>();
  const sourceDocument = options.sourceDocument === undefined ? publication : options.sourceDocument;

  const getState = (deliverable: "reel" | "stories") => deliverable === "reel"
    ? {
        status: pack.reelStatus,
        attemptCount: pack.reelAttemptCount,
        creditStatus: pack.reelCreditStatus,
        key: pack.reelCreditIdempotencyKey,
      }
    : {
        status: pack.storiesStatus,
        attemptCount: pack.storiesAttemptCount,
        creditStatus: pack.storiesCreditStatus,
        key: pack.storiesCreditIdempotencyKey,
      };

  const recalculate = () => {
    if (pack.reelStatus === "completed" && pack.storiesStatus === "completed") pack.status = "completed";
    else if (
      (pack.reelStatus === "completed" && pack.storiesStatus === "failed")
      || (pack.storiesStatus === "completed" && pack.reelStatus === "failed")
    ) pack.status = "partial";
    else if (pack.reelStatus === "failed" && pack.storiesStatus === "failed") pack.status = "failed";
    else pack.status = "generating";
  };

  const packRepository = {
    ...AfterMatchPackRepository,
    createOrGet: vi.fn(async () => pack),
    getById: vi.fn<typeof AfterMatchPackRepository.getById>(async () => pack),
    getBySourceRevision: vi.fn<typeof AfterMatchPackRepository.getBySourceRevision>(async () => pack),
    claimDeliverable: vi.fn(async (_packId: string, deliverable: "reel" | "stories", staleBefore: string) => {
      const state = getState(deliverable);
      if (state.status === "completed") return { status: "completed" as const, pack };
      if (state.creditStatus === "refund_pending") return { status: "needs_reconciliation" as const, pack };
      if (state.status === "generating") {
        return pack.startedAt !== null && Date.parse(pack.startedAt) <= Date.parse(staleBefore)
          ? { status: "needs_reconciliation" as const, pack }
          : { status: "in_progress" as const, pack };
      }

      const attemptCount = state.attemptCount + 1;
      const key = `content:after_match_pack:${pack.id}:${deliverable}:attempt:${attemptCount}`;
      if (deliverable === "reel") {
        pack = {
          ...pack,
          status: "generating",
          reelStatus: "generating",
          reelAttemptCount: attemptCount,
          reelCreditStatus: access.isAdmin ? "not_required" : "not_consumed",
          reelCreditIdempotencyKey: key,
          reelErrorCode: null,
          updatedAt: now.toISOString(),
          startedAt: now.toISOString(),
          finishedAt: null,
        };
      } else {
        pack = {
          ...pack,
          status: "generating",
          storiesStatus: "generating",
          storiesAttemptCount: attemptCount,
          storiesCreditStatus: access.isAdmin ? "not_required" : "not_consumed",
          storiesCreditIdempotencyKey: key,
          storiesErrorCode: null,
          updatedAt: now.toISOString(),
          startedAt: now.toISOString(),
          finishedAt: null,
        };
      }
      return { status: "claimed" as const, pack };
    }),
    markCreditConsumed: vi.fn(async (args: { deliverable: "reel" | "stories" }) => {
      pack = args.deliverable === "reel"
        ? { ...pack, reelCreditStatus: "consumed" }
        : { ...pack, storiesCreditStatus: "consumed" };
      return pack;
    }),
    completeDeliverableWithVariant: vi.fn(async (args: { deliverable: "reel" | "stories"; variant: ContentVariant }) => {
      if (options.failPersistenceFor === args.deliverable) throw new Error("database unavailable");
      variants.set(args.variant.id, args.variant);
      pack = args.deliverable === "reel"
        ? { ...pack, reelStatus: "completed", reelVariantId: args.variant.id }
        : { ...pack, storiesStatus: "completed", storiesVariantId: args.variant.id };
      recalculate();
      return pack;
    }),
    failDeliverable: vi.fn(async (args: {
      deliverable: "reel" | "stories";
      errorCode: string;
      creditStatus: AfterMatchPackRecord["reelCreditStatus"];
    }) => {
      pack = args.deliverable === "reel"
        ? { ...pack, reelStatus: "failed", reelErrorCode: args.errorCode, reelCreditStatus: args.creditStatus }
        : { ...pack, storiesStatus: "failed", storiesErrorCode: args.errorCode, storiesCreditStatus: args.creditStatus };
      recalculate();
      return pack;
    }),
    markCreditRefunded: vi.fn(async (args: { deliverable: "reel" | "stories" }) => {
      pack = args.deliverable === "reel"
        ? { ...pack, reelCreditStatus: "refunded" }
        : { ...pack, storiesCreditStatus: "refunded" };
      return pack;
    }),
  };

  const contentRepository = {
    ...ContentStorageRepository,
    getDraft: vi.fn(async () => sourceDocument
      ? { document: sourceDocument, version: 3, storageUpdatedAt: sourceStorageUpdatedAt, workspaceId: access.workspaceId, userId: access.clerkUserId, mediaId: access.mediaId ?? null }
      : null),
    getVariant: vi.fn(async (id: string) => {
      const variant = variants.get(id);
      return variant
        ? { variant, workspaceId: access.workspaceId, userId: access.clerkUserId, mediaId: access.mediaId ?? null, createdAt: variant.createdAt, updatedAt: variant.updatedAt }
        : null;
    }),
  };

  const consumeCredit = vi.fn<(input: AiCreditConsumeInput) => Promise<AiCreditConsumeResult>>(async () => ({
    status: "consumed" as const,
    transactionId: randomId("consume"),
    periodId: "period-1",
    remainingBalance: 8,
  }));
  const refundCredit = vi.fn<(input: AiCreditRefundInput) => Promise<AiCreditRefundResult>>(async () => {
    if (options.failRefund) throw new Error("ledger unavailable");
    return {
      status: "refunded" as const,
      transactionId: randomId("refund"),
      periodId: "period-1",
      remainingBalance: 9,
    };
  });
  const generateVariation = vi.fn<(request: ContentVariationRequest) => Promise<ContentVariationResult>>(async (request) => {
    const deliverable = requirePackDeliverable(request.variationType);
    if (options.failGenerationFor === deliverable) {
      throw new ContentGenerationError("VARIATION_GENERATION_FAILED", "provider detail that must not be stored");
    }
    return generationResult(deliverable);
  });
  let variantSequence = 0;
  const createVariantId = vi.fn(() => `variant-pack-${++variantSequence}`);

  const service = createAfterMatchPackService({
    now: () => now,
    createVariantId,
    requireAccess: vi.fn(async () => access),
    packRepository,
    contentRepository,
    consumeCredit,
    refundCredit,
    generateVariation,
  });

  return {
    service,
    packRepository,
    contentRepository,
    consumeCredit,
    refundCredit,
    generateVariation,
    createVariantId,
    variants,
    getPack: () => pack,
  };
};

let sequence = 0;
const randomId = (prefix: string) => `${prefix}-${++sequence}`;
const request = new Request("http://localhost/internal");

describe("After-match Pack V1 service", () => {
  it("creates a pack and generates Reel and Stories", async () => {
    const harness = makeHarness();
    const result = await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(result.status).toBe("completed");
    expect(result.reel.variant?.type).toBe("reel");
    expect(result.stories.variant?.type).toBe("stories");
    expect(harness.generateVariation).toHaveBeenCalledTimes(2);
  });

  it("accepts the mapped SQL instant with production millisecond precision", async () => {
    const harness = makeHarness();

    await expect(harness.service.createOrResumeAfterMatchPack(request, sourceInput)).resolves.toBeDefined();
    expect(harness.packRepository.createOrGet).toHaveBeenCalledWith(
      expect.objectContaining({ sourceDocumentUpdatedAt: "2026-09-28T06:39:50.865Z" }),
      mediaAccess
    );
  });

  it("rejects an absent source", async () => {
    const harness = makeHarness({ sourceDocument: null });
    await expect(harness.service.createOrResumeAfterMatchPack(request, sourceInput))
      .rejects.toMatchObject({ code: "SOURCE_NOT_FOUND" });
  });

  it("rejects a source that is not a Publication", async () => {
    const harness = makeHarness({ sourceDocument: { ...publication, type: "interview" } as never });
    await expect(harness.service.createOrResumeAfterMatchPack(request, sourceInput))
      .rejects.toMatchObject({ code: "SOURCE_NOT_PUBLICATION" });
  });

  it("rejects a Publication without structured After-match context", async () => {
    const harness = makeHarness({ sourceDocument: { ...publication, sourceContext: undefined } });
    await expect(harness.service.createOrResumeAfterMatchPack(request, sourceInput))
      .rejects.toMatchObject({ code: "SOURCE_NOT_AFTER_MATCH" });
  });

  it.each([
    { expectedSourceDocumentStorageVersion: 2 },
    { expectedSourceDocumentVersionId: "old-editorial-version" },
    { expectedSourceDocumentUpdatedAt: "2026-09-26T10:00:00.000Z" },
  ])("rejects a modified source for stale expectation %#", async (staleField) => {
    const harness = makeHarness();
    await expect(harness.service.createOrResumeAfterMatchPack(request, { ...sourceInput, ...staleField }))
      .rejects.toMatchObject({ code: "SOURCE_VERSION_CONFLICT" });
  });

  it("stores the Pack origin on both variants", async () => {
    const harness = makeHarness();
    const result = await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(result.reel.variant?.origin).toEqual({
      type: "after_match_pack",
      packId: result.id,
      deliverable: "reel",
    });
    expect(result.stories.variant?.origin).toEqual({
      type: "after_match_pack",
      packId: result.id,
      deliverable: "stories",
    });
  });

  it("deduplicates a double click while both deliverables are recent", async () => {
    const resolvers: Array<(result: ContentVariationResult) => void> = [];
    const harness = makeHarness();
    harness.generateVariation.mockImplementation((variation) => new Promise((resolve) => {
      const deliverable = requirePackDeliverable(variation.variationType);
      resolvers.push(() => resolve(generationResult(deliverable)));
    }));

    const first = harness.service.createOrResumeAfterMatchPack(request, sourceInput);
    await vi.waitFor(() => expect(harness.generateVariation).toHaveBeenCalledTimes(2));
    const duplicate = await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(duplicate.status).toBe("generating");
    expect(harness.generateVariation).toHaveBeenCalledTimes(2);
    resolvers.forEach((resolve, index) => resolve(index === 0 ? generationResult("reel") : generationResult("stories")));
    await first;
  });

  it("serializes concurrent claims to one AI call per deliverable and attempt", async () => {
    const harness = makeHarness();
    await Promise.all([
      harness.service.createOrResumeAfterMatchPack(request, sourceInput),
      harness.service.createOrResumeAfterMatchPack(request, sourceInput),
    ]);

    expect(harness.generateVariation).toHaveBeenCalledTimes(2);
    expect(harness.getPack().reelAttemptCount).toBe(1);
    expect(harness.getPack().storiesAttemptCount).toBe(1);
  });

  it("does not turn an identical HTTP-level retry into a new paid attempt", async () => {
    const harness = makeHarness({ failGenerationFor: "reel" });
    await harness.service.createOrResumeAfterMatchPack(request, sourceInput);
    await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(harness.generateVariation).toHaveBeenCalledTimes(2);
    expect(harness.consumeCredit).toHaveBeenCalledTimes(2);
    expect(harness.getPack().reelAttemptCount).toBe(1);
  });

  it("keeps a successful Reel when Stories fail", async () => {
    const harness = makeHarness({ failGenerationFor: "stories" });
    const result = await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(result.status).toBe("partial");
    expect(result.reel.status).toBe("completed");
    expect(result.stories.status).toBe("failed");
  });

  it("keeps successful Stories when Reel fails", async () => {
    const harness = makeHarness({ failGenerationFor: "reel" });
    const result = await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(result.status).toBe("partial");
    expect(result.stories.status).toBe("completed");
    expect(result.reel.status).toBe("failed");
  });

  it("resumes only the missing deliverable", async () => {
    const existingVariant = { ...generationResult("reel"), id: "variant-reel-existing" } as unknown as ContentVariant;
    const harness = makeHarness({
      pack: makePack({
        status: "partial",
        reelStatus: "completed",
        reelAttemptCount: 1,
        reelVariantId: existingVariant.id,
        reelCreditStatus: "consumed",
        storiesStatus: "failed",
        storiesAttemptCount: 1,
        storiesCreditStatus: "refunded",
        storiesCreditIdempotencyKey: "old-stories-key",
        storiesErrorCode: "VARIATION_GENERATION_FAILED",
        startedAt: sourceUpdatedAt,
        finishedAt: sourceUpdatedAt,
      }),
    });
    harness.variants.set(existingVariant.id, existingVariant);

    await harness.service.resumeAfterMatchPack(request, harness.getPack().id, ["stories"]);
    expect(harness.generateVariation).toHaveBeenCalledTimes(1);
    expect(harness.generateVariation.mock.calls[0][0].variationType).toBe("stories");
  });

  it("does not call AI again for an already completed deliverable", async () => {
    const harness = makeHarness({ pack: makePack({ reelStatus: "completed", reelVariantId: "variant-reel" }) });
    await harness.service.resumeAfterMatchPack(request, harness.getPack().id, ["reel"]);
    expect(harness.generateVariation).not.toHaveBeenCalled();
  });

  it("charges Media exactly once for each generated deliverable", async () => {
    const harness = makeHarness();
    await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(harness.consumeCredit).toHaveBeenCalledTimes(2);
    expect(harness.consumeCredit.mock.calls.map(([input]) => input.operation)).toEqual(["variation", "variation"]);
    expect(new Set(harness.consumeCredit.mock.calls.map(([input]) => input.idempotencyKey)).size).toBe(2);
  });

  it("does not charge roles that the current variation operation does not charge", async () => {
    const harness = makeHarness({ access: adminAccess });
    const result = await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(harness.consumeCredit).not.toHaveBeenCalled();
    expect(result.reel.creditStatus).toBe("not_required");
    expect(result.stories.creditStatus).toBe("not_required");
  });

  it("refunds idempotently after an AI failure", async () => {
    const harness = makeHarness({ failGenerationFor: "reel" });
    await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(harness.refundCredit).toHaveBeenCalledTimes(1);
    const firstRefundCall = harness.refundCredit.mock.calls[0];
    expect(firstRefundCall).toBeDefined();
    if (!firstRefundCall) throw new Error("Appel de remboursement attendu.");
    expect(firstRefundCall[0].originalIdempotencyKey).toContain(":reel:attempt:1");
    expect(harness.getPack().reelCreditStatus).toBe("refunded");
  });

  it("refunds after variant persistence fails", async () => {
    const harness = makeHarness({ failPersistenceFor: "stories" });
    const result = await harness.service.createOrResumeAfterMatchPack(request, sourceInput);

    expect(harness.refundCredit).toHaveBeenCalledTimes(1);
    expect(result.stories.errorCode).toBe("VARIANT_PERSISTENCE_FAILED");
    expect(result.stories.creditStatus).toBe("refunded");
  });

  it("keeps refund_pending and exposes a refund failure", async () => {
    const harness = makeHarness({ failGenerationFor: "reel", failRefund: true });
    await expect(harness.service.createOrResumeAfterMatchPack(request, sourceInput))
      .rejects.toEqual(new AfterMatchPackError("CREDIT_REFUND_FAILED"));
    expect(harness.getPack().reelCreditStatus).toBe("refund_pending");
  });

  it("reconciles and retries a stale generation", async () => {
    const staleUpdatedAt = new Date(now.getTime() - AFTER_MATCH_PACK_STALE_AFTER_MS - 1).toISOString();
    const harness = makeHarness({
      pack: makePack({
        status: "generating",
        reelStatus: "generating",
        reelAttemptCount: 1,
        reelCreditStatus: "consumed",
        reelCreditIdempotencyKey: "content:after_match_pack:pack:reel:attempt:1",
        storiesStatus: "completed",
        storiesVariantId: "variant-stories-existing",
        storiesAttemptCount: 1,
        storiesCreditStatus: "consumed",
        updatedAt: staleUpdatedAt,
        startedAt: staleUpdatedAt,
      }),
    });

    await harness.service.resumeAfterMatchPack(request, harness.getPack().id, ["reel"]);
    expect(harness.refundCredit).toHaveBeenCalledWith(expect.objectContaining({
      originalIdempotencyKey: "content:after_match_pack:pack:reel:attempt:1",
    }));
    expect(harness.getPack().reelAttemptCount).toBe(2);
    expect(harness.generateVariation).toHaveBeenCalledTimes(1);
  });

  it("enforces tenant, user and media isolation through repository-scoped reads", async () => {
    const harness = makeHarness();
    harness.packRepository.getById.mockResolvedValueOnce(null);

    await expect(harness.service.getAfterMatchPack(request, harness.getPack().id))
      .rejects.toMatchObject({ code: "PACK_NOT_FOUND" });
  });

  it("restores a Pack by source revision and hydrates only its present variants", async () => {
    const reelVariant = {
      ...generationResult("reel"),
      id: "variant-reel-existing",
      sourceDocumentId: publication.id,
    } as unknown as ContentVariant;
    const harness = makeHarness({
      pack: makePack({
        status: "partial",
        reelStatus: "completed",
        reelAttemptCount: 1,
        reelVariantId: reelVariant.id,
        reelCreditStatus: "consumed",
        storiesStatus: "failed",
        storiesAttemptCount: 1,
        storiesCreditStatus: "refunded",
        storiesErrorCode: "VARIATION_GENERATION_FAILED",
      }),
    });
    harness.variants.set(reelVariant.id, reelVariant);

    const restored = await harness.service.getAfterMatchPackBySourceRevision(request, sourceLookupInput);

    expect(restored?.status).toBe("partial");
    expect(restored?.reel.variant?.id).toBe(reelVariant.id);
    expect(restored?.stories.variant).toBeNull();
    expect(harness.packRepository.getBySourceRevision).toHaveBeenCalledWith(
      publication.id,
      3,
      mediaAccess
    );
    expect(harness.contentRepository.getVariant).toHaveBeenCalledTimes(1);
  });

  it("returns null for an inaccessible or absent Pack without any side effect", async () => {
    const harness = makeHarness();
    harness.packRepository.getBySourceRevision.mockResolvedValueOnce(null);

    await expect(harness.service.getAfterMatchPackBySourceRevision(request, sourceLookupInput))
      .resolves.toBeNull();

    expect(harness.packRepository.createOrGet).not.toHaveBeenCalled();
    expect(harness.packRepository.getById).not.toHaveBeenCalled();
    expect(harness.packRepository.claimDeliverable).not.toHaveBeenCalled();
    expect(harness.packRepository.markCreditConsumed).not.toHaveBeenCalled();
    expect(harness.packRepository.completeDeliverableWithVariant).not.toHaveBeenCalled();
    expect(harness.packRepository.failDeliverable).not.toHaveBeenCalled();
    expect(harness.packRepository.markCreditRefunded).not.toHaveBeenCalled();
    expect(harness.contentRepository.getDraft).not.toHaveBeenCalled();
    expect(harness.contentRepository.getVariant).not.toHaveBeenCalled();
    expect(harness.consumeCredit).not.toHaveBeenCalled();
    expect(harness.refundCredit).not.toHaveBeenCalled();
    expect(harness.generateVariation).not.toHaveBeenCalled();
    expect(harness.createVariantId).not.toHaveBeenCalled();
  });

  it("restores both persisted variants after reload without exposing credit keys", async () => {
    const harness = makeHarness();
    const created = await harness.service.createOrResumeAfterMatchPack(request, sourceInput);
    const restored = await harness.service.getAfterMatchPack(request, created.id);

    expect(restored.reel.variant?.id).toBe(created.reel.variant?.id);
    expect(restored.stories.variant?.id).toBe(created.stories.variant?.id);
    expect(restored).not.toHaveProperty("reelCreditIdempotencyKey");
    expect(restored.reel).not.toHaveProperty("creditIdempotencyKey");
  });

  it("keeps historical variants without origin readable", async () => {
    const historical = {
      ...generationResult("reel"),
      id: "variant-historical",
      sourceDocumentId: publication.id,
    } as unknown as ContentVariant;
    const harness = makeHarness({
      pack: makePack({
        status: "completed",
        reelStatus: "completed",
        storiesStatus: "completed",
        reelVariantId: historical.id,
        storiesVariantId: historical.id,
      }),
    });
    harness.variants.set(historical.id, historical);

    const restored = await harness.service.getAfterMatchPack(request, harness.getPack().id);
    expect(restored.reel.variant?.origin).toBeUndefined();
  });
});