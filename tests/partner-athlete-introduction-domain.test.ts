import { describe, expect, it } from "vitest";
import type {
  IntroductionActor,
  IntroductionRequestState,
} from "@/lib/partner-athlete-introductions/contracts";
import {
  PARTNER_INTRODUCTION_FLOW_VERSION,
  athleteResponseConflictMessages,
  authorizeIntroductionCreation,
  authorizeIntroductionModeration,
  authorizeIntroductionResponse,
  buildIntroductionEvent,
  buildIntroductionNotification,
  decideAthleteResponse,
  decideIntroductionModeration,
  evaluateIdempotency,
  evaluateIntroductionCreationWindow,
  fingerprintIntroductionCreation,
  fingerprintIntroductionResponse,
  isIntroductionStale,
  normalizeInstagramContact,
  presentInstagramContact,
  projectPartnerIntroductionDetail,
  projectPartnerIntroductionSummary,
  resolveIntroductionStaleDays,
} from "@/lib/partner-athlete-introductions/domain";

const activePartner: IntroductionActor = {
  clerkUserId: "partner-user",
  role: "partner_expert",
  status: "active",
  workspaceId: "workspace-1",
  athleteId: null,
  partnerId: "partner-1",
};

const activeAthlete: IntroductionActor = {
  clerkUserId: "athlete-user",
  role: "athlete",
  status: "active",
  workspaceId: "workspace-1",
  athleteId: "athlete-1",
  partnerId: null,
};

const activeAdmin: IntroductionActor = {
  clerkUserId: "admin-user",
  role: "admin",
  status: "active",
  workspaceId: "workspace-1",
  athleteId: null,
  partnerId: null,
};

const requestState = (
  overrides: Partial<IntroductionRequestState> = {},
): IntroductionRequestState => ({
  id: "request-1",
  workspaceId: "workspace-1",
  athleteId: "athlete-1",
  partnerId: "partner-1",
  requestKind: "partner_athlete_introduction",
  flowVersion: PARTNER_INTRODUCTION_FLOW_VERSION,
  status: "awaiting_athlete",
  moderationStatus: "clear",
  athleteResponseEnabledAt: "2026-10-01T10:00:00.000Z",
  respondedAt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  partnerPublicNameSnapshot: "Studio Exemple",
  athletePublicNameSnapshot: "Mila Martin",
  authorizedContactChannel: null,
  authorizedContactValueSnapshot: null,
  authorizedContactReference: null,
  contactConsentedAt: null,
  ...overrides,
});

describe("partner introduction access contracts", () => {
  it("allows only an active partner and an active target athlete in the same workspace", () => {
    expect(authorizeIntroductionCreation({
      actor: activePartner,
      targetAthleteId: "athlete-1",
      targetAthleteAccess: activeAthlete,
      partnerProfileActive: true,
      solicitationAllowed: true,
    })).toEqual({ allowed: true });

    expect(authorizeIntroductionCreation({
      actor: activePartner,
      targetAthleteId: "athlete-2",
      targetAthleteAccess: activeAthlete,
      partnerProfileActive: true,
      solicitationAllowed: true,
    })).toEqual({ allowed: false, reason: "owner_mismatch" });

    expect(authorizeIntroductionCreation({
      actor: activePartner,
      targetAthleteId: "athlete-1",
      targetAthleteAccess: { ...activeAthlete, workspaceId: "workspace-2" },
      partnerProfileActive: true,
      solicitationAllowed: true,
    })).toEqual({ allowed: false, reason: "workspace_mismatch" });

    expect(authorizeIntroductionCreation({
      actor: activePartner,
      targetAthleteId: "athlete-1",
      targetAthleteAccess: activeAthlete,
      partnerProfileActive: true,
      solicitationAllowed: false,
    })).toEqual({ allowed: false, reason: "solicitation_disabled" });

    expect(authorizeIntroductionCreation({
      actor: activePartner,
      targetAthleteId: "athlete-1",
      targetAthleteAccess: activeAthlete,
      partnerProfileActive: false,
      solicitationAllowed: true,
    })).toEqual({ allowed: false, reason: "inactive_partner_profile" });
  });

  it("allows only the active target athlete to answer", () => {
    expect(authorizeIntroductionResponse(activeAthlete, requestState())).toEqual({ allowed: true });
    expect(authorizeIntroductionResponse(
      { ...activeAthlete, athleteId: "athlete-2" },
      requestState(),
    )).toEqual({ allowed: false, reason: "owner_mismatch" });
    expect(authorizeIntroductionResponse(
      { ...activeAthlete, workspaceId: "workspace-2" },
      requestState(),
    )).toEqual({ allowed: false, reason: "workspace_mismatch" });
    expect(authorizeIntroductionResponse(
      { ...activeAthlete, status: "disabled" },
      requestState(),
    )).toEqual({ allowed: false, reason: "inactive_actor" });
  });

  it("allows Admin moderation but never treats Admin as the athlete", () => {
    expect(authorizeIntroductionModeration(activeAdmin, requestState())).toEqual({ allowed: true });
    expect(authorizeIntroductionResponse(activeAdmin, requestState())).toEqual({
      allowed: false,
      reason: "role_forbidden",
    });
  });

  it("keeps generic athlete contact requests outside the introduction flow", () => {
    const generic = requestState({
      requestKind: "athlete_contact",
      status: "open",
      flowVersion: 1,
      athleteResponseEnabledAt: null,
    });
    expect(authorizeIntroductionResponse(activeAthlete, generic)).toEqual({
      allowed: false,
      reason: "wrong_request_kind",
    });
    expect(authorizeIntroductionModeration(activeAdmin, generic)).toEqual({
      allowed: false,
      reason: "wrong_request_kind",
    });
  });
});

describe("Instagram consent", () => {
  it.each([
    [" @Mila.Example ", "@mila.example"],
    ["mila_example", "@mila_example"],
    ["https://www.instagram.com/Mila.Example/", "@mila.example"],
    ["instagram.com/mila_example?hl=fr", "@mila_example"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeInstagramContact(input)).toBe(expected);
  });

  it.each([
    "",
    "@bad..handle",
    ".leading",
    "trailing.",
    "https://example.com/mila",
    "https://instagram.com/p/publication",
    "name with spaces",
  ])("rejects invalid Instagram %s", (input) => {
    expect(normalizeInstagramContact(input)).toBeNull();
  });

  it("accepts only the exact presented current contact and reference", () => {
    const presentedContact = presentInstagramContact({
      rawInstagram: "@Mila.Example",
      contactReference: "profile-version-7",
    });

    expect(decideAthleteResponse({
      actor: activeAthlete,
      request: requestState(),
      decision: "accept",
      now: "2026-10-20T08:00:00.000Z",
      presentedContact,
      confirmedContact: "@mila.example",
      currentInstagram: "instagram.com/mila.example",
      currentContactReference: "profile-version-7",
    })).toEqual({
      outcome: "transition",
      status: "accepted",
      respondedAt: "2026-10-20T08:00:00.000Z",
      authorizedContact: {
        channel: "instagram",
        value: "@mila.example",
        reference: "profile-version-7",
      },
      contactConsentedAt: "2026-10-20T08:00:00.000Z",
    });
  });

  it("rejects acceptance when Instagram is missing, invalid or changed", () => {
    const presentedContact = presentInstagramContact({
      rawInstagram: "@mila",
      contactReference: "version-1",
    });

    expect(decideAthleteResponse({
      actor: activeAthlete,
      request: requestState(),
      decision: "accept",
      now: "2026-10-20T08:00:00.000Z",
      presentedContact,
      confirmedContact: "@mila",
      currentInstagram: "",
      currentContactReference: "version-1",
    })).toEqual({ outcome: "conflict", reason: "instagram_missing_or_invalid" });
    expect(athleteResponseConflictMessages.instagram_missing_or_invalid).toContain(
      "Complétez votre profil",
    );

    expect(decideAthleteResponse({
      actor: activeAthlete,
      request: requestState(),
      decision: "accept",
      now: "2026-10-20T08:00:00.000Z",
      presentedContact,
      confirmedContact: "@mila",
      currentInstagram: "@mila",
      currentContactReference: "version-2",
    })).toEqual({ outcome: "conflict", reason: "contact_changed" });
  });

  it("still allows refusal without Instagram", () => {
    expect(decideAthleteResponse({
      actor: activeAthlete,
      request: requestState(),
      decision: "decline",
      now: "2026-10-20T08:00:00.000Z",
      currentInstagram: null,
      currentContactReference: null,
    })).toEqual({
      outcome: "transition",
      status: "declined",
      respondedAt: "2026-10-20T08:00:00.000Z",
      authorizedContact: null,
      contactConsentedAt: null,
    });
  });
});

describe("state transitions and moderation", () => {
  it("accepts or declines only from awaiting_athlete and clear", () => {
    expect(decideAthleteResponse({
      actor: activeAthlete,
      request: requestState({ status: "accepted" }),
      decision: "decline",
      now: "2026-10-20T08:00:00.000Z",
    })).toEqual({ outcome: "conflict", reason: "already_answered" });

    expect(decideAthleteResponse({
      actor: activeAthlete,
      request: requestState({ moderationStatus: "suspended" }),
      decision: "decline",
      now: "2026-10-20T08:00:00.000Z",
    })).toEqual({ outcome: "conflict", reason: "suspended" });
  });

  it("never activates a historical pending request", () => {
    expect(decideAthleteResponse({
      actor: activeAthlete,
      request: requestState({
        flowVersion: 1,
        status: "pending",
        athleteResponseEnabledAt: null,
      }),
      decision: "decline",
      now: "2026-10-20T08:00:00.000Z",
    })).toEqual({ outcome: "conflict", reason: "historical_request" });
  });

  it("suspends and reactivates independently from the request status", () => {
    expect(decideIntroductionModeration({
      actor: activeAdmin,
      request: requestState({ status: "accepted" }),
      action: "suspend",
      now: "2026-10-20T08:00:00.000Z",
    })).toEqual({
      outcome: "transition",
      moderationStatus: "suspended",
      moderatedAt: "2026-10-20T08:00:00.000Z",
    });

    expect(decideIntroductionModeration({
      actor: activeAdmin,
      request: requestState({ moderationStatus: "suspended" }),
      action: "reactivate",
      now: "2026-10-21T08:00:00.000Z",
    })).toEqual({
      outcome: "transition",
      moderationStatus: "clear",
      moderatedAt: "2026-10-21T08:00:00.000Z",
    });
  });
});

describe("creation serialization policy", () => {
  const history = (
    status: IntroductionRequestState["status"],
    overrides: Partial<IntroductionRequestState> = {},
  ) => [requestState({ status, ...overrides })];

  it.each(["pending", "awaiting_athlete"] as const)(
    "blocks another request while %s, including when suspended",
    (status) => {
      expect(evaluateIntroductionCreationWindow({
        workspaceId: "workspace-1",
        partnerId: "partner-1",
        athleteId: "athlete-1",
        history: history(status),
        now: "2026-10-20T08:00:00.000Z",
      })).toMatchObject({ allowed: false, reason: "unresolved_request" });

      expect(evaluateIntroductionCreationWindow({
        workspaceId: "workspace-1",
        partnerId: "partner-1",
        athleteId: "athlete-1",
        history: history(status, { moderationStatus: "suspended" }),
        now: "2026-10-20T08:00:00.000Z",
      })).toMatchObject({ allowed: false, reason: "suspended_request" });
    },
  );

  it("prevents bypassing any suspended request with a new creation", () => {
    expect(evaluateIntroductionCreationWindow({
      workspaceId: "workspace-1",
      partnerId: "partner-1",
      athleteId: "athlete-1",
      history: history("accepted", { moderationStatus: "suspended" }),
      now: "2026-10-20T08:00:00.000Z",
    })).toMatchObject({ allowed: false, reason: "suspended_request" });
  });

  it("enforces the exact 30-day refusal cooldown", () => {
    const declined = history("declined", {
      respondedAt: "2026-09-20T08:00:00.000Z",
    });
    expect(evaluateIntroductionCreationWindow({
      workspaceId: "workspace-1",
      partnerId: "partner-1",
      athleteId: "athlete-1",
      history: declined,
      now: "2026-10-20T07:59:59.999Z",
    })).toEqual({
      allowed: false,
      reason: "refusal_cooldown",
      blockingRequestId: "request-1",
      retryAt: "2026-10-20T08:00:00.000Z",
    });
    expect(evaluateIntroductionCreationWindow({
      workspaceId: "workspace-1",
      partnerId: "partner-1",
      athleteId: "athlete-1",
      history: declined,
      now: "2026-10-20T08:00:00.000Z",
    })).toEqual({ allowed: true, retryAt: null });
  });

  it("ignores generic and other-workspace history", () => {
    expect(evaluateIntroductionCreationWindow({
      workspaceId: "workspace-1",
      partnerId: "partner-1",
      athleteId: "athlete-1",
      history: [
        requestState({ requestKind: "athlete_contact", status: "pending" }),
        requestState({ workspaceId: "workspace-2", status: "awaiting_athlete" }),
      ],
      now: "2026-10-20T08:00:00.000Z",
    })).toEqual({ allowed: true, retryAt: null });
  });
});

describe("idempotency", () => {
  it("treats same key and payload as replay and a different payload as conflict", () => {
    const payloadHash = fingerprintIntroductionCreation({
      athleteId: "athlete-1",
      reason: "Sponsoring",
      message: "Bonjour",
    });
    const existing = { key: "idem-1", payloadHash };

    expect(evaluateIdempotency({
      authorized: true,
      attemptedKey: "idem-1",
      attemptedPayloadHash: payloadHash,
      existing,
    })).toEqual({ outcome: "replay" });

    expect(evaluateIdempotency({
      authorized: true,
      attemptedKey: "idem-1",
      attemptedPayloadHash: fingerprintIntroductionCreation({
        athleteId: "athlete-1",
        reason: "Autre motif",
      }),
      existing,
    })).toEqual({ outcome: "conflict", reason: "payload_mismatch" });
  });

  it("rechecks authorization before returning a replay", () => {
    expect(evaluateIdempotency({
      authorized: false,
      attemptedKey: "idem-1",
      attemptedPayloadHash: "hash-1",
      existing: { key: "idem-1", payloadHash: "hash-1" },
    })).toEqual({ outcome: "forbidden" });
  });

  it("fingerprints the response contact confirmation and reference", () => {
    expect(fingerprintIntroductionResponse({
      decision: "accept",
      confirmedContact: "@mila",
      contactReference: "version-1",
    })).not.toBe(fingerprintIntroductionResponse({
      decision: "accept",
      confirmedContact: "@mila",
      contactReference: "version-2",
    }));
  });
});

describe("safe projections and notifications", () => {
  const accepted = requestState({
    status: "accepted",
    respondedAt: "2026-10-20T08:00:00.000Z",
    authorizedContactChannel: "instagram",
    authorizedContactValueSnapshot: "@mila",
    authorizedContactReference: "version-1",
    contactConsentedAt: "2026-10-20T08:00:00.000Z",
  });

  it("never exposes contact in list projections", () => {
    expect(projectPartnerIntroductionSummary(accepted, activePartner)).toEqual({
      id: "request-1",
      athleteId: "athlete-1",
      athletePublicName: "Mila Martin",
      reason: "",
      message: "",
      status: "accepted",
      moderationStatus: "clear",
      createdAt: "2026-10-01T10:00:00.000Z",
      respondedAt: "2026-10-20T08:00:00.000Z",
    });
  });

  it("exposes contact only to the owning partner while accepted and clear", () => {
    expect(projectPartnerIntroductionDetail(accepted, activePartner)).toHaveProperty(
      "authorizedContact.value",
      "@mila",
    );
    expect(projectPartnerIntroductionDetail(
      accepted,
      { ...activePartner, partnerId: "partner-2" },
    )).toBeNull();
    expect(projectPartnerIntroductionDetail(
      { ...accepted, moderationStatus: "suspended" },
      activePartner,
    )).not.toHaveProperty("authorizedContact");
  });

  it("does not return contact on a replay after suspension", () => {
    expect(evaluateIdempotency({
      authorized: true,
      attemptedKey: "response-1",
      attemptedPayloadHash: "hash-1",
      existing: { key: "response-1", payloadHash: "hash-1" },
    })).toEqual({ outcome: "replay" });
    expect(projectPartnerIntroductionDetail(
      { ...accepted, moderationStatus: "suspended" },
      activePartner,
    )).not.toHaveProperty("authorizedContact");
  });

  it("keeps contacts out of events and notifications", () => {
    const event = buildIntroductionEvent({
      requestId: "request-1",
      workspaceId: "workspace-1",
      eventType: "athlete_accepted",
      actorClerkUserId: "athlete-user",
      actorRole: "athlete",
      requestStatus: "accepted",
      moderationStatus: "clear",
      idempotencyKey: "response-1",
      payloadHash: "hash-1",
      occurredAt: "2026-10-20T08:00:00.000Z",
    });
    const notification = buildIntroductionNotification({
      eventId: "event-1",
      requestId: "request-1",
      recipientClerkUserId: "partner-user",
      event: "accepted",
    });
    expect(JSON.stringify(event)).not.toContain("@mila");
    expect(JSON.stringify(notification)).not.toContain("@mila");
    expect(notification.body).toContain("détail sécurisé");
  });
});

describe("stale requests", () => {
  it("defaults to five days and validates configuration", () => {
    expect(resolveIntroductionStaleDays(undefined)).toBe(5);
    expect(resolveIntroductionStaleDays("7")).toBe(7);
    expect(() => resolveIntroductionStaleDays("0")).toThrow();
    expect(() => resolveIntroductionStaleDays("5.5")).toThrow();
    expect(() => resolveIntroductionStaleDays("abc")).toThrow();
  });

  it("becomes stale exactly five days after athlete response activation", () => {
    const request = requestState({
      athleteResponseEnabledAt: "2026-10-15T08:00:00.000Z",
    });
    expect(isIntroductionStale({
      request,
      now: "2026-10-20T07:59:59.999Z",
    })).toBe(false);
    expect(isIntroductionStale({
      request,
      now: "2026-10-20T08:00:00.000Z",
    })).toBe(true);
    expect(isIntroductionStale({
      request: { ...request, moderationStatus: "suspended" },
      now: "2026-10-21T08:00:00.000Z",
    })).toBe(false);
  });
});
