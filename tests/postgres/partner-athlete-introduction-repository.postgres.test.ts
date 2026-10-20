import { randomUUID } from "node:crypto";
import {
  Client,
  neon,
  type NeonQueryFunction,
} from "@neondatabase/serverless";
import { beforeAll, describe, expect, it } from "vitest";
import type { IntroductionActor } from "@/lib/partner-athlete-introductions/contracts";
import { createPartnerAthleteIntroductionRepository } from "@/lib/partner-athlete-introductions/repository";
import { createPartnerAthleteIntroductionService } from "@/lib/partner-athlete-introductions/service";

const testDatabaseUrl = process.env.KLIQUE_PARTNER_INTRO_PG_TEST_URL;
const testDatabaseHost = process.env.KLIQUE_PARTNER_INTRO_PG_TEST_HOST;
const testDatabaseGuard = process.env.KLIQUE_PARTNER_INTRO_PG_TEST_GUARD;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

type Sql = NeonQueryFunction<false, false>;

const unique = (prefix: string) => `${prefix}-${randomUUID()}`;
const now = () => new Date().toISOString();
const LOCK_OBSERVATION_TIMEOUT_MS = 5_000;
const OPERATION_TIMEOUT_MS = 10_000;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const withTimeout = async <T>(
  promise: Promise<T>,
  milliseconds: number,
  label: string,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label}: délai maximum dépassé.`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const withApplicationName = (
  connectionString: string,
  applicationName: string,
) => {
  const target = new URL(connectionString);
  target.searchParams.set("application_name", applicationName);
  target.searchParams.set(
    "options",
    "-c lock_timeout=8000 -c statement_timeout=10000",
  );
  return target.toString();
};

const createInteractiveClient = (
  connectionString: string,
  applicationName: string,
) => new Client({
  connectionString,
  application_name: applicationName,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  query_timeout: 10_000,
  lock_timeout: 8_000,
  idle_in_transaction_session_timeout: 10_000,
});

const observeLockWait = async (input: {
  observer: Client;
  label: string;
  blockerPid: number;
}) => {
  const deadline = Date.now() + LOCK_OBSERVATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await input.observer.query<{
      blocked_pid: number;
      blocker_pid: number;
      wait_event_type: string | null;
      wait_event: string | null;
    }>(`
      SELECT
        blocked.pid::integer AS blocked_pid,
        blocker.pid::integer AS blocker_pid,
        blocked.wait_event_type,
        blocked.wait_event
      FROM pg_stat_activity blocked
      CROSS JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) blocker(pid)
      WHERE blocker.pid = $1
        AND blocked.pid <> $1
        AND blocked.wait_event_type = 'Lock'
      LIMIT 1
    `, [input.blockerPid]);
    if (result.rows[0]) return result.rows[0];
    await delay(50);
  }
  throw new Error(
    `Aucune attente de verrou observée pour ${input.label}.`,
  );
};

const proveRepositoryLockWait = async <T>(input: {
  connectionString: string;
  label: string;
  acquireLock(client: Client): Promise<void>;
  startOperation(connectionString: string): Promise<T>;
}) => {
  const blockerApplicationName = `klique-test-blocker-${unique(input.label)}`;
  const blockedApplicationName = `klique-test-blocked-${unique(input.label)}`;
  const observerApplicationName = `klique-test-observer-${unique(input.label)}`;
  const blocker = createInteractiveClient(
    input.connectionString,
    blockerApplicationName,
  );
  const observer = createInteractiveClient(
    input.connectionString,
    observerApplicationName,
  );
  let blockerTransactionOpen = false;
  let operation: Promise<T> | null = null;

  try {
    await Promise.all([blocker.connect(), observer.connect()]);
    await blocker.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    blockerTransactionOpen = true;
    const blockerPidResult = await blocker.query<{ pid: number }>(
      "SELECT pg_backend_pid()::integer AS pid",
    );
    const blockerPid = blockerPidResult.rows[0]?.pid;
    if (!Number.isInteger(blockerPid)) {
      throw new Error("PID du bloqueur introuvable.");
    }

    await input.acquireLock(blocker);
    operation = input.startOperation(withApplicationName(
      input.connectionString,
      blockedApplicationName,
    ));
    const observation = await observeLockWait({
      observer,
      label: input.label,
      blockerPid,
    });

    expect(observation.blocker_pid).toBe(blockerPid);
    expect(observation.blocked_pid).not.toBe(blockerPid);
    expect(observation.wait_event_type).toBe("Lock");
    expect(observation.wait_event).toBeTruthy();

    await blocker.query("COMMIT");
    blockerTransactionOpen = false;
    const result = await withTimeout(
      operation,
      OPERATION_TIMEOUT_MS,
      input.label,
    );
    return { result, observation };
  } finally {
    if (blockerTransactionOpen) {
      await blocker.query("ROLLBACK").catch(() => undefined);
    }
    if (operation) {
      await withTimeout(
        operation.catch(() => undefined),
        OPERATION_TIMEOUT_MS,
        `${input.label}-cleanup`,
      ).catch(() => undefined);
    }
    await Promise.allSettled([blocker.end(), observer.end()]);
  }
};

const assertDisposableDatabase = async (sql: Sql, connectionString: string) => {
  if (!testDatabaseHost || !testDatabaseGuard) {
    throw new Error(
      "KLIQUE_PARTNER_INTRO_PG_TEST_HOST et KLIQUE_PARTNER_INTRO_PG_TEST_GUARD sont requis.",
    );
  }
  const target = new URL(connectionString);
  if (
    target.protocol !== "postgresql:"
    || target.hostname !== testDatabaseHost
    || !target.hostname.endsWith(".neon.tech")
    || target.pathname !== "/klique_intro_test"
    || target.searchParams.get("sslmode") !== "require"
  ) {
    throw new Error("La cible doit être l’endpoint Neon de test explicitement déclaré.");
  }
  const rows = await sql`
    SELECT
      current_database() AS database_name,
      guard_token
    FROM partner_intro_test_guard
    WHERE singleton = TRUE
  `;
  if (
    rows.length !== 1
    || rows[0]?.database_name !== "klique_intro_test"
    || rows[0]?.guard_token !== testDatabaseGuard
  ) {
    throw new Error("La sentinelle de la base PostgreSQL de test ne correspond pas.");
  }
};

const createStartGate = (participantCount: number) => {
  let arrived = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived === participantCount) release();
    await ready;
  };
};

const createRaceRepositories = (connectionString: string) => {
  const waitForAll = createStartGate(2);
  const backendPids = new Set<number>();
  const repositories = Array.from({ length: 2 }, () => {
    const base = neon(connectionString);
    const synchronized = ((
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => base(strings, ...values)) as Sql;
    synchronized.query = base.query.bind(base) as typeof synchronized.query;
    synchronized.unsafe = base.unsafe.bind(base) as typeof synchronized.unsafe;
    synchronized.transaction = (async (builder, options) => {
      if (typeof builder !== "function") {
        throw new Error("Le harnais exige une transaction construite par callback.");
      }
      await waitForAll();
      const results = await base.transaction((tx) => {
        const planned = builder(tx);
        if (!Array.isArray(planned)) {
          throw new Error("Le callback transactionnel doit retourner un tableau.");
        }
        const probe = tx`
          SELECT pg_backend_pid()::integer AS backend_pid, pg_sleep(0.25)
        `;
        return [probe, ...planned];
      }, options);
      const queryResults = results as unknown as Array<
        Array<Record<string, unknown>>
      >;
      backendPids.add(Number(queryResults[0]?.[0]?.backend_pid));
      return queryResults.slice(1);
    }) as typeof synchronized.transaction;
    return createPartnerAthleteIntroductionRepository(synchronized);
  });
  return { repositories, backendPids };
};

const expectDistinctRaceBackends = (backendPids: Set<number>) => {
  expect([...backendPids].every(Number.isInteger)).toBe(true);
  expect(backendPids.size).toBe(2);
};

const seedAccess = async (
  sql: Sql,
  input: {
    workspaceId: string;
    partnerId: string;
    athleteId: string;
    partnerUserId?: string;
    athleteUserId?: string;
    adminUserId?: string;
  },
) => {
  const partnerUserId = input.partnerUserId ?? unique("partner-user");
  const athleteUserId = input.athleteUserId ?? unique("athlete-user");
  const adminUserId = input.adminUserId ?? unique("admin-user");

  await sql`
    INSERT INTO user_access (
      clerk_user_id, email, role, workspace_id, athlete_id, partner_id,
      media_id, status, created_at, updated_at
    )
    VALUES
      (
        ${partnerUserId}, ${`${partnerUserId}@example.test`}, 'partner_expert',
        ${input.workspaceId}, NULL, ${input.partnerId}, NULL, 'active', NOW(), NOW()
      ),
      (
        ${athleteUserId}, ${`${athleteUserId}@example.test`}, 'athlete',
        ${input.workspaceId}, ${input.athleteId}, NULL, NULL, 'active', NOW(), NOW()
      ),
      (
        ${adminUserId}, ${`${adminUserId}@example.test`}, 'admin',
        ${input.workspaceId}, NULL, NULL, NULL, 'active', NOW(), NOW()
      )
  `;

  return { partnerUserId, athleteUserId, adminUserId };
};

const actors = (
  workspaceId: string,
  partnerId: string,
  athleteId: string,
  users: Awaited<ReturnType<typeof seedAccess>>,
) => ({
  partner: {
    clerkUserId: users.partnerUserId,
    role: "partner_expert",
    status: "active",
    workspaceId,
    athleteId: null,
    partnerId,
  } satisfies IntroductionActor,
  athlete: {
    clerkUserId: users.athleteUserId,
    role: "athlete",
    status: "active",
    workspaceId,
    athleteId,
    partnerId: null,
  } satisfies IntroductionActor,
  admin: {
    clerkUserId: users.adminUserId,
    role: "admin",
    status: "active",
    workspaceId,
    athleteId: null,
    partnerId: null,
  } satisfies IntroductionActor,
});

const createInput = (
  actor: IntroductionActor,
  athleteId: string,
  idempotencyKey = unique("create"),
) => ({
  actor,
  athleteId,
  partnerPublicName: "Partenaire de test",
  athletePublicName: "Athlète de test",
  reason: "Test PostgreSQL isolé",
  message: "Données entièrement fictives.",
  idempotencyKey,
  payloadHash: `hash:${idempotencyKey}`,
  now: now(),
});

const reportInput = (
  actor: IntroductionActor,
  requestId: string,
  idempotencyKey = unique("report"),
) => ({
  actor,
  requestId,
  reason: "Signalement de test",
  comment: "Commentaire entièrement fictif.",
  idempotencyKey,
  payloadHash: `hash:${idempotencyKey}`,
  now: now(),
});

describePostgres.sequential("partner introduction PostgreSQL transactions", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = neon(testDatabaseUrl!);
    await assertDisposableDatabase(sql, testDatabaseUrl!);
  });

  it("observes creation waiting on the held partner advisory lock", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const actor = actors(workspaceId, partnerId, athleteId, users).partner;

    const proof = await proveRepositoryLockWait({
      connectionString: testDatabaseUrl!,
      label: "creation-lock",
      acquireLock: async (client) => {
        await client.query(`
          SELECT pg_advisory_xact_lock(
            hashtextextended(
              'partner-athlete-introduction:partner:' || $1 || ':' || $2,
              0
            )
          )
        `, [workspaceId, partnerId]);
      },
      startOperation: async (connectionString) => {
        const repository = createPartnerAthleteIntroductionRepository(
          neon(connectionString),
        );
        return repository.create(createInput(actor, athleteId));
      },
    });

    expect(proof.result.outcome).toBe("created");
    expect(proof.result.request).toMatchObject({
      workspaceId,
      partnerId,
      athleteId,
    });
  });

  it("observes both response and moderation waiting on the shared request lock", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const created = await repository.create(createInput(currentActors.partner, athleteId));
    const requestId = created.request!.id;
    const acquireRequestLock = async (client: Client) => {
      await client.query(`
        SELECT id
        FROM contact_requests
        WHERE workspace_id = $1
          AND id = $2
          AND request_kind = 'partner_athlete_introduction'
        FOR UPDATE
      `, [workspaceId, requestId]);
    };

    const responseProof = await proveRepositoryLockWait({
      connectionString: testDatabaseUrl!,
      label: "response-lock",
      acquireLock: acquireRequestLock,
      startOperation: async (connectionString) => {
        const blockedRepository = createPartnerAthleteIntroductionRepository(
          neon(connectionString),
        );
        return blockedRepository.respond({
          actor: currentActors.athlete,
          requestId,
          decision: "decline",
          idempotencyKey: unique("response"),
          payloadHash: unique("response-hash"),
          now: now(),
          authorizedInstagram: null,
          contactReference: null,
        });
      },
    });
    expect(responseProof.result.outcome).toBe("transitioned");

    const moderationProof = await proveRepositoryLockWait({
      connectionString: testDatabaseUrl!,
      label: "moderation-lock",
      acquireLock: acquireRequestLock,
      startOperation: async (connectionString) => {
        const blockedRepository = createPartnerAthleteIntroductionRepository(
          neon(connectionString),
        );
        return blockedRepository.moderate({
          actor: currentActors.admin,
          requestId,
          action: "suspend",
          reason: "Preuve du verrou partagé",
          idempotencyKey: unique("moderation"),
          payloadHash: unique("moderation-hash"),
          now: now(),
        });
      },
    });
    expect(moderationProof.result.outcome).toBe("transitioned");
  });

  it("serializes concurrent creations for one workspace/partner/athlete pair", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const actor = actors(workspaceId, partnerId, athleteId, users).partner;
    const race = createRaceRepositories(testDatabaseUrl!);

    const results = await Promise.all([
      race.repositories[0].create(createInput(actor, athleteId)),
      race.repositories[1].create(createInput(actor, athleteId)),
    ]);

    expectDistinctRaceBackends(race.backendPids);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      "created",
      "unresolved_request",
    ]);
    const rows = await sql`
      SELECT COUNT(*)::integer AS count
      FROM contact_requests
      WHERE workspace_id = ${workspaceId}
        AND partner_id = ${partnerId}
        AND athlete_id = ${athleteId}
        AND status = 'awaiting_athlete'
    `;
    expect(rows[0]?.count).toBe(1);
  });

  it("serializes concurrent acceptance and refusal", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const created = await repository.create(createInput(currentActors.partner, athleteId));
    const requestId = created.request!.id;
    const race = createRaceRepositories(testDatabaseUrl!);

    const [accepted, declined] = await Promise.all([
      race.repositories[0].respond({
        actor: currentActors.athlete,
        requestId,
        decision: "accept",
        idempotencyKey: unique("accept"),
        payloadHash: unique("accept-hash"),
        now: now(),
        authorizedInstagram: "@athlete_test",
        contactReference: unique("contact-reference"),
      }),
      race.repositories[1].respond({
        actor: currentActors.athlete,
        requestId,
        decision: "decline",
        idempotencyKey: unique("decline"),
        payloadHash: unique("decline-hash"),
        now: now(),
        authorizedInstagram: null,
        contactReference: null,
      }),
    ]);

    expectDistinctRaceBackends(race.backendPids);
    expect([accepted.outcome, declined.outcome].filter(
      (outcome) => outcome === "transitioned",
    )).toHaveLength(1);
    expect([accepted.outcome, declined.outcome]).toContain("already_answered");
  });

  it("serializes response with suspension and creation with solicitation disablement", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const created = await repository.create(createInput(currentActors.partner, athleteId));

    const responseRace = createRaceRepositories(testDatabaseUrl!);
    const [response, moderation] = await Promise.all([
      responseRace.repositories[0].respond({
        actor: currentActors.athlete,
        requestId: created.request!.id,
        decision: "decline",
        idempotencyKey: unique("response"),
        payloadHash: unique("response-hash"),
        now: now(),
        authorizedInstagram: null,
        contactReference: null,
      }),
      responseRace.repositories[1].moderate({
        actor: currentActors.admin,
        requestId: created.request!.id,
        action: "suspend",
        reason: "Test de concurrence",
        idempotencyKey: unique("moderation"),
        payloadHash: unique("moderation-hash"),
        now: now(),
      }),
    ]);

    expectDistinctRaceBackends(responseRace.backendPids);
    expect(moderation.outcome).toBe("transitioned");
    expect(["transitioned", "suspended"]).toContain(response.outcome);

    const secondAthleteId = unique("athlete");
    const secondUsers = await seedAccess(sql, {
      workspaceId,
      partnerId,
      athleteId: secondAthleteId,
    });
    const secondActors = actors(workspaceId, partnerId, secondAthleteId, {
      ...secondUsers,
      partnerUserId: users.partnerUserId,
      adminUserId: users.adminUserId,
    });
    const solicitationRace = createRaceRepositories(testDatabaseUrl!);
    const [creation, disablement] = await Promise.all([
      solicitationRace.repositories[0].create(
        createInput(secondActors.partner, secondAthleteId),
      ),
      solicitationRace.repositories[1].setPartnerSolicitation({
        actor: currentActors.admin,
        partnerId,
        canSolicit: false,
        reason: "Test de concurrence",
        idempotencyKey: `solicitation-${randomUUID()}`,
        payloadHash: `hash-${randomUUID()}`,
        now: now(),
      }),
    ]);

    expectDistinctRaceBackends(solicitationRace.backendPids);
    expect(disablement).toBe("updated");
    expect(["created", "solicitation_disabled"]).toContain(creation.outcome);
    const solicitationEvents = await sql`
      SELECT COUNT(*)::integer AS count
      FROM partner_solicitation_control_events
      WHERE workspace_id = ${workspaceId}
        AND partner_id = ${partnerId}
    `;
    expect(solicitationEvents[0]?.count).toBe(1);
  });

  it("serializes concurrent athlete reports and keeps one open report", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const created = await repository.create(createInput(currentActors.partner, athleteId));
    const race = createRaceRepositories(testDatabaseUrl!);

    const outcomes = await Promise.all([
      race.repositories[0].report(reportInput(
        currentActors.athlete,
        created.request!.id,
        unique("report-a"),
      )),
      race.repositories[1].report(reportInput(
        currentActors.athlete,
        created.request!.id,
        unique("report-b"),
      )),
    ]);

    expectDistinctRaceBackends(race.backendPids);
    expect(outcomes.sort()).toEqual(["created", "duplicate"]);
    const rows = await sql`
      SELECT
        (SELECT COUNT(*) FROM partner_athlete_introduction_reports
          WHERE workspace_id = ${workspaceId}
            AND request_id = ${created.request!.id}
            AND status = 'open')::integer AS report_count,
        (SELECT COUNT(*) FROM partner_athlete_introduction_events
          WHERE workspace_id = ${workspaceId}
            AND request_id = ${created.request!.id}
            AND event_type = 'athlete_reported')::integer AS event_count
    `;
    expect(rows[0]).toMatchObject({ report_count: 1, event_count: 1 });
  });

  it("deduplicates open reports and replays the same report idempotently", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const created = await repository.create(createInput(currentActors.partner, athleteId));
    const key = unique("report");
    const input = reportInput(currentActors.athlete, created.request!.id, key);

    await expect(repository.report(input)).resolves.toBe("created");
    await expect(repository.report(input)).resolves.toBe("replay");
    await expect(repository.report(reportInput(
      currentActors.athlete,
      created.request!.id,
      unique("report-other"),
    ))).resolves.toBe("duplicate");

    const rows = await sql`
      SELECT COUNT(*)::integer AS count
      FROM partner_athlete_introduction_reports
      WHERE workspace_id = ${workspaceId}
        AND request_id = ${created.request!.id}
    `;
    expect(rows[0]?.count).toBe(1);
  });

  it("rejects reports from another athlete and hides cross-workspace requests", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const created = await repository.create(createInput(currentActors.partner, athleteId));
    const otherAthleteId = unique("athlete");
    const otherUsers = await seedAccess(sql, {
      workspaceId,
      partnerId: unique("partner"),
      athleteId: otherAthleteId,
    });
    const otherAthlete = actors(
      workspaceId,
      unique("partner"),
      otherAthleteId,
      otherUsers,
    ).athlete;
    const otherWorkspaceId = unique("workspace");
    const otherWorkspaceUsers = await seedAccess(sql, {
      workspaceId: otherWorkspaceId,
      partnerId: unique("partner"),
      athleteId: unique("athlete"),
    });
    const otherWorkspaceAthlete = actors(
      otherWorkspaceId,
      unique("partner"),
      unique("athlete"),
      otherWorkspaceUsers,
    ).athlete;

    await expect(repository.report(reportInput(
      otherAthlete,
      created.request!.id,
    ))).resolves.toBe("forbidden");
    await expect(repository.report(reportInput(
      otherWorkspaceAthlete,
      created.request!.id,
    ))).resolves.toBe("not_found");
  });

  it("serializes concurrent report handling and records one terminal audit event", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const created = await repository.create(createInput(currentActors.partner, athleteId));
    await repository.report(reportInput(currentActors.athlete, created.request!.id));
    const reportRows = await sql`
      SELECT id
      FROM partner_athlete_introduction_reports
      WHERE workspace_id = ${workspaceId}
        AND request_id = ${created.request!.id}
      LIMIT 1
    `;
    const reportId = String(reportRows[0]?.id);
    const race = createRaceRepositories(testDatabaseUrl!);

    const outcomes = await Promise.all([
      race.repositories[0].handleReport({
        actor: currentActors.admin,
        requestId: created.request!.id,
        reportId,
        status: "resolved",
        note: "Résolution fictive",
        idempotencyKey: unique("resolve"),
        payloadHash: unique("resolve-hash"),
        now: now(),
      }),
      race.repositories[1].handleReport({
        actor: currentActors.admin,
        requestId: created.request!.id,
        reportId,
        status: "dismissed",
        note: "Classement fictif",
        idempotencyKey: unique("dismiss"),
        payloadHash: unique("dismiss-hash"),
        now: now(),
      }),
    ]);

    expectDistinctRaceBackends(race.backendPids);
    expect(outcomes.sort()).toEqual(["conflict", "updated"]);
    const rows = await sql`
      SELECT
        report.status,
        (SELECT COUNT(*) FROM partner_athlete_introduction_events event
          WHERE event.workspace_id = ${workspaceId}
            AND event.request_id = ${created.request!.id}
            AND event.event_type IN ('report_resolved', 'report_dismissed'))::integer
          AS terminal_event_count
      FROM partner_athlete_introduction_reports report
      WHERE report.id = ${reportId}::uuid
    `;
    expect(["resolved", "dismissed"]).toContain(rows[0]?.status);
    expect(rows[0]?.terminal_event_count).toBe(1);
  });

  it("audits and replays solicitation controls by idempotency key", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const key = unique("solicitation");
    const input = {
      actor: currentActors.admin,
      partnerId,
      canSolicit: false,
      reason: "Audit fictif",
      idempotencyKey: key,
      payloadHash: `hash:${key}`,
      now: now(),
    };

    await expect(repository.setPartnerSolicitation(input)).resolves.toBe("updated");
    await expect(repository.setPartnerSolicitation(input)).resolves.toBe("replay");
    await expect(repository.setPartnerSolicitation({
      ...input,
      canSolicit: true,
      payloadHash: "different-payload",
    })).resolves.toBe("idempotency_conflict");

    const rows = await sql`
      SELECT
        control.can_solicit,
        (SELECT COUNT(*) FROM partner_solicitation_control_events event
          WHERE event.workspace_id = ${workspaceId}
            AND event.partner_id = ${partnerId})::integer AS event_count
      FROM partner_solicitation_controls control
      WHERE control.workspace_id = ${workspaceId}
        AND control.partner_id = ${partnerId}
    `;
    expect(rows[0]).toMatchObject({ can_solicit: false, event_count: 1 });
  });

  it("reclaims stale rows with concurrent outbox processors and finalizes idempotently", async () => {
    await sql`
      UPDATE partner_athlete_introduction_notification_outbox
      SET status = 'failed',
          attempt_count = 5,
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
      WHERE status IN ('pending', 'processing')
    `;
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const created = await repository.create(createInput(currentActors.partner, athleteId));
    const secondWorkspaceId = unique("workspace");
    const secondPartnerId = unique("partner");
    const secondAthleteId = unique("athlete");
    const secondUsers = await seedAccess(sql, {
      workspaceId: secondWorkspaceId,
      partnerId: secondPartnerId,
      athleteId: secondAthleteId,
    });
    const secondCreated = await repository.create(createInput(
      actors(
        secondWorkspaceId,
        secondPartnerId,
        secondAthleteId,
        secondUsers,
      ).partner,
      secondAthleteId,
    ));
    const outboxRows = await sql`
      SELECT outbox.id, outbox.event_id
      FROM partner_athlete_introduction_notification_outbox outbox
      JOIN partner_athlete_introduction_events event ON event.id = outbox.event_id
      WHERE event.request_id IN (${created.request!.id}, ${secondCreated.request!.id})
      ORDER BY event.request_id
    `;
    const outboxId = String(outboxRows[0]?.id);
    const eventId = String(outboxRows[0]?.event_id);
    const notificationId = randomUUID();

    await sql`
      UPDATE partner_athlete_introduction_notification_outbox
      SET status = 'processing',
          attempt_count = 1,
          locked_at = NOW() - INTERVAL '10 minutes',
          locked_by = 'dead-worker'
      WHERE id = ${outboxId}::uuid
    `;
    const race = createRaceRepositories(testDatabaseUrl!);
    const claimInput = {
      batchSize: 1,
      maxAttempts: 5,
      staleLockBefore: new Date(Date.now() - 60_000).toISOString(),
      now: new Date(Date.now() + 60_000).toISOString(),
    };
    const claimed = await Promise.all([
      race.repositories[0].claimOutbox({ ...claimInput, workerId: "recovery-worker-a" }),
      race.repositories[1].claimOutbox({ ...claimInput, workerId: "recovery-worker-b" }),
    ]);
    expectDistinctRaceBackends(race.backendPids);
    expect(claimed[0]).toHaveLength(1);
    expect(claimed[1]).toHaveLength(1);
    expect(new Set(claimed.flat().map((row) => row.id)).size).toBe(2);
    expect(claimed.flat().some((row) => row.id === outboxId)).toBe(true);

    await sql`
      INSERT INTO notifications (
        id, workspace_id, recipient_clerk_user_id, type, title, body,
        action_href, source_type, source_id, created_at
      )
      SELECT
        ${notificationId}::uuid, workspace_id, recipient_clerk_user_id,
        notification_type, title, body, action_href,
        'partner_athlete_introduction_event', ${eventId}, NOW()
      FROM partner_athlete_introduction_notification_outbox
      WHERE id = ${outboxId}::uuid
      ON CONFLICT (workspace_id, recipient_clerk_user_id, source_type, source_id)
        WHERE source_type IS NOT NULL AND source_id IS NOT NULL
        DO NOTHING
    `;
    const claimedByFirstWorker = claimed[0][0]?.id === outboxId;
    const deliveryRepository = claimedByFirstWorker
      ? race.repositories[0]
      : race.repositories[1];
    const delivered = await deliveryRepository.deliverOutbox({
      outboxId,
      workerId: claimedByFirstWorker ? "recovery-worker-a" : "recovery-worker-b",
      notificationId: randomUUID(),
      now: now(),
    });

    expect(delivered).toEqual({ outcome: "delivered", notificationId });
  });

  it("replays an accepted response after suspension without exposing contact to partner", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const users = await seedAccess(sql, { workspaceId, partnerId, athleteId });
    const currentActors = actors(workspaceId, partnerId, athleteId, users);
    const repository = createPartnerAthleteIntroductionRepository(sql);
    const created = await repository.create(createInput(currentActors.partner, athleteId));
    const service = createPartnerAthleteIntroductionService({
      repository,
      directory: {
        resolvePartnerProfile: async () => ({
          active: true,
          publicName: "Partenaire de test",
        }),
        resolveAthleteProfile: async () => ({
          publicName: "Athlète de test",
          instagram: "@athlete_test",
        }),
        resolveCanonicalPartnerProfile: async () => ({
          outcome: "resolved",
          profile: { active: true, publicName: "Partenaire de test" },
        }),
        resolveCanonicalAthleteProfile: async () => ({
          outcome: "resolved",
          profile: { publicName: "Athlète de test", instagram: "@athlete_test" },
        }),
      },
      contactReferenceSecret: () =>
        "partner-introduction-postgres-test-secret-32-chars",
    });
    const presentation = await service.presentAthleteContact({
      actor: currentActors.athlete,
      requestId: created.request!.id,
    });
    const responsePayload = {
      decision: "accept" as const,
      confirmedContact: "@athlete_test",
      contactReference: presentation!.reference,
    };
    const idempotencyKey = unique("response");

    await service.respond({
      actor: currentActors.athlete,
      requestId: created.request!.id,
      payload: responsePayload,
      idempotencyKey,
    });
    await service.moderate({
      actor: currentActors.admin,
      requestId: created.request!.id,
      action: "suspend",
      reason: "Test de suspension",
      idempotencyKey: unique("moderation"),
    });
    const replay = await service.respond({
      actor: currentActors.athlete,
      requestId: created.request!.id,
      payload: responsePayload,
      idempotencyKey,
    });
    const partnerDetail = await service.getPartnerDetail({
      actor: currentActors.partner,
      requestId: created.request!.id,
    });

    expect(replay.outcome).toBe("replay");
    expect(replay.request?.moderationStatus).toBe("suspended");
    expect(partnerDetail).not.toHaveProperty("authorizedContact");
  });

  it("rolls back request, event, and outbox when the outbox insertion fails", async () => {
    const workspaceId = unique("workspace");
    const partnerId = unique("partner");
    const athleteId = unique("athlete");
    const athleteUserId = unique("rollback-athlete");
    const users = await seedAccess(sql, {
      workspaceId,
      partnerId,
      athleteId,
      athleteUserId,
    });
    const repository = createPartnerAthleteIntroductionRepository(sql);

    await sql`
      CREATE OR REPLACE FUNCTION reject_partner_intro_test_outbox()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.recipient_clerk_user_id LIKE 'rollback-athlete-%' THEN
          RAISE EXCEPTION 'forced test outbox failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `;
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgname = 'partner_intro_test_outbox_failure'
        ) THEN
          CREATE TRIGGER partner_intro_test_outbox_failure
          BEFORE INSERT ON partner_athlete_introduction_notification_outbox
          FOR EACH ROW EXECUTE FUNCTION reject_partner_intro_test_outbox();
        END IF;
      END;
      $$
    `;

    await expect(repository.create(createInput(
      actors(workspaceId, partnerId, athleteId, users).partner,
      athleteId,
    ))).rejects.toThrow("forced test outbox failure");

    const rows = await sql`
      SELECT
        (SELECT COUNT(*) FROM contact_requests WHERE workspace_id = ${workspaceId})::integer
          AS request_count,
        (SELECT COUNT(*) FROM partner_athlete_introduction_events
          WHERE workspace_id = ${workspaceId})::integer AS event_count,
        (SELECT COUNT(*) FROM partner_athlete_introduction_notification_outbox
          WHERE workspace_id = ${workspaceId})::integer AS outbox_count
    `;
    expect(rows[0]).toMatchObject({
      request_count: 0,
      event_count: 0,
      outbox_count: 0,
    });
  });
});
