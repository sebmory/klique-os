import { NextResponse } from "next/server";
import { ContentAccessError } from "@/lib/content-storage/access";
import {
  AfterMatchPackError,
  type AfterMatchPackErrorCode,
} from "@/services/content-after-match-packs/service";
import type {
  AfterMatchPackDeliverable,
  AfterMatchPackDeliverableView,
  AfterMatchPackView,
  CreateOrResumeAfterMatchPackInput,
  GetAfterMatchPackBySourceRevisionInput,
} from "@/types/content-after-match-pack";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeErrorCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const createBodyKeys = new Set([
  "sourceDocumentId",
  "sourceDocumentRevision",
  "sourceDocumentVersionId",
  "sourceDocumentUpdatedAt",
]);
const serviceErrorMessages: Record<AfterMatchPackErrorCode, string> = {
  SOURCE_NOT_FOUND: "Document source introuvable.",
  SOURCE_NOT_PUBLICATION: "Le document source n est pas une Publication.",
  SOURCE_NOT_AFTER_MATCH: "Le document source n est pas une Publication Apres-match.",
  SOURCE_VERSION_CONFLICT: "Le document source a ete modifie.",
  PACK_NOT_FOUND: "Pack Apres-match introuvable.",
  PACK_ACCESS_CONFLICT: "Acces au Pack Apres-match refuse.",
  PACK_STATE_CONFLICT: "Le Pack Apres-match est dans un etat incompatible.",
  AI_CREDIT_INSUFFICIENT: "Credits IA insuffisants pour cette operation.",
  AI_CREDIT_NO_ACTIVE_PERIOD: "Aucune periode de credits IA active.",
  CREDIT_REFUND_FAILED: "Impossible de finaliser le remboursement du credit IA.",
};

export class AfterMatchPackRouteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AfterMatchPackRouteValidationError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireExactKeys = (value: Record<string, unknown>, expected: Set<string>, message: string): void => {
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new AfterMatchPackRouteValidationError(message);
  }
};

const requireNonEmptyString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new AfterMatchPackRouteValidationError(`${fieldName} doit etre une chaine non vide.`);
  }
  return value.trim();
};

const requireCanonicalIsoDate = (value: unknown, fieldName: string): string => {
  const text = requireNonEmptyString(value, fieldName);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) {
    throw new AfterMatchPackRouteValidationError(`${fieldName} doit etre une date ISO valide.`);
  }
  return text;
};

export const assertNoQueryParameters = (request: Request): void => {
  if (new URL(request.url).searchParams.size > 0) {
    throw new AfterMatchPackRouteValidationError("Les parametres de requete ne sont pas autorises.");
  }
};

export const requirePackId = (value: unknown): string => {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new AfterMatchPackRouteValidationError("packId doit etre un UUID valide.");
  }
  return value;
};

export const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    throw new AfterMatchPackRouteValidationError("Corps JSON invalide.");
  }
};

export const validateCreateAfterMatchPackBody = (value: unknown): CreateOrResumeAfterMatchPackInput => {
  if (!isRecord(value)) {
    throw new AfterMatchPackRouteValidationError("Corps After-match invalide.");
  }
  requireExactKeys(value, createBodyKeys, "Le corps doit contenir exactement les champs source attendus.");

  const sourceDocumentRevision = value.sourceDocumentRevision;
  if (!Number.isInteger(sourceDocumentRevision) || Number(sourceDocumentRevision) < 1) {
    throw new AfterMatchPackRouteValidationError("sourceDocumentRevision doit etre un entier positif.");
  }

  return {
    sourceDocumentId: requireNonEmptyString(value.sourceDocumentId, "sourceDocumentId"),
    expectedSourceDocumentStorageVersion: Number(sourceDocumentRevision),
    expectedSourceDocumentVersionId: requireNonEmptyString(value.sourceDocumentVersionId, "sourceDocumentVersionId"),
    expectedSourceDocumentUpdatedAt: requireCanonicalIsoDate(value.sourceDocumentUpdatedAt, "sourceDocumentUpdatedAt"),
  };
};

export const validateGetAfterMatchPackQuery = (request: Request): GetAfterMatchPackBySourceRevisionInput => {
  const searchParams = new URL(request.url).searchParams;
  const expectedKeys = new Set(["sourceDocumentId", "sourceDocumentRevision"]);
  const keys = Array.from(searchParams.keys());
  if (
    keys.length !== expectedKeys.size
    || keys.some((key) => !expectedKeys.has(key))
    || Array.from(expectedKeys).some((key) => searchParams.getAll(key).length !== 1)
  ) {
    throw new AfterMatchPackRouteValidationError(
      "La requete doit contenir exactement sourceDocumentId et sourceDocumentRevision."
    );
  }

  const sourceDocumentId = requireNonEmptyString(searchParams.get("sourceDocumentId"), "sourceDocumentId");
  const revisionText = searchParams.get("sourceDocumentRevision");
  if (!revisionText || !/^[1-9]\d*$/.test(revisionText)) {
    throw new AfterMatchPackRouteValidationError(
      "sourceDocumentRevision doit etre un entier positif canonique."
    );
  }
  const sourceDocumentRevision = Number(revisionText);
  if (!Number.isSafeInteger(sourceDocumentRevision)) {
    throw new AfterMatchPackRouteValidationError(
      "sourceDocumentRevision doit etre un entier positif canonique."
    );
  }

  return { sourceDocumentId, sourceDocumentRevision };
};

export const validateResumeAfterMatchPackBody = (value: unknown): AfterMatchPackDeliverable[] => {
  if (!isRecord(value)) {
    throw new AfterMatchPackRouteValidationError("Corps de reprise invalide.");
  }
  requireExactKeys(value, new Set(["deliverables"]), "Le corps doit contenir uniquement deliverables.");
  if (!Array.isArray(value.deliverables) || value.deliverables.length === 0) {
    throw new AfterMatchPackRouteValidationError("deliverables doit etre un tableau non vide.");
  }

  const deliverables: AfterMatchPackDeliverable[] = [];
  for (const deliverable of value.deliverables) {
    if (deliverable !== "reel" && deliverable !== "stories") {
      throw new AfterMatchPackRouteValidationError("deliverables contient une valeur non supportee.");
    }
    if (deliverables.includes(deliverable)) {
      throw new AfterMatchPackRouteValidationError("deliverables ne doit pas contenir de doublon.");
    }
    deliverables.push(deliverable);
  }
  return deliverables;
};

const projectDeliverable = (deliverable: AfterMatchPackDeliverableView) => ({
  status: deliverable.status,
  ...(deliverable.status === "completed" && deliverable.variant
    ? { variantId: deliverable.variant.id }
    : {}),
  ...(deliverable.status === "failed" && deliverable.errorCode && safeErrorCodePattern.test(deliverable.errorCode)
    ? { errorCode: deliverable.errorCode }
    : {}),
});

export const projectAfterMatchPack = (pack: AfterMatchPackView) => ({
  id: pack.id,
  kind: "after_match" as const,
  status: pack.status,
  source: {
    documentId: pack.sourceDocumentId,
    revision: pack.sourceDocumentStorageVersion,
    versionId: pack.sourceDocumentVersionId,
    updatedAt: pack.sourceDocumentUpdatedAt,
  },
  reel: projectDeliverable(pack.reel),
  stories: projectDeliverable(pack.stories),
  createdAt: pack.createdAt,
  updatedAt: pack.updatedAt,
  startedAt: pack.startedAt,
  finishedAt: pack.finishedAt,
});

const getCreditFailure = (
  pack: AfterMatchPackView,
  deliverables: AfterMatchPackDeliverable[]
): "AI_CREDIT_INSUFFICIENT" | "AI_CREDIT_NO_ACTIVE_PERIOD" | null => {
  for (const deliverable of deliverables) {
    const errorCode = pack[deliverable].errorCode;
    if (errorCode === "AI_CREDIT_INSUFFICIENT" || errorCode === "AI_CREDIT_NO_ACTIVE_PERIOD") {
      return errorCode;
    }
  }
  return null;
};

export const afterMatchPackMutationResponse = (
  pack: AfterMatchPackView,
  deliverables: AfterMatchPackDeliverable[]
): NextResponse => {
  const projected = projectAfterMatchPack(pack);
  const creditFailure = getCreditFailure(pack, deliverables);
  if (creditFailure) {
    return NextResponse.json({
      ok: false,
      code: creditFailure,
      message: creditFailure === "AI_CREDIT_INSUFFICIENT"
        ? "Credits IA insuffisants pour cette operation."
        : "Aucune periode de credits IA active.",
      pack: projected,
    }, { status: 402 });
  }
  if (deliverables.some((deliverable) => pack[deliverable].status === "generating")) {
    return NextResponse.json({
      ok: false,
      code: "PACK_IN_PROGRESS",
      message: "Une generation est deja en cours.",
      pack: projected,
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true, pack: projected }, { status: 200 });
};

export const afterMatchPackErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof AfterMatchPackRouteValidationError) {
    return NextResponse.json({ ok: false, code: "INVALID_REQUEST", message: error.message }, { status: 400 });
  }
  if (error instanceof ContentAccessError) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        message: error.code === "UNAUTHORIZED" ? "Authentification requise." : "Acces refuse.",
      },
      { status: error.code === "UNAUTHORIZED" ? 401 : 403 }
    );
  }
  if (error instanceof AfterMatchPackError) {
    const status = error.code === "SOURCE_NOT_FOUND" || error.code === "PACK_NOT_FOUND"
      ? 404
      : error.code === "PACK_ACCESS_CONFLICT"
        ? 403
      : error.code === "SOURCE_VERSION_CONFLICT"
          || error.code === "PACK_STATE_CONFLICT"
        ? 409
        : error.code === "AI_CREDIT_INSUFFICIENT" || error.code === "AI_CREDIT_NO_ACTIVE_PERIOD"
          ? 402
          : error.code === "SOURCE_NOT_PUBLICATION" || error.code === "SOURCE_NOT_AFTER_MATCH"
            ? 400
            : 500;
    return NextResponse.json({
      ok: false,
      code: status === 500 ? "INTERNAL_ERROR" : error.code,
      message: status === 500 ? "Impossible de traiter le Pack Apres-match." : serviceErrorMessages[error.code],
    }, { status });
  }
  return NextResponse.json({
    ok: false,
    code: "INTERNAL_ERROR",
    message: "Impossible de traiter le Pack Apres-match.",
  }, { status: 500 });
};
