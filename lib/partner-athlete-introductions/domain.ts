import { createHash } from "node:crypto";
import type {
  AthleteIntroductionDecision,
  InstagramContactPresentation,
  IntroductionActor,
  IntroductionCreationPayload,
  IntroductionDomainEvent,
  IntroductionModerationAction,
  IntroductionNotification,
  IntroductionPairHistory,
  IntroductionRequestState,
  IntroductionResponsePayload,
  AthleteIntroductionDetail,
  PartnerIntroductionDetail,
  PartnerIntroductionSummary,
  StoredIdempotentOperation,
} from "@/lib/partner-athlete-introductions/contracts";

export const PARTNER_INTRODUCTION_FLOW_VERSION = 2;
export const PARTNER_INTRODUCTION_REFUSAL_COOLDOWN_DAYS = 30;
export const PARTNER_INTRODUCTION_DEFAULT_STALE_DAYS = 5;

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const instagramHandlePattern = /^[a-z0-9._]{1,30}$/;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeRequiredText = (value: unknown, fieldName: string): string => {
  const normalized = normalizeText(value);
  if (!normalized) throw new Error(`${fieldName} est requis.`);
  return normalized;
};

const parseTimestamp = (value: string | Date, fieldName: string): Date => {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${fieldName} est invalide.`);
  return parsed;
};

const fingerprint = (payload: Record<string, string>): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

export const fingerprintIntroductionCreation = (
  payload: IntroductionCreationPayload,
): string =>
  fingerprint({
    athleteId: normalizeRequiredText(payload.athleteId, "athleteId"),
    reason: normalizeRequiredText(payload.reason, "reason"),
    message: normalizeText(payload.message),
  });

export const fingerprintIntroductionResponse = (
  payload: IntroductionResponsePayload,
): string =>
  fingerprint({
    decision: payload.decision,
    confirmedContact: normalizeText(payload.confirmedContact).toLowerCase(),
    contactReference: normalizeText(payload.contactReference),
  });

export const normalizeInstagramContact = (value: unknown): string | null => {
  let candidate = normalizeText(value);
  if (!candidate) return null;

  if (candidate.startsWith("@")) {
    candidate = candidate.slice(1);
  } else if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(candidate)) {
    const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    let url: URL;
    try {
      url = new URL(withProtocol);
    } catch {
      return null;
    }
    if (!["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())) {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return null;
    [candidate] = segments;
  }

  const handle = candidate.toLowerCase();
  if (
    !instagramHandlePattern.test(handle)
    || handle.startsWith(".")
    || handle.endsWith(".")
    || handle.includes("..")
  ) {
    return null;
  }
  return `@${handle}`;
};

export const presentInstagramContact = (input: {
  rawInstagram: unknown;
  contactReference: unknown;
}): InstagramContactPresentation | null => {
  const value = normalizeInstagramContact(input.rawInstagram);
  const reference = normalizeText(input.contactReference);
  if (!value || !reference) return null;
  return { channel: "instagram", value, reference };
};

export type AccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "inactive_actor"
        | "role_forbidden"
        | "missing_identity"
        | "workspace_mismatch"
        | "owner_mismatch"
        | "solicitation_disabled"
        | "inactive_partner_profile"
        | "ineligible_athlete"
        | "wrong_request_kind";
    };

type AccessDeniedReason = Extract<AccessDecision, { allowed: false }>["reason"];

export const authorizeIntroductionCreation = (input: {
  actor: IntroductionActor;
  targetAthleteId: string;
  targetAthleteAccess: IntroductionActor | null;
  partnerProfileActive: boolean;
  solicitationAllowed: boolean;
}): AccessDecision => {
  const { actor, targetAthleteAccess } = input;
  if (actor.status !== "active") return { allowed: false, reason: "inactive_actor" };
  if (actor.role !== "partner_expert") return { allowed: false, reason: "role_forbidden" };
  if (!normalizeText(actor.workspaceId) || !normalizeText(actor.partnerId)) {
    return { allowed: false, reason: "missing_identity" };
  }
  if (!input.partnerProfileActive) {
    return { allowed: false, reason: "inactive_partner_profile" };
  }
  if (!input.solicitationAllowed) {
    return { allowed: false, reason: "solicitation_disabled" };
  }
  if (
    !targetAthleteAccess
    || targetAthleteAccess.role !== "athlete"
    || targetAthleteAccess.status !== "active"
    || !normalizeText(targetAthleteAccess.athleteId)
  ) {
    return { allowed: false, reason: "ineligible_athlete" };
  }
  if (actor.workspaceId !== targetAthleteAccess.workspaceId) {
    return { allowed: false, reason: "workspace_mismatch" };
  }
  if (normalizeText(input.targetAthleteId) !== targetAthleteAccess.athleteId) {
    return { allowed: false, reason: "owner_mismatch" };
  }
  return { allowed: true };
};

export const authorizeIntroductionResponse = (
  actor: IntroductionActor,
  request: IntroductionRequestState,
): AccessDecision => {
  if (actor.status !== "active") return { allowed: false, reason: "inactive_actor" };
  if (actor.role !== "athlete") return { allowed: false, reason: "role_forbidden" };
  if (request.requestKind !== "partner_athlete_introduction") {
    return { allowed: false, reason: "wrong_request_kind" };
  }
  if (!normalizeText(actor.workspaceId) || !normalizeText(actor.athleteId)) {
    return { allowed: false, reason: "missing_identity" };
  }
  if (actor.workspaceId !== request.workspaceId) {
    return { allowed: false, reason: "workspace_mismatch" };
  }
  if (actor.athleteId !== request.athleteId) {
    return { allowed: false, reason: "owner_mismatch" };
  }
  return { allowed: true };
};

export const authorizeIntroductionModeration = (
  actor: IntroductionActor,
  request: IntroductionRequestState,
): AccessDecision => {
  if (actor.status !== "active") return { allowed: false, reason: "inactive_actor" };
  if (actor.role !== "admin") return { allowed: false, reason: "role_forbidden" };
  if (request.requestKind !== "partner_athlete_introduction") {
    return { allowed: false, reason: "wrong_request_kind" };
  }
  if (!normalizeText(actor.workspaceId)) return { allowed: false, reason: "missing_identity" };
  if (actor.workspaceId !== request.workspaceId) {
    return { allowed: false, reason: "workspace_mismatch" };
  }
  return { allowed: true };
};

export type CreationWindowDecision =
  | { allowed: true; retryAt: null }
  | {
      allowed: false;
      reason:
        | "suspended_request"
        | "unresolved_request"
        | "refusal_cooldown"
        | "invalid_history";
      blockingRequestId: string;
      retryAt: string | null;
    };

export const evaluateIntroductionCreationWindow = (input: {
  workspaceId: string;
  partnerId: string;
  athleteId: string;
  history: readonly IntroductionPairHistory[];
  now: string | Date;
}): CreationWindowDecision => {
  const now = parseTimestamp(input.now, "now");
  const matching = input.history.filter(
    (request) =>
      request.requestKind === "partner_athlete_introduction"
      && request.workspaceId === input.workspaceId
      && request.partnerId === input.partnerId
      && request.athleteId === input.athleteId,
  );

  const suspended = matching.find((request) => request.moderationStatus === "suspended");
  if (suspended) {
    return {
      allowed: false,
      reason: "suspended_request",
      blockingRequestId: suspended.id,
      retryAt: null,
    };
  }

  const unresolved = matching.find(
    (request) => request.status === "pending" || request.status === "awaiting_athlete",
  );
  if (unresolved) {
    return {
      allowed: false,
      reason: "unresolved_request",
      blockingRequestId: unresolved.id,
      retryAt: null,
    };
  }

  const declined = matching
    .filter((request) => request.status === "declined")
    .sort((left, right) => {
      const leftRank = Date.parse(left.respondedAt ?? left.createdAt);
      const rightRank = Date.parse(right.respondedAt ?? right.createdAt);
      return rightRank - leftRank;
    })[0];

  if (!declined) return { allowed: true, retryAt: null };
  if (!declined.respondedAt) {
    return {
      allowed: false,
      reason: "invalid_history",
      blockingRequestId: declined.id,
      retryAt: null,
    };
  }

  const respondedAt = parseTimestamp(declined.respondedAt, "respondedAt");
  const retryAt = new Date(
    respondedAt.getTime() + PARTNER_INTRODUCTION_REFUSAL_COOLDOWN_DAYS * DAY_IN_MS,
  );
  if (now.getTime() < retryAt.getTime()) {
    return {
      allowed: false,
      reason: "refusal_cooldown",
      blockingRequestId: declined.id,
      retryAt: retryAt.toISOString(),
    };
  }
  return { allowed: true, retryAt: null };
};

export type IdempotencyDecision =
  | { outcome: "new" }
  | { outcome: "replay" }
  | { outcome: "conflict"; reason: "payload_mismatch" }
  | { outcome: "forbidden" };

export const evaluateIdempotency = (input: {
  authorized: boolean;
  attemptedKey: string;
  attemptedPayloadHash: string;
  existing: StoredIdempotentOperation | null;
}): IdempotencyDecision => {
  if (!input.authorized) return { outcome: "forbidden" };
  const attemptedKey = normalizeRequiredText(input.attemptedKey, "idempotencyKey");
  const attemptedPayloadHash = normalizeRequiredText(
    input.attemptedPayloadHash,
    "payloadHash",
  );
  if (!input.existing || input.existing.key !== attemptedKey) return { outcome: "new" };
  return input.existing.payloadHash === attemptedPayloadHash
    ? { outcome: "replay" }
    : { outcome: "conflict", reason: "payload_mismatch" };
};

export type AthleteResponseDecision =
  | {
      outcome: "transition";
      status: "accepted";
      respondedAt: string;
      authorizedContact: InstagramContactPresentation;
      contactConsentedAt: string;
    }
  | {
      outcome: "transition";
      status: "declined";
      respondedAt: string;
      authorizedContact: null;
      contactConsentedAt: null;
    }
  | {
      outcome: "conflict";
      reason:
        | "historical_request"
        | "already_answered"
        | "suspended"
        | "instagram_missing_or_invalid"
        | "contact_changed";
    }
  | { outcome: "forbidden"; reason: AccessDeniedReason };

export const athleteResponseConflictMessages = {
  historical_request: "Cette ancienne demande n’est pas activée pour une réponse directe.",
  already_answered: "Une réponse a déjà été enregistrée pour cette demande.",
  suspended: "Cette demande est suspendue et ne peut pas recevoir de réponse.",
  instagram_missing_or_invalid:
    "Complétez votre profil avec un compte Instagram valide avant d’accepter cette demande.",
  contact_changed:
    "Le compte Instagram présenté a changé. Rechargez la demande avant de confirmer.",
} as const satisfies Record<
  Extract<AthleteResponseDecision, { outcome: "conflict" }>["reason"],
  string
>;

export const decideAthleteResponse = (input: {
  actor: IntroductionActor;
  request: IntroductionRequestState;
  decision: AthleteIntroductionDecision;
  now: string | Date;
  presentedContact?: InstagramContactPresentation | null;
  confirmedContact?: unknown;
  currentInstagram?: unknown;
  currentContactReference?: unknown;
}): AthleteResponseDecision => {
  const access = authorizeIntroductionResponse(input.actor, input.request);
  if (!access.allowed) return { outcome: "forbidden", reason: access.reason };
  if (
    input.request.flowVersion < PARTNER_INTRODUCTION_FLOW_VERSION
    || input.request.status === "pending"
    || !input.request.athleteResponseEnabledAt
  ) {
    return { outcome: "conflict", reason: "historical_request" };
  }
  if (input.request.moderationStatus === "suspended") {
    return { outcome: "conflict", reason: "suspended" };
  }
  if (input.request.status !== "awaiting_athlete") {
    return { outcome: "conflict", reason: "already_answered" };
  }

  const respondedAt = parseTimestamp(input.now, "now").toISOString();
  if (input.decision === "decline") {
    return {
      outcome: "transition",
      status: "declined",
      respondedAt,
      authorizedContact: null,
      contactConsentedAt: null,
    };
  }

  const current = presentInstagramContact({
    rawInstagram: input.currentInstagram,
    contactReference: input.currentContactReference,
  });
  if (!current) {
    return { outcome: "conflict", reason: "instagram_missing_or_invalid" };
  }

  const confirmed = normalizeInstagramContact(input.confirmedContact);
  if (
    !input.presentedContact
    || input.presentedContact.channel !== "instagram"
    || input.presentedContact.value !== current.value
    || input.presentedContact.reference !== current.reference
    || confirmed !== current.value
  ) {
    return { outcome: "conflict", reason: "contact_changed" };
  }

  return {
    outcome: "transition",
    status: "accepted",
    respondedAt,
    authorizedContact: current,
    contactConsentedAt: respondedAt,
  };
};

export type ModerationDecision =
  | {
      outcome: "transition";
      moderationStatus: "clear" | "suspended";
      moderatedAt: string;
    }
  | { outcome: "unchanged"; moderationStatus: "clear" | "suspended" }
  | { outcome: "forbidden"; reason: AccessDeniedReason };

export const decideIntroductionModeration = (input: {
  actor: IntroductionActor;
  request: IntroductionRequestState;
  action: IntroductionModerationAction;
  now: string | Date;
}): ModerationDecision => {
  const access = authorizeIntroductionModeration(input.actor, input.request);
  if (!access.allowed) return { outcome: "forbidden", reason: access.reason };
  const moderationStatus = input.action === "suspend" ? "suspended" : "clear";
  if (input.request.moderationStatus === moderationStatus) {
    return { outcome: "unchanged", moderationStatus };
  }
  return {
    outcome: "transition",
    moderationStatus,
    moderatedAt: parseTimestamp(input.now, "now").toISOString(),
  };
};

const canPartnerReadRequest = (
  request: IntroductionRequestState,
  viewer: IntroductionActor,
): boolean =>
  viewer.status === "active"
  && viewer.role === "partner_expert"
  && viewer.workspaceId === request.workspaceId
  && viewer.partnerId === request.partnerId
  && request.requestKind === "partner_athlete_introduction";

export const projectPartnerIntroductionSummary = (
  request: IntroductionRequestState,
  viewer: IntroductionActor,
): PartnerIntroductionSummary | null => {
  if (!canPartnerReadRequest(request, viewer)) return null;
  return {
    id: request.id,
    athleteId: request.athleteId,
    athletePublicName: request.athletePublicNameSnapshot,
    historical: request.flowVersion < PARTNER_INTRODUCTION_FLOW_VERSION,
    reason: request.reason ?? "",
    message: request.message ?? "",
    status: request.status,
    moderationStatus: request.moderationStatus,
    createdAt: request.createdAt,
    respondedAt: request.respondedAt,
  };
};

export const projectPartnerIntroductionDetail = (
  request: IntroductionRequestState,
  viewer: IntroductionActor,
): PartnerIntroductionDetail | null => {
  const summary = projectPartnerIntroductionSummary(request, viewer);
  if (!summary) return null;
  if (
    request.status !== "accepted"
    || request.moderationStatus !== "clear"
    || request.authorizedContactChannel !== "instagram"
    || !request.authorizedContactValueSnapshot
    || !request.contactConsentedAt
  ) {
    return summary;
  }
  return {
    ...summary,
    authorizedContact: {
      channel: "instagram",
      value: request.authorizedContactValueSnapshot,
      consentedAt: request.contactConsentedAt,
    },
  };
};

export const projectAthleteIntroductionDetail = (
  request: IntroductionRequestState,
  viewer: IntroductionActor,
): AthleteIntroductionDetail | null => {
  if (!authorizeIntroductionResponse(viewer, request).allowed) return null;
  return {
    id: request.id,
    partnerPublicName: request.partnerPublicNameSnapshot,
    reason: request.reason ?? "",
    message: request.message ?? "",
    status: request.status,
    moderationStatus: request.moderationStatus,
    createdAt: request.createdAt,
    respondedAt: request.respondedAt,
  };
};

export const resolveIntroductionStaleDays = (rawValue: unknown): number => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return PARTNER_INTRODUCTION_DEFAULT_STALE_DAYS;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    throw new Error("PARTNER_REQUEST_STALE_DAYS doit être un entier entre 1 et 365.");
  }
  return parsed;
};

export const isIntroductionStale = (input: {
  request: IntroductionRequestState;
  now: string | Date;
  staleDays?: number;
}): boolean => {
  if (
    input.request.status !== "awaiting_athlete"
    || input.request.moderationStatus !== "clear"
    || !input.request.athleteResponseEnabledAt
  ) {
    return false;
  }
  const staleDays = resolveIntroductionStaleDays(input.staleDays);
  const enabledAt = parseTimestamp(
    input.request.athleteResponseEnabledAt,
    "athleteResponseEnabledAt",
  );
  const now = parseTimestamp(input.now, "now");
  return now.getTime() - enabledAt.getTime() >= staleDays * DAY_IN_MS;
};

export const buildIntroductionEvent = (
  event: IntroductionDomainEvent,
): IntroductionDomainEvent => ({
  requestId: normalizeRequiredText(event.requestId, "requestId"),
  workspaceId: normalizeRequiredText(event.workspaceId, "workspaceId"),
  eventType: event.eventType,
  actorClerkUserId: normalizeRequiredText(event.actorClerkUserId, "actorClerkUserId"),
  actorRole: event.actorRole,
  requestStatus: event.requestStatus,
  moderationStatus: event.moderationStatus,
  idempotencyKey: normalizeRequiredText(event.idempotencyKey, "idempotencyKey"),
  payloadHash: normalizeRequiredText(event.payloadHash, "payloadHash"),
  occurredAt: parseTimestamp(event.occurredAt, "occurredAt").toISOString(),
});

export const buildIntroductionNotification = (input: {
  eventId: string;
  requestId: string;
  recipientClerkUserId: string;
  event:
    | "created"
    | "accepted"
    | "declined"
    | "suspended"
    | "reactivated";
}): IntroductionNotification => {
  const labels = {
    created: {
      title: "Nouvelle demande de mise en relation",
      body: "Une demande attend votre réponse.",
      actionHref: `/athlete/partner-contact-requests/${encodeURIComponent(input.requestId)}`,
    },
    accepted: {
      title: "Demande de mise en relation acceptée",
      body: "L’athlète a accepté votre demande. Consultez le détail sécurisé.",
      actionHref: `/partner/contact-requests/${encodeURIComponent(input.requestId)}`,
    },
    declined: {
      title: "Demande de mise en relation refusée",
      body: "L’athlète a refusé votre demande.",
      actionHref: `/partner/contact-requests/${encodeURIComponent(input.requestId)}`,
    },
    suspended: {
      title: "Demande de mise en relation suspendue",
      body: "Cette demande a été suspendue par KLIQUE.",
      actionHref: `/partner/contact-requests/${encodeURIComponent(input.requestId)}`,
    },
    reactivated: {
      title: "Demande de mise en relation réactivée",
      body: "Cette demande a été réactivée par KLIQUE.",
      actionHref: `/partner/contact-requests/${encodeURIComponent(input.requestId)}`,
    },
  } as const;
  const selected = labels[input.event];
  return {
    recipientClerkUserId: normalizeRequiredText(
      input.recipientClerkUserId,
      "recipientClerkUserId",
    ),
    type: `partner_athlete_introduction.${input.event}`,
    title: selected.title,
    body: selected.body,
    actionHref: selected.actionHref,
    eventKey: normalizeRequiredText(input.eventId, "eventId"),
  };
};
