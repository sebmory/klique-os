import { createHash } from "node:crypto";
import type {
  AdminIntroductionDetail,
  AdminIntroductionSummary,
  InstagramContactPresentation,
  IntroductionActor,
  AthleteIntroductionDetail,
  IntroductionCreationPayload,
  IntroductionModerationAction,
  IntroductionReportStatus,
  IntroductionRequestState,
  IntroductionResponsePayload,
  PartnerIntroductionDetail,
  PartnerIntroductionSummary,
} from "@/lib/partner-athlete-introductions/contracts";
import {
  buildInstagramContactReference,
  contactReferencesEqual,
  getContactReferenceSecret,
} from "@/lib/partner-athlete-introductions/contact-reference";
import {
  createPartnerAthleteIntroductionDirectory,
  type PartnerAthleteIntroductionDirectory,
} from "@/lib/partner-athlete-introductions/directory";
import {
  authorizeIntroductionResponse,
  decideAthleteResponse,
  fingerprintIntroductionCreation,
  fingerprintIntroductionResponse,
  normalizeInstagramContact,
  presentInstagramContact,
  projectPartnerIntroductionDetail,
  projectPartnerIntroductionSummary,
  projectAthleteIntroductionDetail,
} from "@/lib/partner-athlete-introductions/domain";
import {
  createPartnerAthleteIntroductionRepository,
  type IntroductionMutationResult,
  type PartnerAthleteIntroductionRepository,
} from "@/lib/partner-athlete-introductions/repository";

export class PartnerAthleteIntroductionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartnerAthleteIntroductionValidationError";
  }
}

export class PartnerAthleteIntroductionForbiddenError extends Error {
  constructor(message = "Accès refusé.") {
    super(message);
    this.name = "PartnerAthleteIntroductionForbiddenError";
  }
}

export class PartnerAthleteIntroductionConflictError extends Error {
  constructor(
    message: string,
    readonly outcome:
      | IntroductionMutationResult["outcome"]
      | "contact_changed"
      | "identity_missing",
  ) {
    super(message);
    this.name = "PartnerAthleteIntroductionConflictError";
  }
}

export class PartnerAthleteIntroductionNotFoundError extends Error {
  constructor() {
    super("Demande introuvable.");
    this.name = "PartnerAthleteIntroductionNotFoundError";
  }
}

export type PartnerAthleteIntroductionService = {
  create(input: {
    actor: IntroductionActor;
    payload: IntroductionCreationPayload;
    idempotencyKey: string;
    now?: Date;
  }): Promise<IntroductionMutationResult>;
  presentAthleteContact(input: {
    actor: IntroductionActor;
    requestId: string;
  }): Promise<InstagramContactPresentation | null>;
  respond(input: {
    actor: IntroductionActor;
    requestId: string;
    payload: IntroductionResponsePayload;
    idempotencyKey: string;
    now?: Date;
  }): Promise<IntroductionMutationResult>;
  activateHistorical(input: {
    actor: IntroductionActor;
    requestId: string;
    idempotencyKey: string;
    now?: Date;
  }): Promise<IntroductionMutationResult>;
  moderate(input: {
    actor: IntroductionActor;
    requestId: string;
    action: IntroductionModerationAction;
    reason: string;
    idempotencyKey: string;
    now?: Date;
  }): Promise<IntroductionMutationResult>;
  setPartnerSolicitation(input: {
    actor: IntroductionActor;
    partnerId: string;
    canSolicit: boolean;
    reason: string;
    idempotencyKey: string;
    now?: Date;
  }): Promise<void>;
  getPartnerDetail(input: {
    actor: IntroductionActor;
    requestId: string;
  }): Promise<PartnerIntroductionDetail>;
  listForPartner(input: { actor: IntroductionActor }): Promise<PartnerIntroductionDetail[]>;
  listForAthlete(input: { actor: IntroductionActor }): Promise<AthleteIntroductionDetail[]>;
  getAthleteDetail(input: {
    actor: IntroductionActor;
    requestId: string;
  }): Promise<AthleteIntroductionDetail>;
  listForAdmin(input: {
    actor: IntroductionActor;
    status?: string | null;
    moderationStatus?: string | null;
    staleOnly?: boolean;
    reportedOnly?: boolean;
    historicalOnly?: boolean;
    page?: number;
    limit?: number;
    staleDays: number;
    now?: Date;
  }): Promise<{
    items: AdminIntroductionSummary[];
    total: number;
    counters: Record<string, number>;
    page: number;
    limit: number;
  }>;
  getAdminDetail(input: {
    actor: IntroductionActor;
    requestId: string;
    staleDays: number;
    now?: Date;
  }): Promise<AdminIntroductionDetail>;
  report(input: {
    actor: IntroductionActor;
    requestId: string;
    reason: string;
    comment?: string | null;
    idempotencyKey: string;
    now?: Date;
  }): Promise<"created" | "replay">;
  handleReport(input: {
    actor: IntroductionActor;
    requestId: string;
    reportId: string;
    status: Exclude<IntroductionReportStatus, "open">;
    note: string;
    idempotencyKey: string;
    now?: Date;
  }): Promise<"updated" | "replay">;
};

type ServiceDependencies = {
  repository: PartnerAthleteIntroductionRepository;
  directory: PartnerAthleteIntroductionDirectory;
  contactReferenceSecret: () => string;
};

const normalizeRequired = (value: unknown, fieldName: string): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new PartnerAthleteIntroductionValidationError(`${fieldName} est requis.`);
  return normalized;
};

const assertCreationTextLimits = (reason: string, message: string): void => {
  if (reason.length > 150) {
    throw new PartnerAthleteIntroductionValidationError(
      "Le motif ne peut pas dépasser 150 caractères.",
    );
  }
  if (message.length > 3000) {
    throw new PartnerAthleteIntroductionValidationError(
      "Le message ne peut pas dépasser 3000 caractères.",
    );
  }
};

const requireNow = (value?: Date): string => {
  const now = value ? new Date(value.getTime()) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new PartnerAthleteIntroductionValidationError("now est invalide.");
  }
  return now.toISOString();
};

const fingerprintModeration = (input: {
  action: IntroductionModerationAction;
  reason: string;
}): string =>
  createHash("sha256")
    .update(JSON.stringify({ action: input.action, reason: input.reason.trim() }))
    .digest("hex");

const fingerprint = (value: Record<string, string>): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const assertServerActor = (actor: IntroductionActor): void => {
  normalizeRequired(actor.clerkUserId, "actor.clerkUserId");
  normalizeRequired(actor.workspaceId, "actor.workspaceId");
};

const throwForMutation = (result: IntroductionMutationResult): never => {
  if (result.outcome === "not_found") {
    throw new PartnerAthleteIntroductionNotFoundError();
  }
  if (
    result.outcome === "forbidden"
    || result.outcome === "ineligible_athlete"
    || result.outcome === "solicitation_disabled"
  ) {
    throw new PartnerAthleteIntroductionForbiddenError();
  }
  throw new PartnerAthleteIntroductionConflictError(
    `Opération refusée : ${result.outcome}.`,
    result.outcome,
  );
};

const requireSuccessfulMutation = (
  result: IntroductionMutationResult,
  allowed: readonly IntroductionMutationResult["outcome"][],
): IntroductionMutationResult => {
  if (allowed.includes(result.outcome)) return result;
  return throwForMutation(result);
};

const buildCurrentPresentation = (input: {
  secret: string;
  request: IntroductionRequestState;
  rawInstagram: string;
}): InstagramContactPresentation | null => {
  const normalizedInstagram = normalizeInstagramContact(input.rawInstagram);
  if (!normalizedInstagram) return null;
  return presentInstagramContact({
    rawInstagram: normalizedInstagram,
    contactReference: buildInstagramContactReference({
      secret: input.secret,
      workspaceId: input.request.workspaceId,
      requestId: input.request.id,
      athleteId: input.request.athleteId,
      normalizedInstagram,
    }),
  });
};

export const createPartnerAthleteIntroductionService = (
  dependencies: Partial<ServiceDependencies> = {},
): PartnerAthleteIntroductionService => {
  const repository = dependencies.repository
    ?? createPartnerAthleteIntroductionRepository();
  const directory = dependencies.directory
    ?? createPartnerAthleteIntroductionDirectory();
  const contactReferenceSecret = dependencies.contactReferenceSecret
    ?? getContactReferenceSecret;
  const enrichAdminCanonicalNames = async <
    T extends AdminIntroductionSummary,
  >(item: T): Promise<T> => {
    const [partner, athlete] = await Promise.all([
      item.partnerPublicName
        ? null
        : directory.resolveCanonicalPartnerProfile(item.partnerId),
      item.athletePublicName
        ? null
        : directory.resolveCanonicalAthleteProfile(item.athleteId),
    ]);
    return {
      ...item,
      partnerPublicName:
        item.partnerPublicName
        || (partner?.outcome === "resolved" ? partner.profile.publicName : ""),
      athletePublicName:
        item.athletePublicName
        || (athlete?.outcome === "resolved" ? athlete.profile.publicName : ""),
    };
  };
  const enrichPartnerAthleteName = async <
    T extends PartnerIntroductionSummary,
  >(item: T): Promise<T> => {
    if (item.athletePublicName) return item;
    const athlete = await directory.resolveCanonicalAthleteProfile(item.athleteId);
    return {
      ...item,
      athletePublicName:
        athlete.outcome === "resolved" ? athlete.profile.publicName : "",
    };
  };

  return {
    async create(input) {
      assertServerActor(input.actor);
      const idempotencyKey = normalizeRequired(input.idempotencyKey, "idempotencyKey");
      const athleteId = normalizeRequired(input.payload.athleteId, "athleteId");
      const reason = normalizeRequired(input.payload.reason, "reason");
      const message = String(input.payload.message ?? "").trim();
      assertCreationTextLimits(reason, message);
      if (
        input.actor.role !== "partner_expert"
        || input.actor.status !== "active"
        || !input.actor.partnerId?.trim()
      ) {
        throw new PartnerAthleteIntroductionForbiddenError();
      }

      const [partnerProfile, athleteProfile] = await Promise.all([
        directory.resolvePartnerProfile(input.actor.partnerId),
        directory.resolveAthleteProfile(athleteId),
      ]);
      if (!partnerProfile?.active) {
        throw new PartnerAthleteIntroductionForbiddenError(
          "Fiche partenaire active introuvable.",
        );
      }
      if (!athleteProfile?.publicName) {
        throw new PartnerAthleteIntroductionForbiddenError(
          "Athlète cible inéligible.",
        );
      }

      const result = await repository.create({
        actor: input.actor,
        athleteId,
        partnerPublicName: partnerProfile.publicName,
        athletePublicName: athleteProfile.publicName,
        reason,
        message,
        idempotencyKey,
        payloadHash: fingerprintIntroductionCreation({
          athleteId,
          reason,
          message,
        }),
        now: requireNow(input.now),
      });
      return requireSuccessfulMutation(result, ["created", "replay"]);
    },

    async presentAthleteContact(input) {
      assertServerActor(input.actor);
      const requestId = normalizeRequired(input.requestId, "requestId");
      const request = await repository.getForAthlete(input.actor, requestId);
      if (!request) throw new PartnerAthleteIntroductionNotFoundError();
      const access = authorizeIntroductionResponse(input.actor, request);
      if (!access.allowed) throw new PartnerAthleteIntroductionForbiddenError();
      if (
        request.flowVersion < 2
        || request.status !== "awaiting_athlete"
        || request.moderationStatus !== "clear"
      ) {
        return null;
      }

      const athleteProfile = await directory.resolveAthleteProfile(request.athleteId);
      if (!athleteProfile) throw new PartnerAthleteIntroductionNotFoundError();
      return buildCurrentPresentation({
        secret: contactReferenceSecret(),
        request,
        rawInstagram: athleteProfile.instagram,
      });
    },

    async respond(input) {
      assertServerActor(input.actor);
      const requestId = normalizeRequired(input.requestId, "requestId");
      const idempotencyKey = normalizeRequired(input.idempotencyKey, "idempotencyKey");
      const request = await repository.getForAthlete(input.actor, requestId);
      if (!request) throw new PartnerAthleteIntroductionNotFoundError();
      const access = authorizeIntroductionResponse(input.actor, request);
      if (!access.allowed) throw new PartnerAthleteIntroductionForbiddenError();

      let authorizedInstagram: string | null = null;
      let contactReference: string | null = null;
      if (input.payload.decision === "accept" && request.status === "awaiting_athlete") {
        const athleteProfile = await directory.resolveAthleteProfile(request.athleteId);
        const currentPresentation = athleteProfile
          ? buildCurrentPresentation({
              secret: contactReferenceSecret(),
              request,
              rawInstagram: athleteProfile.instagram,
            })
          : null;
        const submittedReference = String(input.payload.contactReference ?? "").trim();
        const presentedContact = currentPresentation
          && contactReferencesEqual(currentPresentation.reference, submittedReference)
          ? currentPresentation
          : null;
        const decision = decideAthleteResponse({
          actor: input.actor,
          request,
          decision: "accept",
          now: input.now ?? new Date(),
          presentedContact,
          confirmedContact: input.payload.confirmedContact,
          currentInstagram: athleteProfile?.instagram,
          currentContactReference: currentPresentation?.reference,
        });
        if (decision.outcome !== "transition" || decision.status !== "accepted") {
          const reason = decision.outcome === "conflict" ? decision.reason : "contact_changed";
          throw new PartnerAthleteIntroductionConflictError(
            `Acceptation impossible : ${reason}.`,
            reason === "contact_changed" ? "contact_changed" : "conflict",
          );
        }
        authorizedInstagram = decision.authorizedContact.value;
        contactReference = decision.authorizedContact.reference;
      }

      const payloadHash = fingerprintIntroductionResponse(input.payload);
      const result = await repository.respond({
        actor: input.actor,
        requestId,
        decision: input.payload.decision,
        idempotencyKey,
        payloadHash,
        now: requireNow(input.now),
        authorizedInstagram,
        contactReference,
      });
      return requireSuccessfulMutation(result, ["transitioned", "replay"]);
    },

    async activateHistorical(input) {
      assertServerActor(input.actor);
      if (input.actor.role !== "admin" || input.actor.status !== "active") {
        throw new PartnerAthleteIntroductionForbiddenError();
      }
      const requestId = normalizeRequired(input.requestId, "requestId");
      const idempotencyKey = normalizeRequired(input.idempotencyKey, "idempotencyKey");
      const now = requireNow(input.now);
      const existing = await repository.getForAdmin(input.actor, requestId, 1, now);
      if (!existing) throw new PartnerAthleteIntroductionNotFoundError();
      if (!existing.historical || existing.status !== "pending") {
        throw new PartnerAthleteIntroductionConflictError(
          "Seule une ancienne demande en attente peut être transmise.",
          "historical_request",
        );
      }

      const [partner, athlete] = await Promise.all([
        directory.resolveCanonicalPartnerProfile(existing.partnerId),
        directory.resolveCanonicalAthleteProfile(existing.athleteId),
      ]);
      if (partner.outcome === "ambiguous" || athlete.outcome === "ambiguous") {
        throw new PartnerAthleteIntroductionConflictError(
          "L’identité canonique du partenaire ou de l’athlète est ambiguë.",
          "identity_ambiguous",
        );
      }
      if (partner.outcome !== "resolved" || athlete.outcome !== "resolved") {
        throw new PartnerAthleteIntroductionConflictError(
          "Le partenaire ou l’athlète ne peut pas être résolu depuis les identités canoniques.",
          "identity_missing",
        );
      }
      if (!partner.profile.active) {
        throw new PartnerAthleteIntroductionForbiddenError(
          "Le profil partenaire n’est pas actif.",
        );
      }
      if (!partner.profile.publicName || !athlete.profile.publicName) {
        throw new PartnerAthleteIntroductionConflictError(
          "Le nom public canonique du partenaire ou de l’athlète est indisponible.",
          "identity_missing",
        );
      }

      const result = await repository.activateHistorical({
        actor: input.actor,
        requestId,
        partnerPublicName: partner.profile.publicName,
        athletePublicName: athlete.profile.publicName,
        idempotencyKey,
        payloadHash: fingerprint({ action: "activate_historical", requestId }),
        now,
      });
      if (result.outcome === "identity_ambiguous") {
        throw new PartnerAthleteIntroductionConflictError(
          "Plusieurs accès actifs correspondent au partenaire ou à l’athlète.",
          result.outcome,
        );
      }
      if (result.outcome === "unresolved_request") {
        throw new PartnerAthleteIntroductionConflictError(
          "Une demande concurrente incompatible existe déjà pour ces participants.",
          result.outcome,
        );
      }
      return requireSuccessfulMutation(result, ["transitioned", "replay"]);
    },

    async moderate(input) {
      assertServerActor(input.actor);
      const requestId = normalizeRequired(input.requestId, "requestId");
      const idempotencyKey = normalizeRequired(input.idempotencyKey, "idempotencyKey");
      const reason = normalizeRequired(input.reason, "reason");
      if (input.actor.role !== "admin" || input.actor.status !== "active") {
        throw new PartnerAthleteIntroductionForbiddenError();
      }

      const result = await repository.moderate({
        actor: input.actor,
        requestId,
        action: input.action,
        reason,
        idempotencyKey,
        payloadHash: fingerprintModeration({ action: input.action, reason }),
        now: requireNow(input.now),
      });
      return requireSuccessfulMutation(result, ["transitioned", "unchanged", "replay"]);
    },

    async setPartnerSolicitation(input) {
      assertServerActor(input.actor);
      if (input.actor.role !== "admin" || input.actor.status !== "active") {
        throw new PartnerAthleteIntroductionForbiddenError();
      }
      const partnerId = normalizeRequired(input.partnerId, "partnerId");
      const reason = normalizeRequired(input.reason, "reason");
      const idempotencyKey = normalizeRequired(input.idempotencyKey, "idempotencyKey");
      const outcome = await repository.setPartnerSolicitation({
        actor: input.actor,
        partnerId,
        canSolicit: input.canSolicit,
        reason,
        idempotencyKey,
        payloadHash: fingerprint({
          partnerId,
          canSolicit: String(input.canSolicit),
          reason,
        }),
        now: requireNow(input.now),
      });
      if (outcome === "updated" || outcome === "replay") return;
      if (outcome === "forbidden") throw new PartnerAthleteIntroductionForbiddenError();
      throw new PartnerAthleteIntroductionConflictError(
        "Cette clé d’idempotence a déjà été utilisée avec une autre action.",
        "idempotency_conflict",
      );
    },

    async getPartnerDetail(input) {
      assertServerActor(input.actor);
      const requestId = normalizeRequired(input.requestId, "requestId");
      const request = await repository.getForPartner(input.actor, requestId);
      if (!request) throw new PartnerAthleteIntroductionNotFoundError();
      const projection = projectPartnerIntroductionDetail(request, input.actor);
      if (!projection) throw new PartnerAthleteIntroductionForbiddenError();
      return enrichPartnerAthleteName(projection);
    },

    async listForPartner(input) {
      assertServerActor(input.actor);
      const requests = await repository.listForPartner(input.actor);
      const projections = requests.flatMap((request) => {
        const projection = projectPartnerIntroductionSummary(request, input.actor);
        return projection ? [projection] : [];
      });
      return Promise.all(projections.map(enrichPartnerAthleteName));
    },

    async listForAthlete(input) {
      assertServerActor(input.actor);
      if (
        input.actor.role !== "athlete"
        || input.actor.status !== "active"
        || !input.actor.athleteId
      ) {
        throw new PartnerAthleteIntroductionForbiddenError();
      }
      const requests = await repository.listForAthlete(input.actor);
      return requests.flatMap((request) => {
        const projection = projectAthleteIntroductionDetail(request, input.actor);
        return projection ? [projection] : [];
      });
    },

    async getAthleteDetail(input) {
      assertServerActor(input.actor);
      const requestId = normalizeRequired(input.requestId, "requestId");
      const request = await repository.getForAthlete(input.actor, requestId);
      if (!request) throw new PartnerAthleteIntroductionNotFoundError();
      const access = authorizeIntroductionResponse(input.actor, request);
      if (!access.allowed) throw new PartnerAthleteIntroductionForbiddenError();
      const projection = projectAthleteIntroductionDetail(request, input.actor);
      if (!projection) throw new PartnerAthleteIntroductionForbiddenError();
      return projection;
    },

    async listForAdmin(input) {
      assertServerActor(input.actor);
      if (input.actor.role !== "admin" || input.actor.status !== "active") {
        throw new PartnerAthleteIntroductionForbiddenError();
      }
      const page = input.page ?? 1;
      const limit = input.limit ?? 20;
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new PartnerAthleteIntroductionValidationError("Pagination invalide.");
      }
      const result = await repository.listForAdmin({
        actor: input.actor,
        status: input.status?.trim() || null,
        moderationStatus: input.moderationStatus?.trim() || null,
        staleOnly: input.staleOnly === true,
        reportedOnly: input.reportedOnly === true,
        historicalOnly: input.historicalOnly === true,
        staleDays: input.staleDays,
        limit,
        offset: (page - 1) * limit,
        now: requireNow(input.now),
      });
      return {
        ...result,
        items: await Promise.all(result.items.map(enrichAdminCanonicalNames)),
        page,
        limit,
      };
    },

    async getAdminDetail(input) {
      assertServerActor(input.actor);
      if (input.actor.role !== "admin" || input.actor.status !== "active") {
        throw new PartnerAthleteIntroductionForbiddenError();
      }
      const requestId = normalizeRequired(input.requestId, "requestId");
      const detail = await repository.getForAdmin(
        input.actor,
        requestId,
        input.staleDays,
        requireNow(input.now),
      );
      if (!detail) throw new PartnerAthleteIntroductionNotFoundError();
      return enrichAdminCanonicalNames(detail);
    },

    async report(input) {
      assertServerActor(input.actor);
      if (
        input.actor.role !== "athlete"
        || input.actor.status !== "active"
        || !input.actor.athleteId
      ) {
        throw new PartnerAthleteIntroductionForbiddenError();
      }
      const requestId = normalizeRequired(input.requestId, "requestId");
      const reason = normalizeRequired(input.reason, "reason");
      const comment = String(input.comment ?? "").trim();
      const idempotencyKey = normalizeRequired(input.idempotencyKey, "idempotencyKey");
      if (reason.length > 150 || comment.length > 2000) {
        throw new PartnerAthleteIntroductionValidationError("Signalement trop long.");
      }
      const outcome = await repository.report({
        actor: input.actor,
        requestId,
        reason,
        comment,
        idempotencyKey,
        payloadHash: fingerprint({ reason, comment }),
        now: requireNow(input.now),
      });
      if (outcome === "created" || outcome === "replay") return outcome;
      if (outcome === "not_found") throw new PartnerAthleteIntroductionNotFoundError();
      if (outcome === "forbidden") throw new PartnerAthleteIntroductionForbiddenError();
      throw new PartnerAthleteIntroductionConflictError(
        outcome === "duplicate"
          ? "Un signalement est déjà en cours de traitement."
          : "Le signalement ne peut pas être enregistré.",
        "conflict",
      );
    },

    async handleReport(input) {
      assertServerActor(input.actor);
      if (input.actor.role !== "admin" || input.actor.status !== "active") {
        throw new PartnerAthleteIntroductionForbiddenError();
      }
      const requestId = normalizeRequired(input.requestId, "requestId");
      const reportId = normalizeRequired(input.reportId, "reportId");
      const note = normalizeRequired(input.note, "note");
      const idempotencyKey = normalizeRequired(input.idempotencyKey, "idempotencyKey");
      if (!["reviewing", "resolved", "dismissed"].includes(input.status)) {
        throw new PartnerAthleteIntroductionValidationError("Statut de signalement invalide.");
      }
      const outcome = await repository.handleReport({
        actor: input.actor,
        requestId,
        reportId,
        status: input.status,
        note,
        idempotencyKey,
        payloadHash: fingerprint({ status: input.status, note, reportId }),
        now: requireNow(input.now),
      });
      if (outcome === "updated" || outcome === "replay") return outcome;
      if (outcome === "not_found") throw new PartnerAthleteIntroductionNotFoundError();
      if (outcome === "forbidden") throw new PartnerAthleteIntroductionForbiddenError();
      throw new PartnerAthleteIntroductionConflictError(
        "Le traitement du signalement est incompatible avec son état courant.",
        "conflict",
      );
    },
  };
};
