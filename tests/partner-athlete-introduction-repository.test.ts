import type { NeonQueryFunction } from "@neondatabase/serverless";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntroductionActor } from "@/lib/partner-athlete-introductions/contracts";
import { createPartnerAthleteIntroductionRepository } from "@/lib/partner-athlete-introductions/repository";

type PlannedQuery = { text: string; values: unknown[] };

const actor: IntroductionActor = {
  clerkUserId: "partner-user",
  role: "partner_expert",
  status: "active",
  workspaceId: "workspace-1",
  athleteId: null,
  partnerId: "partner-1",
};

const requestRow = {
  id: "request-1",
  workspace_id: "workspace-1",
  athlete_id: "athlete-1",
  partner_id: "partner-1",
  request_kind: "partner_athlete_introduction",
  flow_version: 2,
  status: "awaiting_athlete",
  moderation_status: "clear",
  athlete_response_enabled_at: "2026-10-20T08:00:00.000Z",
  responded_at: null,
  created_at: "2026-10-20T08:00:00.000Z",
  partner_public_name_snapshot: "Studio Exemple",
  athlete_public_name_snapshot: "Mila Martin",
  authorized_contact_channel: null,
  authorized_contact_value_snapshot: null,
  authorized_contact_reference: null,
  contact_consented_at: null,
  retry_at: null,
};

const normalizeSql = (query: PlannedQuery): string =>
  query.text.replace(/\s+/g, " ").trim().toLowerCase();

const createSqlDouble = () => {
  let planned: PlannedQuery[] = [];
  let isolationLevel = "";
  let nextResults: Array<Array<Record<string, unknown>>> = [];
  let transactionError: Error | null = null;
  const directQuery = vi.fn();

  const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = { text: strings.join("?"), values };
    planned.push(query);
    return query;
  }) as unknown as NeonQueryFunction<false, false>;
  tx.query = ((text: string, values: unknown[] = []) => {
    const query = { text, values };
    planned.push(query);
    return query;
  }) as unknown as typeof tx.query;
  tx.unsafe = vi.fn() as typeof tx.unsafe;
  tx.transaction = vi.fn() as typeof tx.transaction;

  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    directQuery(strings, ...values)) as unknown as NeonQueryFunction<false, false>;
  sql.query = directQuery as typeof sql.query;
  sql.unsafe = vi.fn() as typeof sql.unsafe;
  sql.transaction = vi.fn(async (builder, options) => {
    planned = [];
    isolationLevel = String(options?.isolationLevel ?? "");
    if (transactionError) throw transactionError;
    if (typeof builder !== "function") throw new Error("Transaction callback required.");
    builder(tx);
    return nextResults;
  }) as typeof sql.transaction;

  return {
    sql,
    directQuery,
    get planned() {
      return planned;
    },
    get isolationLevel() {
      return isolationLevel;
    },
    setResults(results: Array<Array<Record<string, unknown>>>) {
      nextResults = results;
    },
    failTransaction(error: Error) {
      transactionError = error;
    },
  };
};

describe("partner introduction transactional repository", () => {
  let double: ReturnType<typeof createSqlDouble>;

  beforeEach(() => {
    double = createSqlDouble();
  });

  it("includes historical requests only through the scoped partner and Admin reads", async () => {
    double.directQuery
      .mockResolvedValueOnce([{ ...requestRow, flow_version: 1, status: "pending" }])
      .mockResolvedValueOnce([{
        ...requestRow,
        flow_version: 1,
        status: "pending",
        age_days: 10,
        stale: false,
        reported: false,
        total_count: 1,
      }])
      .mockResolvedValueOnce([{
        awaiting: 0,
        accepted: 0,
        declined: 0,
        stale: 0,
        reported: 0,
        suspended: 0,
      }]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await expect(repository.listForPartner(actor)).resolves.toEqual([
      expect.objectContaining({ id: "request-1", flowVersion: 1 }),
    ]);
    await expect(repository.listForAdmin({
      actor: { ...actor, role: "admin", partnerId: null },
      status: null,
      moderationStatus: null,
      staleOnly: false,
      reportedOnly: false,
      staleDays: 5,
      limit: 20,
      offset: 0,
      now: "2026-10-30T08:00:00.000Z",
    })).resolves.toMatchObject({
      items: [expect.objectContaining({ historical: true, status: "pending" })],
    });

    const partnerQuery = String(double.directQuery.mock.calls[0]?.[0] ?? "");
    const partnerValues = double.directQuery.mock.calls[0]?.[1] as unknown[];
    expect(partnerQuery).toContain("access.partner_id = request.partner_id");
    expect(partnerQuery).toContain("access.clerk_user_id = $2");
    expect(partnerQuery).not.toContain("request.flow_version >= $2");
    expect(partnerValues).toEqual(["workspace-1", "partner-user"]);

    const adminQuery = String(double.directQuery.mock.calls[1]?.[0] ?? "");
    expect(adminQuery).toContain("role = 'admin'");
    expect(adminQuery).toContain("request.flow_version < $3");
    expect(adminQuery).toContain("request.athlete_response_enabled_at IS NOT NULL");
  });

  it("keeps historical requests excluded from athlete reads", async () => {
    double.directQuery.mockResolvedValue([]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await repository.listForAthlete({
      ...actor,
      clerkUserId: "athlete-user",
      role: "athlete",
      athleteId: "athlete-1",
      partnerId: null,
    });

    const query = String(double.directQuery.mock.calls[0]?.[0] ?? "");
    expect(query).toContain("request.flow_version >= $2");
    expect(query).toContain("request.athlete_response_enabled_at IS NOT NULL");
    expect(query).toContain("access.athlete_id = request.athlete_id");
  });

  it("serializes creation with the partner lock then pair lock in one ReadCommitted transaction", async () => {
    double.setResults([[], [], [{ outcome: "created", ...requestRow }]]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await expect(repository.create({
      actor,
      athleteId: "athlete-1",
      partnerPublicName: "Studio Exemple",
      athletePublicName: "Mila Martin",
      reason: "Sponsoring",
      message: "Bonjour",
      idempotencyKey: "create-1",
      payloadHash: "hash-create-1",
      now: "2026-10-20T08:00:00.000Z",
    })).resolves.toMatchObject({ outcome: "created", request: { id: "request-1" } });

    expect(double.isolationLevel).toBe("ReadCommitted");
    expect(double.planned).toHaveLength(3);
    expect(normalizeSql(double.planned[0])).toContain("pg_advisory_xact_lock");
    expect(normalizeSql(double.planned[0])).toContain("partner-athlete-introduction:partner:");
    expect(normalizeSql(double.planned[1])).toContain("partner-athlete-introduction:pair:");

    const mutation = normalizeSql(double.planned[2]);
    expect(mutation).toContain("from user_access");
    expect(mutation).toContain("partner_solicitation_controls");
    expect(mutation).toContain("status in ('pending', 'awaiting_athlete')");
    expect(mutation).toContain("interval '30 days'");
    expect(mutation).toContain("partner_athlete_introduction_events");
    expect(mutation).toContain("partner_athlete_introduction_notification_outbox");
    expect(mutation).toContain("workspace_id =");
  });

  it("locks the request row and conditionally serializes athlete response with moderation", async () => {
    double.setResults([[], [{
      outcome: "transitioned",
      ...requestRow,
      status: "accepted",
      responded_at: "2026-10-20T09:00:00.000Z",
      authorized_contact_channel: "instagram",
      authorized_contact_value_snapshot: "@mila",
      authorized_contact_reference: "v1.reference",
      contact_consented_at: "2026-10-20T09:00:00.000Z",
    }]]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await repository.respond({
      actor: { ...actor, role: "athlete", athleteId: "athlete-1", partnerId: null },
      requestId: "request-1",
      decision: "accept",
      idempotencyKey: "response-1",
      payloadHash: "hash-response-1",
      now: "2026-10-20T09:00:00.000Z",
      authorizedInstagram: "@mila",
      contactReference: "v1.reference",
    });

    expect(double.isolationLevel).toBe("ReadCommitted");
    expect(normalizeSql(double.planned[0])).toContain("for update");
    const mutation = normalizeSql(double.planned[1]);
    expect(mutation).toContain("request.status = 'awaiting_athlete'");
    expect(mutation).toContain("request.moderation_status = 'clear'");
    expect(mutation).toContain("response_idempotency_key");
    expect(mutation).toContain("partner_athlete_introduction_events");
    expect(mutation).toContain("partner_athlete_introduction_notification_outbox");
    expect(mutation).not.toContain("@mila");
  });

  it("uses the same request-row lock for suspension and reactivation", async () => {
    double.setResults([[], [{
      outcome: "transitioned",
      ...requestRow,
      moderation_status: "suspended",
    }]]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await repository.moderate({
      actor: { ...actor, role: "admin", partnerId: null },
      requestId: "request-1",
      action: "suspend",
      reason: "Contrôle",
      idempotencyKey: "moderation-1",
      payloadHash: "hash-moderation-1",
      now: "2026-10-20T09:00:00.000Z",
    });

    expect(normalizeSql(double.planned[0])).toContain("for update");
    const mutation = normalizeSql(double.planned[1]);
    expect(mutation).toContain("role = 'admin'");
    expect(mutation).toContain("flow_version >=");
    expect(mutation).toContain("idempotency_key");
    expect(double.planned[1].values).toContain("moderation_suspended");
  });

  it("serializes solicitation changes with the same partner lock used by creation", async () => {
    double.setResults([[], [{ outcome: "updated" }]]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await expect(repository.setPartnerSolicitation({
      actor: { ...actor, role: "admin", partnerId: null },
      partnerId: "partner-1",
      canSolicit: false,
      reason: "Abus",
      idempotencyKey: "solicitation-1",
      payloadHash: "hash-solicitation-1",
      now: "2026-10-20T09:00:00.000Z",
    })).resolves.toBe("updated");

    expect(normalizeSql(double.planned[0])).toContain(
      "partner-athlete-introduction:partner:",
    );
    expect(normalizeSql(double.planned[1])).toContain(
      "partner_solicitation_controls",
    );
    expect(normalizeSql(double.planned[1])).toContain(
      "partner_solicitation_control_events",
    );
  });

  it("records an athlete report and audit event under the shared request lock", async () => {
    double.setResults([[], [{ outcome: "created" }]]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await expect(repository.report({
      actor: { ...actor, role: "athlete", athleteId: "athlete-1", partnerId: null },
      requestId: "request-1",
      reason: "Contenu inapproprié",
      comment: "Détail",
      idempotencyKey: "report-1",
      payloadHash: "hash-report-1",
      now: "2026-10-20T09:00:00.000Z",
    })).resolves.toBe("created");

    expect(normalizeSql(double.planned[0])).toContain("for update");
    const mutation = normalizeSql(double.planned[1]);
    expect(mutation).toContain("partner_athlete_introduction_reports");
    expect(mutation).toContain("access.athlete_id");
    expect(mutation).toContain("'athlete_reported'");
    expect(mutation).toContain("flow_version >=");
  });

  it("records report handling as an Admin audit event without changing request consent", async () => {
    double.setResults([[], [{ outcome: "updated" }]]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await expect(repository.handleReport({
      actor: { ...actor, role: "admin", partnerId: null },
      requestId: "request-1",
      reportId: "11111111-1111-4111-8111-111111111111",
      status: "resolved",
      note: "Vérifié",
      idempotencyKey: "report-handle-1",
      payloadHash: "hash-handle-1",
      now: "2026-10-20T10:00:00.000Z",
    })).resolves.toBe("updated");

    const mutation = normalizeSql(double.planned[1]);
    expect(mutation).toContain("role = 'admin'");
    expect(mutation).toContain("handled_by_clerk_user_id");
    expect(mutation).toContain("partner_athlete_introduction_events");
    expect(mutation).not.toContain("authorized_contact_value_snapshot =");
    expect(mutation).not.toContain("status = 'accepted'");
    expect(mutation).not.toContain("status = 'declined'");
  });

  it("does not fall back to independent queries when the transaction fails", async () => {
    double.failTransaction(new Error("transaction rolled back"));
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await expect(repository.create({
      actor,
      athleteId: "athlete-1",
      partnerPublicName: "Studio Exemple",
      athletePublicName: "Mila Martin",
      reason: "Sponsoring",
      message: "",
      idempotencyKey: "create-1",
      payloadHash: "hash-create-1",
      now: "2026-10-20T08:00:00.000Z",
    })).rejects.toThrow("transaction rolled back");
    expect(double.directQuery).not.toHaveBeenCalled();
  });

  it("claims outbox rows with SKIP LOCKED and bounded attempts", async () => {
    double.setResults([[{
      id: "outbox-1",
      workspace_id: "workspace-1",
      event_id: "event-1",
      recipient_clerk_user_id: "athlete-user",
      attempt_count: 2,
    }]]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await expect(repository.claimOutbox({
      workerId: "worker-1",
      batchSize: 10,
      maxAttempts: 5,
      staleLockBefore: "2026-10-20T07:55:00.000Z",
      now: "2026-10-20T08:00:00.000Z",
    })).resolves.toEqual([{
      id: "outbox-1",
      workspaceId: "workspace-1",
      eventId: "event-1",
      recipientClerkUserId: "athlete-user",
      attemptCount: 2,
    }]);

    const claim = normalizeSql(double.planned[0]);
    expect(claim).toContain("for update skip locked");
    expect(claim).toContain("attempt_count <");
    expect(claim).toContain("status = 'processing'");
  });

  it("delivers notification and marks outbox atomically with crash-safe deduplication", async () => {
    double.setResults([[{
      status: "delivered",
      notification_id: "11111111-1111-4111-8111-111111111111",
    }]]);
    const repository = createPartnerAthleteIntroductionRepository(double.sql);

    await expect(repository.deliverOutbox({
      outboxId: "22222222-2222-4222-8222-222222222222",
      workerId: "worker-1",
      notificationId: "11111111-1111-4111-8111-111111111111",
      now: "2026-10-20T08:00:00.000Z",
    })).resolves.toEqual({
      outcome: "delivered",
      notificationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(double.isolationLevel).toBe("ReadCommitted");
    const delivery = normalizeSql(double.planned[0]);
    expect(delivery).toContain("join user_access");
    expect(delivery).toContain("insert into notifications");
    expect(delivery).toContain("on conflict");
    expect(delivery).toContain("partner_athlete_introduction_event");
    expect(delivery).toContain("update partner_athlete_introduction_notification_outbox");
  });
});
