import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminIntroductionDetail,
  IntroductionActor,
  IntroductionRequestState,
} from "@/lib/partner-athlete-introductions/contracts";
import {
  buildInstagramContactReference,
  contactReferencesEqual,
} from "@/lib/partner-athlete-introductions/contact-reference";
import type { PartnerAthleteIntroductionDirectory } from "@/lib/partner-athlete-introductions/directory";
import {
  getPartnerAthleteIntroductionOutboxDiagnostics,
  processPartnerAthleteIntroductionOutbox,
} from "@/lib/partner-athlete-introductions/outbox";
import type {
  PartnerAthleteIntroductionRepository,
} from "@/lib/partner-athlete-introductions/repository";
import {
  PartnerAthleteIntroductionConflictError,
  PartnerAthleteIntroductionForbiddenError,
  createPartnerAthleteIntroductionService,
} from "@/lib/partner-athlete-introductions/service";

const secret = "test-secret-that-is-longer-than-thirty-two-characters";

const partnerActor: IntroductionActor = {
  clerkUserId: "partner-user",
  role: "partner_expert",
  status: "active",
  workspaceId: "workspace-1",
  athleteId: null,
  partnerId: "partner-1",
};

const athleteActor: IntroductionActor = {
  clerkUserId: "athlete-user",
  role: "athlete",
  status: "active",
  workspaceId: "workspace-1",
  athleteId: "athlete-1",
  partnerId: null,
};

const request = (
  overrides: Partial<IntroductionRequestState> = {},
): IntroductionRequestState => ({
  id: "request-1",
  workspaceId: "workspace-1",
  athleteId: "athlete-1",
  partnerId: "partner-1",
  requestKind: "partner_athlete_introduction",
  flowVersion: 2,
  status: "awaiting_athlete",
  moderationStatus: "clear",
  athleteResponseEnabledAt: "2026-10-20T08:00:00.000Z",
  respondedAt: null,
  createdAt: "2026-10-20T08:00:00.000Z",
  partnerPublicNameSnapshot: "Studio Exemple",
  athletePublicNameSnapshot: "Mila Martin",
  authorizedContactChannel: null,
  authorizedContactValueSnapshot: null,
  authorizedContactReference: null,
  contactConsentedAt: null,
  ...overrides,
});

const adminDetail = (
  overrides: Partial<AdminIntroductionDetail> = {},
): AdminIntroductionDetail => ({
  id: "request-1",
  partnerId: "partner-1",
  athleteId: "athlete-1",
  partnerPublicName: "",
  athletePublicName: "",
  historical: true,
  reason: "Sponsoring",
  message: "Bonjour",
  status: "pending" as const,
  moderationStatus: "clear" as const,
  createdAt: "2026-10-20T08:00:00.000Z",
  respondedAt: null,
  ageDays: 10,
  stale: false,
  reported: false,
  solicitationAllowed: true,
  events: [],
  reports: [],
  solicitationEvents: [],
  ...overrides,
});

const repositoryDouble = (): PartnerAthleteIntroductionRepository => ({
  create: vi.fn(),
  activateHistorical: vi.fn(),
  respond: vi.fn(),
  moderate: vi.fn(),
  setPartnerSolicitation: vi.fn(),
  getForAthlete: vi.fn(),
  getForPartner: vi.fn(),
  listForAthlete: vi.fn(),
  listForPartner: vi.fn(),
  listForAdmin: vi.fn(),
  getForAdmin: vi.fn(),
  report: vi.fn(),
  handleReport: vi.fn(),
  getOutboxDiagnostics: vi.fn(),
  claimOutbox: vi.fn(),
  deliverOutbox: vi.fn(),
  failOutbox: vi.fn(),
});

const directoryDouble = (): PartnerAthleteIntroductionDirectory => ({
  resolvePartnerProfile: vi.fn(),
  resolveAthleteProfile: vi.fn(),
  resolveCanonicalPartnerProfile: vi.fn(),
  resolveCanonicalAthleteProfile: vi.fn(),
});

describe("contact reference", () => {
  it("binds the reference to workspace, request, athlete and normalized contact", () => {
    const base = {
      secret,
      workspaceId: "workspace-1",
      requestId: "request-1",
      athleteId: "athlete-1",
      normalizedInstagram: "@mila",
    };
    const reference = buildInstagramContactReference(base);
    expect(reference).toMatch(/^v1\./);
    expect(buildInstagramContactReference({ ...base, normalizedInstagram: "MILA" }))
      .toBe(reference);
    expect(buildInstagramContactReference({ ...base, requestId: "request-2" }))
      .not.toBe(reference);
    expect(buildInstagramContactReference({ ...base, athleteId: "athlete-2" }))
      .not.toBe(reference);
    expect(buildInstagramContactReference({ ...base, workspaceId: "workspace-2" }))
      .not.toBe(reference);
    expect(buildInstagramContactReference({ ...base, normalizedInstagram: "@other" }))
      .not.toBe(reference);
    expect(contactReferencesEqual(reference, reference)).toBe(true);
    expect(contactReferencesEqual(reference, `${reference}x`)).toBe(false);
  });
});

describe("partner introduction server service", () => {
  let repository: PartnerAthleteIntroductionRepository;
  let directory: PartnerAthleteIntroductionDirectory;

  beforeEach(() => {
    repository = repositoryDouble();
    directory = directoryDouble();
    vi.mocked(directory.resolvePartnerProfile).mockResolvedValue({
      active: true,
      publicName: "Studio Exemple",
    });
    vi.mocked(directory.resolveAthleteProfile).mockResolvedValue({
      publicName: "Mila Martin",
      instagram: "@mila",
    });
    vi.mocked(directory.resolveCanonicalPartnerProfile).mockResolvedValue({
      outcome: "resolved",
      profile: { active: true, publicName: "Studio Exemple" },
    });
    vi.mocked(directory.resolveCanonicalAthleteProfile).mockResolvedValue({
      outcome: "resolved",
      profile: { publicName: "Mila Martin", instagram: "@mila" },
    });
  });

  it("resolves active profiles server-side before transactional creation", async () => {
    vi.mocked(repository.create).mockResolvedValue({
      outcome: "created",
      request: request(),
      retryAt: null,
    });
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    await service.create({
      actor: partnerActor,
      payload: {
        athleteId: "athlete-1",
        reason: "Sponsoring",
        message: "Bonjour",
      },
      idempotencyKey: "create-1",
      now: new Date("2026-10-20T08:00:00.000Z"),
    });

    expect(directory.resolvePartnerProfile).toHaveBeenCalledWith("partner-1");
    expect(directory.resolveAthleteProfile).toHaveBeenCalledWith("athlete-1");
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      partnerPublicName: "Studio Exemple",
      athletePublicName: "Mila Martin",
      idempotencyKey: "create-1",
    }));
  });

  it("refuses creation before persistence when the canonical partner profile is inactive", async () => {
    vi.mocked(directory.resolvePartnerProfile).mockResolvedValue({
      active: false,
      publicName: "Studio Exemple",
    });
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    await expect(service.create({
      actor: partnerActor,
      payload: { athleteId: "athlete-1", reason: "Sponsoring" },
      idempotencyKey: "create-1",
    })).rejects.toBeInstanceOf(PartnerAthleteIntroductionForbiddenError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("lists only requests returned through the server-scoped partner repository", async () => {
    vi.mocked(repository.listForPartner).mockResolvedValue([
      request({ reason: "Sponsoring", message: "Bonjour" }),
    ]);
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    const result = await service.listForPartner({ actor: partnerActor });

    expect(repository.listForPartner).toHaveBeenCalledWith(partnerActor);
    expect(result).toEqual([
      expect.objectContaining({
        athletePublicName: "Mila Martin",
        reason: "Sponsoring",
        message: "Bonjour",
      }),
    ]);
    expect(result[0]).not.toHaveProperty("authorizedContact");
  });

  it("marks a server-scoped historical partner request without exposing contact", async () => {
    vi.mocked(repository.listForPartner).mockResolvedValue([
      request({ flowVersion: 1, status: "pending" }),
    ]);
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    const result = await service.listForPartner({ actor: partnerActor });

    expect(result).toEqual([
      expect.objectContaining({ historical: true, status: "pending" }),
    ]);
    expect(result[0]).not.toHaveProperty("authorizedContact");
  });

  it("refuses athlete listing for another role before querying persistence", async () => {
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    await expect(service.listForAthlete({ actor: partnerActor }))
      .rejects.toBeInstanceOf(PartnerAthleteIntroductionForbiddenError);
    expect(repository.listForAthlete).not.toHaveBeenCalled();
  });

  it("never exposes contact snapshots or references in athlete list projections", async () => {
    vi.mocked(repository.listForAthlete).mockResolvedValue([
      request({
        status: "accepted",
        authorizedContactChannel: "instagram",
        authorizedContactValueSnapshot: "@mila",
        authorizedContactReference: "private-reference",
        contactConsentedAt: "2026-10-20T09:00:00.000Z",
      }),
    ]);
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    const result = await service.listForAthlete({ actor: athleteActor });

    expect(result).toEqual([
      expect.objectContaining({ partnerPublicName: "Studio Exemple", status: "accepted" }),
    ]);
    expect(result[0]).not.toHaveProperty("authorizedContactValueSnapshot");
    expect(result[0]).not.toHaveProperty("authorizedContactReference");
  });

  it("refuses Admin supervision reads for a non-Admin actor", async () => {
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    await expect(service.listForAdmin({
      actor: partnerActor,
      staleDays: 5,
    })).rejects.toBeInstanceOf(PartnerAthleteIntroductionForbiddenError);
    expect(repository.listForAdmin).not.toHaveBeenCalled();
  });

  it("returns an Admin detail projection without consent contact fields", async () => {
    vi.mocked(repository.getForAdmin).mockResolvedValue({
      id: "request-1",
      partnerId: "partner-1",
      athleteId: "athlete-1",
      partnerPublicName: "Studio Exemple",
      athletePublicName: "Mila Martin",
      historical: false,
      reason: "Sponsoring",
      message: "Bonjour",
      status: "accepted",
      moderationStatus: "clear",
      createdAt: "2026-10-20T08:00:00.000Z",
      respondedAt: "2026-10-20T09:00:00.000Z",
      ageDays: 0,
      stale: false,
      reported: false,
      solicitationAllowed: true,
      events: [],
      reports: [],
      solicitationEvents: [],
    });
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    const detail = await service.getAdminDetail({
      actor: { ...partnerActor, role: "admin", partnerId: null },
      requestId: "request-1",
      staleDays: 5,
    });

    expect(detail).not.toHaveProperty("authorizedContact");
    expect(detail).not.toHaveProperty("authorizedContactValueSnapshot");
    expect(detail).not.toHaveProperty("authorizedContactReference");
  });

  it("resolves missing historical names only through exact canonical identities", async () => {
      vi.mocked(repository.listForAdmin).mockResolvedValue({
        items: [adminDetail()],
        total: 1,
        counters: { historical: 1, stale: 0 },
      });
      const service = createPartnerAthleteIntroductionService({
        repository,
        directory,
        contactReferenceSecret: () => secret,
      });

      const result = await service.listForAdmin({
        actor: { ...partnerActor, role: "admin", partnerId: null },
        historicalOnly: true,
        staleDays: 5,
      });

      expect(directory.resolveCanonicalPartnerProfile).toHaveBeenCalledWith("partner-1");
      expect(directory.resolveCanonicalAthleteProfile).toHaveBeenCalledWith("athlete-1");
      expect(result.items[0]).toMatchObject({
        partnerPublicName: "Studio Exemple",
        athletePublicName: "Mila Martin",
      });
      expect(repository.listForAdmin).toHaveBeenCalledWith(expect.objectContaining({
        historicalOnly: true,
        staleOnly: false,
      }));
  });

  it("activates one pending historical request with canonical snapshots", async () => {
      vi.mocked(repository.getForAdmin).mockResolvedValue(adminDetail());
      vi.mocked(repository.activateHistorical).mockResolvedValue({
        outcome: "transitioned",
        request: request(),
        retryAt: null,
      });
      const service = createPartnerAthleteIntroductionService({
        repository,
        directory,
        contactReferenceSecret: () => secret,
      });
      const admin = { ...partnerActor, role: "admin" as const, partnerId: null };

      await expect(service.activateHistorical({
        actor: admin,
        requestId: "request-1",
        idempotencyKey: "activate-1",
        now: new Date("2026-10-30T08:00:00.000Z"),
      })).resolves.toMatchObject({ outcome: "transitioned" });

      expect(repository.activateHistorical).toHaveBeenCalledWith(expect.objectContaining({
        actor: admin,
        requestId: "request-1",
        partnerPublicName: "Studio Exemple",
        athletePublicName: "Mila Martin",
        idempotencyKey: "activate-1",
        now: "2026-10-30T08:00:00.000Z",
      }));
  });

  it("blocks ambiguous canonical identities before historical activation", async () => {
      vi.mocked(repository.getForAdmin).mockResolvedValue(adminDetail());
      vi.mocked(directory.resolveCanonicalPartnerProfile).mockResolvedValue({
        outcome: "ambiguous",
        profile: null,
      });
      const service = createPartnerAthleteIntroductionService({
        repository,
        directory,
        contactReferenceSecret: () => secret,
      });

      await expect(service.activateHistorical({
        actor: { ...partnerActor, role: "admin", partnerId: null },
        requestId: "request-1",
        idempotencyKey: "activate-1",
      })).rejects.toMatchObject({ outcome: "identity_ambiguous" });
      expect(repository.activateHistorical).not.toHaveBeenCalled();
  });

  it("reports a missing active athlete access without presenting it as an Admin denial", async () => {
      vi.mocked(repository.getForAdmin).mockResolvedValue(adminDetail());
      vi.mocked(repository.activateHistorical).mockResolvedValue({
        outcome: "ineligible_athlete",
        request: null,
        retryAt: null,
      });
      const service = createPartnerAthleteIntroductionService({
        repository,
        directory,
        contactReferenceSecret: () => secret,
      });

      await expect(service.activateHistorical({
        actor: { ...partnerActor, role: "admin", partnerId: null },
        requestId: "request-1",
        idempotencyKey: "activate-1",
      })).rejects.toMatchObject({
        message: "L’athlète ne dispose pas d’un accès actif permettant de recevoir cette demande.",
        outcome: "ineligible_athlete",
      });
  });

  it("does not offer activation semantics to a resolved historical request", async () => {
      vi.mocked(repository.getForAdmin).mockResolvedValue(adminDetail({ status: "resolved" }));
      const service = createPartnerAthleteIntroductionService({
        repository,
        directory,
        contactReferenceSecret: () => secret,
      });

      await expect(service.activateHistorical({
        actor: { ...partnerActor, role: "admin", partnerId: null },
        requestId: "request-1",
        idempotencyKey: "activate-1",
      })).rejects.toMatchObject({ outcome: "historical_request" });
      expect(directory.resolveCanonicalPartnerProfile).not.toHaveBeenCalled();
      expect(repository.activateHistorical).not.toHaveBeenCalled();
  });

  it("allows only the destination athlete to submit a report through persistence checks", async () => {
    vi.mocked(repository.report).mockResolvedValue("created");
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    await expect(service.report({
      actor: athleteActor,
      requestId: "request-1",
      reason: "Contenu inapproprié",
      comment: "Détail",
      idempotencyKey: "report-1",
    })).resolves.toBe("created");
    expect(repository.report).toHaveBeenCalledWith(expect.objectContaining({
      actor: athleteActor,
      requestId: "request-1",
      reason: "Contenu inapproprié",
    }));
  });

  it("does not let an Admin answer in place of the athlete", async () => {
    vi.mocked(repository.getForAthlete).mockResolvedValue(request());
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    await expect(service.respond({
      actor: { ...athleteActor, role: "admin", athleteId: null },
      requestId: "request-1",
      payload: { decision: "decline" },
      idempotencyKey: "admin-answer-1",
    })).rejects.toBeInstanceOf(PartnerAthleteIntroductionForbiddenError);
    expect(repository.respond).not.toHaveBeenCalled();
  });

  it("presents the private canonical Instagram without treating it as public", async () => {
    vi.mocked(repository.getForAthlete).mockResolvedValue(request());
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    await expect(service.presentAthleteContact({
      actor: athleteActor,
      requestId: "request-1",
    })).resolves.toEqual({
      channel: "instagram",
      value: "@mila",
      reference: buildInstagramContactReference({
        secret,
        workspaceId: "workspace-1",
        requestId: "request-1",
        athleteId: "athlete-1",
        normalizedInstagram: "@mila",
      }),
    });
  });

  it("uses the freshly resolved canonical Instagram, never the browser value", async () => {
    vi.mocked(repository.getForAthlete).mockResolvedValue(request());
    vi.mocked(repository.respond).mockResolvedValue({
      outcome: "transitioned",
      request: request({
        status: "accepted",
        authorizedContactChannel: "instagram",
        authorizedContactValueSnapshot: "@mila",
        contactConsentedAt: "2026-10-20T09:00:00.000Z",
      }),
      retryAt: null,
    });
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });
    const reference = buildInstagramContactReference({
      secret,
      workspaceId: "workspace-1",
      requestId: "request-1",
      athleteId: "athlete-1",
      normalizedInstagram: "@mila",
    });

    await service.respond({
      actor: athleteActor,
      requestId: "request-1",
      payload: {
        decision: "accept",
        confirmedContact: "@mila",
        contactReference: reference,
      },
      idempotencyKey: "response-1",
      now: new Date("2026-10-20T09:00:00.000Z"),
    });

    expect(repository.respond).toHaveBeenCalledWith(expect.objectContaining({
      authorizedInstagram: "@mila",
      contactReference: reference,
    }));
  });

  it("detects a contact change between presentation and acceptance", async () => {
    vi.mocked(repository.getForAthlete).mockResolvedValue(request());
    vi.mocked(directory.resolveAthleteProfile).mockResolvedValue({
      publicName: "Mila Martin",
      instagram: "@new_handle",
    });
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });
    const oldReference = buildInstagramContactReference({
      secret,
      workspaceId: "workspace-1",
      requestId: "request-1",
      athleteId: "athlete-1",
      normalizedInstagram: "@old_handle",
    });

    await expect(service.respond({
      actor: athleteActor,
      requestId: "request-1",
      payload: {
        decision: "accept",
        confirmedContact: "@old_handle",
        contactReference: oldReference,
      },
      idempotencyKey: "response-1",
    })).rejects.toBeInstanceOf(PartnerAthleteIntroductionConflictError);
    expect(repository.respond).not.toHaveBeenCalled();
  });

  it("reconstructs partner replay output from current suspended state without contact", async () => {
    vi.mocked(repository.getForPartner).mockResolvedValue(request({
      status: "accepted",
      moderationStatus: "suspended",
      respondedAt: "2026-10-20T09:00:00.000Z",
      authorizedContactChannel: "instagram",
      authorizedContactValueSnapshot: "@mila",
      contactConsentedAt: "2026-10-20T09:00:00.000Z",
    }));
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory,
      contactReferenceSecret: () => secret,
    });

    await expect(service.getPartnerDetail({
      actor: partnerActor,
      requestId: "request-1",
    })).resolves.not.toHaveProperty("authorizedContact");
  });
});

describe("callable inactive outbox processor", () => {
  it("reports only aggregate failed and stale counts", async () => {
    const repository = repositoryDouble();
    vi.mocked(repository.getOutboxDiagnostics).mockResolvedValue({
      failed: 2,
      stalePending: 3,
      staleProcessing: 1,
    });

    await expect(getPartnerAthleteIntroductionOutboxDiagnostics({
      now: new Date("2026-10-20T08:00:00.000Z"),
    }, repository)).resolves.toEqual({
      failed: 2,
      stalePending: 3,
      staleProcessing: 1,
    });
    expect(repository.getOutboxDiagnostics).toHaveBeenCalledWith({
      staleBefore: "2026-10-18T08:00:00.000Z",
    });
  });

  it("retries failures with bounded attempts without logging notification contents", async () => {
    const repository = repositoryDouble();
    vi.mocked(repository.claimOutbox).mockResolvedValue([{
      id: "outbox-1",
      workspaceId: "workspace-1",
      eventId: "event-1",
      recipientClerkUserId: "athlete-user",
      attemptCount: 2,
    }]);
    vi.mocked(repository.deliverOutbox).mockRejectedValue(new Error("private detail"));
    vi.mocked(repository.failOutbox).mockResolvedValue("pending");

    await expect(processPartnerAthleteIntroductionOutbox({
      workerId: "worker-1",
      now: new Date("2026-10-20T08:00:00.000Z"),
      maxAttempts: 5,
    }, repository)).resolves.toEqual({
      claimed: 1,
      delivered: 0,
      discarded: 0,
      retried: 1,
      failed: 0,
    });
    expect(repository.failOutbox).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "notification_delivery_failed",
      maxAttempts: 5,
    }));
  });
});
