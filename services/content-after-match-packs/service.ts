import { randomUUID } from "node:crypto";
import { consumeAiCredit, refundAiCredit } from "@/lib/ai-usage/credit-repository";
import {
  AFTER_MATCH_PACK_STALE_AFTER_MS,
  AfterMatchPackRepository,
  type AfterMatchPackRecord,
  type ClaimDeliverableResult,
} from "@/lib/content-after-match-packs/repository";
import { requireContentAccess, type ContentAccessContext } from "@/lib/content-storage/access";
import { ContentStorageRepository } from "@/lib/content-storage/repository";
import { ContentGenerationError } from "@/services/content-generation/errors";
import { runContentVariationEngine } from "@/services/content-intelligence/variation-engine";
import { validateVariationRequest } from "@/services/content-variants/request-validation";
import { buildSourceDocumentSnapshot } from "@/services/content-variants/source-snapshot";
import type {
  AfterMatchPackCreditStatus,
  AfterMatchPackDeliverable,
  AfterMatchPackView,
  CreateOrResumeAfterMatchPackInput,
  GetAfterMatchPackBySourceRevisionInput,
} from "@/types/content-after-match-pack";
import type { PublicationDocument } from "@/types/content-document";
import type {
  ContentVariationRequest,
  ContentVariant,
  ContentVariantObjective,
  ContentVariantTone,
} from "@/types/content-variant";

export { AFTER_MATCH_PACK_STALE_AFTER_MS } from "@/lib/content-after-match-packs/repository";

const variationObjectives = new Set<ContentVariantObjective>([
  "inform",
  "inspire",
  "present",
  "promote",
  "tease",
  "engagement",
  "highlight_subject",
  "highlight_partner",
  "traffic",
  "free",
]);

const variationTones = new Set<ContentVariantTone>([
  "institutional",
  "journalistic",
  "authentic",
  "inspiring",
  "dynamic",
  "casual",
  "free",
]);

const safeGenerationErrorCodes = new Set([
  "INVALID_VARIATION_REQUEST",
  "SOURCE_DOCUMENT_MISSING",
  "VARIATION_TEMPLATE_NOT_FOUND",
  "PROVIDER_NOT_AVAILABLE",
  "PROVIDER_NOT_CONFIGURED",
  "RATE_LIMITED",
  "PROVIDER_REFUSAL",
  "EMPTY_PROVIDER_RESPONSE",
  "INCOMPLETE_PROVIDER_RESPONSE",
  "INVALID_PROVIDER_RESPONSE",
  "INVALID_VARIATION_RESPONSE",
  "VARIATION_GENERATION_FAILED",
  "QUOTE_NOT_FOUND",
]);

export type AfterMatchPackErrorCode =
  | "SOURCE_NOT_FOUND"
  | "SOURCE_NOT_PUBLICATION"
  | "SOURCE_NOT_AFTER_MATCH"
  | "SOURCE_VERSION_CONFLICT"
  | "PACK_NOT_FOUND"
  | "PACK_ACCESS_CONFLICT"
  | "PACK_STATE_CONFLICT"
  | "AI_CREDIT_INSUFFICIENT"
  | "AI_CREDIT_NO_ACTIVE_PERIOD"
  | "CREDIT_REFUND_FAILED";

export class AfterMatchPackError extends Error {
  constructor(public readonly code: AfterMatchPackErrorCode) {
    super(code);
    this.name = "AfterMatchPackError";
  }
}

type PersistedPublication = {
  document: PublicationDocument;
  storageVersion: number;
  storageUpdatedAt: string;
};

type ClaimedAttempt = {
  pack: AfterMatchPackRecord;
  deliverable: AfterMatchPackDeliverable;
  attemptCount: number;
  creditStatus: AfterMatchPackCreditStatus;
  creditIdempotencyKey: string;
};

type ServiceDependencies = {
  now: () => Date;
  createVariantId: () => string;
  requireAccess: typeof requireContentAccess;
  packRepository: typeof AfterMatchPackRepository;
  contentRepository: typeof ContentStorageRepository;
  consumeCredit: typeof consumeAiCredit;
  refundCredit: typeof refundAiCredit;
  generateVariation: typeof runContentVariationEngine;
};

const defaultDependencies: ServiceDependencies = {
  now: () => new Date(),
  createVariantId: () => `variant-${randomUUID()}`,
  requireAccess: requireContentAccess,
  packRepository: AfterMatchPackRepository,
  contentRepository: ContentStorageRepository,
  consumeCredit: consumeAiCredit,
  refundCredit: refundAiCredit,
  generateVariation: runContentVariationEngine,
};

const normalize = (value: unknown): string => String(value ?? "").trim();

const sameInstant = (left: string, right: string): boolean => {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
};

const getDeliverableState = (pack: AfterMatchPackRecord, deliverable: AfterMatchPackDeliverable) =>
  deliverable === "reel"
    ? {
        status: pack.reelStatus,
        attemptCount: pack.reelAttemptCount,
        creditStatus: pack.reelCreditStatus,
        creditIdempotencyKey: pack.reelCreditIdempotencyKey,
      }
    : {
        status: pack.storiesStatus,
        attemptCount: pack.storiesAttemptCount,
        creditStatus: pack.storiesCreditStatus,
        creditIdempotencyKey: pack.storiesCreditIdempotencyKey,
      };

const toSafeGenerationErrorCode = (error: unknown): string => {
  if (error instanceof ContentGenerationError && safeGenerationErrorCodes.has(error.code)) {
    return error.code;
  }
  return "VARIATION_GENERATION_FAILED";
};

const resolveObjective = (document: PublicationDocument): ContentVariantObjective => {
  const objective = normalize(document.sidebar.objective) as ContentVariantObjective;
  return variationObjectives.has(objective) ? objective : "engagement";
};

const resolveTone = (document: PublicationDocument): ContentVariantTone => {
  const tone = normalize(document.sidebar.tone) as ContentVariantTone;
  return variationTones.has(tone) ? tone : "authentic";
};

const buildVariationRequest = (
  document: PublicationDocument,
  deliverable: AfterMatchPackDeliverable,
  workspaceId: string
): ContentVariationRequest => {
  const sourceDocument = buildSourceDocumentSnapshot({
    document,
    includePrivateNotes: false,
    includedPrivateNoteQuestionIds: [],
  });
  const audience = normalize(document.sidebar.audience) || "supporters et communaute";

  return validateVariationRequest({
    sourceDocument,
    sourceDocumentId: document.id,
    sourceDocumentType: document.type,
    selectedContextItems: sourceDocument.selectedContextItems,
    variationType: deliverable,
    platform: "instagram",
    objective: resolveObjective(document),
    tone: resolveTone(document),
    audience,
    constraints: {
      language: "fr-CH",
      audience,
      length: "medium",
      durationSeconds: deliverable === "reel" ? 30 : undefined,
      storyCount: deliverable === "stories" ? 4 : undefined,
      includeTopics: [],
      avoidTopics: [],
      includePrivateNotes: false,
      includedPrivateNoteQuestionIds: [],
    },
    language: "fr-CH",
    workspaceId,
  });
};

const buildVariant = (args: {
  id: string;
  packId: string;
  deliverable: AfterMatchPackDeliverable;
  document: PublicationDocument;
  request: ContentVariationRequest;
  result: Awaited<ReturnType<typeof runContentVariationEngine>>;
  now: string;
}): ContentVariant => ({
  id: args.id,
  sourceDocumentId: args.document.id,
  sourceDocumentType: args.document.type,
  sourceDocumentVersionId: args.document.activeVersionId,
  sourceDocumentUpdatedAt: args.document.updatedAt,
  workspaceId: args.request.workspaceId,
  type: args.deliverable,
  format: args.deliverable === "reel" ? "short_video" : "stories",
  platform: args.request.platform,
  objective: args.request.objective,
  tone: args.request.tone,
  audience: args.request.audience,
  title: args.result.title,
  content: args.result.content,
  structuredContent: args.result.structuredContent,
  status: "draft",
  origin: {
    type: "after_match_pack",
    packId: args.packId,
    deliverable: args.deliverable,
  },
  generationMetadata: args.result.generationMetadata,
  createdAt: args.now,
  updatedAt: args.now,
});

const assertExpectedSource = (
  draft: Awaited<ReturnType<typeof ContentStorageRepository.getDraft>>,
  expected: CreateOrResumeAfterMatchPackInput
): PersistedPublication => {
  if (!draft) throw new AfterMatchPackError("SOURCE_NOT_FOUND");
  if (draft.document.type !== "publication") throw new AfterMatchPackError("SOURCE_NOT_PUBLICATION");
  if (!draft.document.sourceContext?.afterMatch) throw new AfterMatchPackError("SOURCE_NOT_AFTER_MATCH");

  if (
    draft.version !== expected.expectedSourceDocumentStorageVersion
    || draft.document.activeVersionId !== normalize(expected.expectedSourceDocumentVersionId)
    || !sameInstant(draft.storageUpdatedAt, expected.expectedSourceDocumentUpdatedAt)
  ) {
    throw new AfterMatchPackError("SOURCE_VERSION_CONFLICT");
  }

  return { document: draft.document, storageVersion: draft.version, storageUpdatedAt: draft.storageUpdatedAt };
};

const assertPackSource = async (
  pack: AfterMatchPackRecord,
  access: ContentAccessContext,
  dependencies: ServiceDependencies
): Promise<PersistedPublication> => {
  const draft = await dependencies.contentRepository.getDraft(pack.sourceDocumentId, access);
  return assertExpectedSource(draft, {
    sourceDocumentId: pack.sourceDocumentId,
    expectedSourceDocumentStorageVersion: pack.sourceDocumentStorageVersion,
    expectedSourceDocumentVersionId: pack.sourceDocumentVersionId,
    expectedSourceDocumentUpdatedAt: pack.sourceDocumentUpdatedAt,
  });
};

const getPublicPack = async (
  pack: AfterMatchPackRecord,
  access: ContentAccessContext,
  dependencies: ServiceDependencies
): Promise<AfterMatchPackView> => {
  const [reelVariantRow, storiesVariantRow] = await Promise.all([
    pack.reelVariantId ? dependencies.contentRepository.getVariant(pack.reelVariantId, access) : null,
    pack.storiesVariantId ? dependencies.contentRepository.getVariant(pack.storiesVariantId, access) : null,
  ]);

  return {
    id: pack.id,
    sourceDocumentId: pack.sourceDocumentId,
    sourceDocumentStorageVersion: pack.sourceDocumentStorageVersion,
    sourceDocumentVersionId: pack.sourceDocumentVersionId,
    sourceDocumentUpdatedAt: pack.sourceDocumentUpdatedAt,
    status: pack.status,
    reel: {
      status: pack.reelStatus,
      attemptCount: pack.reelAttemptCount,
      creditStatus: pack.reelCreditStatus,
      errorCode: pack.reelErrorCode,
      variant: reelVariantRow?.variant ?? null,
    },
    stories: {
      status: pack.storiesStatus,
      attemptCount: pack.storiesAttemptCount,
      creditStatus: pack.storiesCreditStatus,
      errorCode: pack.storiesErrorCode,
      variant: storiesVariantRow?.variant ?? null,
    },
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    startedAt: pack.startedAt,
    finishedAt: pack.finishedAt,
  };
};

const createService = (dependencies: ServiceDependencies) => {
  const refundPendingCredit = async (
    pack: AfterMatchPackRecord,
    deliverable: AfterMatchPackDeliverable,
    access: ContentAccessContext
  ): Promise<void> => {
    const state = getDeliverableState(pack, deliverable);
    const key = state.creditIdempotencyKey;
    if (!key) throw new AfterMatchPackError("CREDIT_REFUND_FAILED");

    try {
      const result = await dependencies.refundCredit({
        workspaceId: access.workspaceId,
        clerkUserId: access.clerkUserId,
        requestGroupId: `after-match-pack:${pack.id}:${deliverable}:${state.attemptCount}`,
        operation: "variation",
        originalIdempotencyKey: key,
      });
      if (result.status === "no_consumption") {
        throw new AfterMatchPackError("CREDIT_REFUND_FAILED");
      }

      const updated = await dependencies.packRepository.markCreditRefunded({
        packId: pack.id,
        deliverable,
        creditIdempotencyKey: key,
        access,
      });
      if (!updated) throw new AfterMatchPackError("PACK_STATE_CONFLICT");
    } catch (error) {
      if (error instanceof AfterMatchPackError && error.code === "PACK_STATE_CONFLICT") throw error;
      throw new AfterMatchPackError("CREDIT_REFUND_FAILED");
    }
  };

  const reconcileStaleDeliverable = async (
    pack: AfterMatchPackRecord,
    deliverable: AfterMatchPackDeliverable,
    staleBefore: string,
    access: ContentAccessContext
  ): Promise<void> => {
    const state = getDeliverableState(pack, deliverable);
    const key = state.creditIdempotencyKey;
    if (!key) throw new AfterMatchPackError("PACK_STATE_CONFLICT");

    if (state.creditStatus === "refund_pending") {
      await refundPendingCredit(pack, deliverable, access);
      return;
    }

    let reconciledCreditStatus: "not_required" | "not_consumed" | "refund_pending" | "refunded" =
      state.creditStatus === "not_required"
        ? "not_required"
        : state.creditStatus === "refunded"
          ? "refunded"
          : "not_consumed";

    if (state.creditStatus === "consumed") {
      const failed = await dependencies.packRepository.failDeliverable({
        packId: pack.id,
        deliverable,
        attemptCount: state.attemptCount,
        creditIdempotencyKey: key,
        errorCode: "STALE_GENERATION",
        creditStatus: "refund_pending",
        staleBefore,
        access,
      });
      if (!failed) throw new AfterMatchPackError("PACK_STATE_CONFLICT");
      await refundPendingCredit(failed, deliverable, access);
      return;
    }

    if (state.creditStatus === "not_consumed") {
      try {
        const refund = await dependencies.refundCredit({
          workspaceId: access.workspaceId,
          clerkUserId: access.clerkUserId,
          requestGroupId: `after-match-pack:${pack.id}:${deliverable}:${state.attemptCount}`,
          operation: "variation",
          originalIdempotencyKey: key,
        });
        reconciledCreditStatus = refund.status === "no_consumption" ? "not_consumed" : "refunded";
      } catch {
        throw new AfterMatchPackError("CREDIT_REFUND_FAILED");
      }
    }

    const failed = await dependencies.packRepository.failDeliverable({
      packId: pack.id,
      deliverable,
      attemptCount: state.attemptCount,
      creditIdempotencyKey: key,
      errorCode: "STALE_GENERATION",
      creditStatus: reconciledCreditStatus,
      staleBefore,
      access,
    });
    if (!failed) throw new AfterMatchPackError("PACK_STATE_CONFLICT");
  };

  const claimDeliverable = async (
    packId: string,
    deliverable: AfterMatchPackDeliverable,
    access: ContentAccessContext
  ): Promise<ClaimedAttempt | null> => {
    const staleBefore = new Date(dependencies.now().getTime() - AFTER_MATCH_PACK_STALE_AFTER_MS).toISOString();
    let claim: ClaimDeliverableResult = await dependencies.packRepository.claimDeliverable(
      packId,
      deliverable,
      staleBefore,
      access
    );

    if (claim.status === "not_found") throw new AfterMatchPackError("PACK_NOT_FOUND");
    if (claim.status === "completed" || claim.status === "in_progress") return null;
    if (claim.status === "needs_reconciliation") {
      await reconcileStaleDeliverable(claim.pack, deliverable, staleBefore, access);
      claim = await dependencies.packRepository.claimDeliverable(packId, deliverable, staleBefore, access);
      if (claim.status === "not_found") throw new AfterMatchPackError("PACK_NOT_FOUND");
      if (claim.status !== "claimed") return null;
    }

    const state = getDeliverableState(claim.pack, deliverable);
    if (!state.creditIdempotencyKey) throw new AfterMatchPackError("PACK_STATE_CONFLICT");
    return {
      pack: claim.pack,
      deliverable,
      attemptCount: state.attemptCount,
      creditStatus: state.creditStatus,
      creditIdempotencyKey: state.creditIdempotencyKey,
    };
  };

  const failAttempt = async (
    attempt: ClaimedAttempt,
    access: ContentAccessContext,
    errorCode: string,
    consumed: boolean
  ): Promise<void> => {
    const creditStatus = consumed
      ? "refund_pending"
      : attempt.creditStatus === "not_required"
        ? "not_required"
        : "not_consumed";
    const failed = await dependencies.packRepository.failDeliverable({
      packId: attempt.pack.id,
      deliverable: attempt.deliverable,
      attemptCount: attempt.attemptCount,
      creditIdempotencyKey: attempt.creditIdempotencyKey,
      errorCode,
      creditStatus,
      access,
    });
    if (!failed) throw new AfterMatchPackError("PACK_STATE_CONFLICT");
    if (consumed) await refundPendingCredit(failed, attempt.deliverable, access);
  };

  const runAttempt = async (
    attempt: ClaimedAttempt,
    source: PersistedPublication,
    access: ContentAccessContext
  ): Promise<void> => {
    let consumed = false;

    if (access.role === "media") {
      const credit = await dependencies.consumeCredit({
        workspaceId: access.workspaceId,
        clerkUserId: access.clerkUserId,
        requestGroupId: `after-match-pack:${attempt.pack.id}:${attempt.deliverable}:${attempt.attemptCount}`,
        operation: "variation",
        idempotencyKey: attempt.creditIdempotencyKey,
      });

      if (credit.status === "insufficient_credits" || credit.status === "no_active_period") {
        await failAttempt(
          attempt,
          access,
          credit.status === "insufficient_credits" ? "AI_CREDIT_INSUFFICIENT" : "AI_CREDIT_NO_ACTIVE_PERIOD",
          false
        );
        return;
      }

      consumed = true;
      let marked: AfterMatchPackRecord | null;
      try {
        marked = await dependencies.packRepository.markCreditConsumed({
          packId: attempt.pack.id,
          deliverable: attempt.deliverable,
          attemptCount: attempt.attemptCount,
          creditIdempotencyKey: attempt.creditIdempotencyKey,
          access,
        });
      } catch {
        await failAttempt(attempt, access, "PACK_STATE_CONFLICT", true);
        throw new AfterMatchPackError("PACK_STATE_CONFLICT");
      }
      if (!marked) {
        await failAttempt(attempt, access, "PACK_STATE_CONFLICT", true);
        throw new AfterMatchPackError("PACK_STATE_CONFLICT");
      }
    }

    const variantId = dependencies.createVariantId();
    const variationRequest = buildVariationRequest(source.document, attempt.deliverable, access.workspaceId);

    let result: Awaited<ReturnType<typeof runContentVariationEngine>>;
    try {
      result = await dependencies.generateVariation(variationRequest);
    } catch (error) {
      await failAttempt(attempt, access, toSafeGenerationErrorCode(error), consumed);
      return;
    }

    const now = dependencies.now().toISOString();
    const variant = buildVariant({
      id: variantId,
      packId: attempt.pack.id,
      deliverable: attempt.deliverable,
      document: source.document,
      request: variationRequest,
      result,
      now,
    });

    let completed: AfterMatchPackRecord | null;
    try {
      completed = await dependencies.packRepository.completeDeliverableWithVariant({
        packId: attempt.pack.id,
        deliverable: attempt.deliverable,
        attemptCount: attempt.attemptCount,
        creditIdempotencyKey: attempt.creditIdempotencyKey,
        variant,
        access,
      });
    } catch {
      await failAttempt(attempt, access, "VARIANT_PERSISTENCE_FAILED", consumed);
      return;
    }
    if (!completed) {
      await failAttempt(attempt, access, "VARIANT_PERSISTENCE_FAILED", consumed);
    }
  };

  const runDeliverables = async (
    pack: AfterMatchPackRecord,
    source: PersistedPublication,
    deliverables: AfterMatchPackDeliverable[],
    access: ContentAccessContext
  ): Promise<AfterMatchPackView> => {
    const uniqueDeliverables = Array.from(new Set(deliverables));
    const claims = await Promise.all(
      uniqueDeliverables.map((deliverable) => claimDeliverable(pack.id, deliverable, access))
    );
    const attempts = claims.filter((claim): claim is ClaimedAttempt => claim !== null);
    const outcomes = await Promise.allSettled(
      attempts.map((attempt) => runAttempt(attempt, source, access))
    );
    const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    if (rejected) throw rejected.reason;

    const refreshed = await dependencies.packRepository.getById(pack.id, access);
    if (!refreshed) throw new AfterMatchPackError("PACK_NOT_FOUND");
    return getPublicPack(refreshed, access, dependencies);
  };

  return {
    async createOrResumeAfterMatchPack(
      request: Request,
      input: CreateOrResumeAfterMatchPackInput
    ): Promise<AfterMatchPackView> {
      const access = await dependencies.requireAccess(request);
      const sourceDocumentId = normalize(input.sourceDocumentId);
      const draft = await dependencies.contentRepository.getDraft(sourceDocumentId, access);
      const source = assertExpectedSource(draft, { ...input, sourceDocumentId });
      const pack = await dependencies.packRepository.createOrGet({
        sourceDocumentId,
        sourceDocumentStorageVersion: source.storageVersion,
        sourceDocumentVersionId: source.document.activeVersionId,
        sourceDocumentUpdatedAt: source.storageUpdatedAt,
      }, access);
      if (!pack) throw new AfterMatchPackError("PACK_ACCESS_CONFLICT");
      if (
        pack.sourceDocumentId !== source.document.id
        || pack.sourceDocumentStorageVersion !== source.storageVersion
        || pack.sourceDocumentVersionId !== source.document.activeVersionId
        || !sameInstant(pack.sourceDocumentUpdatedAt, source.storageUpdatedAt)
      ) {
        throw new AfterMatchPackError("SOURCE_VERSION_CONFLICT");
      }
      const pendingDeliverables: AfterMatchPackDeliverable[] = [];
      if (pack.reelStatus === "pending") pendingDeliverables.push("reel");
      if (pack.storiesStatus === "pending") pendingDeliverables.push("stories");
      return runDeliverables(pack, source, pendingDeliverables, access);
    },

    async getAfterMatchPack(request: Request, packId: string): Promise<AfterMatchPackView> {
      const access = await dependencies.requireAccess(request);
      const pack = await dependencies.packRepository.getById(normalize(packId), access);
      if (!pack) throw new AfterMatchPackError("PACK_NOT_FOUND");
      return getPublicPack(pack, access, dependencies);
    },

    async getAfterMatchPackBySourceRevision(
      request: Request,
      input: GetAfterMatchPackBySourceRevisionInput
    ): Promise<AfterMatchPackView | null> {
      const access = await dependencies.requireAccess(request);
      const pack = await dependencies.packRepository.getBySourceRevision(
        normalize(input.sourceDocumentId),
        input.sourceDocumentRevision,
        access
      );
      return pack ? getPublicPack(pack, access, dependencies) : null;
    },

    async resumeAfterMatchPack(
      request: Request,
      packId: string,
      deliverables: AfterMatchPackDeliverable[]
    ): Promise<AfterMatchPackView> {
      const access = await dependencies.requireAccess(request);
      const pack = await dependencies.packRepository.getById(normalize(packId), access);
      if (!pack) throw new AfterMatchPackError("PACK_NOT_FOUND");
      const source = await assertPackSource(pack, access, dependencies);
      return runDeliverables(pack, source, deliverables, access);
    },
  };
};

export const createAfterMatchPackService = (overrides: Partial<ServiceDependencies> = {}) =>
  createService({ ...defaultDependencies, ...overrides });

const service = createAfterMatchPackService();

export const createOrResumeAfterMatchPack = service.createOrResumeAfterMatchPack;
export const getAfterMatchPack = service.getAfterMatchPack;
export const getAfterMatchPackBySourceRevision = service.getAfterMatchPackBySourceRevision;
export const resumeAfterMatchPack = service.resumeAfterMatchPack;