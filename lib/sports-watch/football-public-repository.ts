import { createHash, randomUUID } from "node:crypto";
import { createContentStorageClient } from "@/lib/content-storage/db";
import { PostgresSportsWatchRepository } from "@/lib/sports-watch/repository";
import type { SportsWatchManualEntryCandidateInput } from "@/lib/sports-watch/repository";
import type { CollectedSportsWatchCandidate } from "@/lib/sports-watch/bcbulle-collector";
import type {
  FootballCandidateEvidence,
  FootballCandidateResolution,
  FootballCandidateReconciliation,
  FootballCandidateReconciliationView,
  FootballPublicBinding,
  FootballPublicTeamDiscovery,
  FootballReconciliationComparison,
  FootballReconciliationDecision,
  FootballSourceSuggestion,
  SportsWatchCandidate,
} from "@/types/sports-watch";

type FootballBindingRow = {
  id: string;
  athlete_id: string;
  footstats_team_id: string;
  footstats_team_name_snapshot: string;
  footstats_player_id: string | null;
  footstats_player_name_snapshot: string | null;
  aff_team_id: string | null;
  aff_player_id: string | null;
  competition_snapshot: string;
  season_snapshot: string;
  status: FootballPublicBinding["status"];
  roster_snapshot_json: FootballPublicBinding["roster"] | string;
  verification_evidence_json: string[] | string;
  verified_by_clerk_user_id: string | null;
  verified_at: string | Date | null;
  version: number | string;
  updated_at: string | Date;
};

type ReconciliationRow = {
  id: string;
  manual_candidate_id: string;
  automatic_candidate_id: string;
  decision: FootballReconciliationDecision;
  comparison_json: FootballReconciliationComparison | string;
  decided_by_clerk_user_id: string | null;
  decided_at: string | Date | null;
  version: number | string;
};

type SourceSuggestionRow = {
  id: string;
  manual_candidate_id: string;
  match_key: string;
  evidence_json: FootballCandidateEvidence | string;
  comparison_json: FootballReconciliationComparison | string;
  status: FootballSourceSuggestion["status"];
  decided_by_clerk_user_id: string | null;
  decided_at: string | Date | null;
  version: number | string;
};

const timestamp = (value: string | Date | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const readJson = <T>(value: T | string): T =>
  typeof value === "string" ? JSON.parse(value) as T : value;

const mapBinding = (row: FootballBindingRow): FootballPublicBinding => ({
  id: row.id,
  athleteId: row.athlete_id,
  footstatsTeamId: row.footstats_team_id,
  footstatsTeamName: row.footstats_team_name_snapshot,
  footstatsPlayerId: row.footstats_player_id,
  footstatsPlayerName: row.footstats_player_name_snapshot,
  affTeamId: row.aff_team_id,
  affPlayerId: row.aff_player_id,
  competition: row.competition_snapshot,
  season: row.season_snapshot,
  status: row.status,
  roster: readJson(row.roster_snapshot_json),
  evidence: readJson(row.verification_evidence_json),
  verifiedByClerkUserId: row.verified_by_clerk_user_id,
  verifiedAt: timestamp(row.verified_at),
  version: Number(row.version),
  updatedAt: timestamp(row.updated_at) ?? "",
});

const mapReconciliation = (
  row: ReconciliationRow,
): FootballCandidateReconciliation => ({
  id: row.id,
  manualCandidateId: row.manual_candidate_id,
  automaticCandidateId: row.automatic_candidate_id,
  decision: row.decision,
  comparison: readJson(row.comparison_json),
  decidedByClerkUserId: row.decided_by_clerk_user_id,
  decidedAt: timestamp(row.decided_at),
  version: Number(row.version),
});

const normalize = (value: string | null | undefined): string => String(value ?? "")
  .trim()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/[–—]/g, "-")
  .replace(/[^a-z0-9-]+/g, " ")
  .trim();

export const compareFootballCandidates = (
  manual: SportsWatchCandidate,
  automatic: SportsWatchCandidate,
): FootballReconciliationComparison | null => {
  if (
    !manual.manualEntry
    || !automatic.footballEvidence
    || manual.athleteId !== automatic.athleteId
    || manual.eventDateFrom !== automatic.eventDateFrom
  ) return null;
  const identical = ["Même athlète", "Même date"];
  const complementary: string[] = [];
  const contradictions: string[] = [];
  const manualOpponent = normalize(
    manual.manualEntry.football?.opponent ?? manual.manualEntry.opponent,
  );
  const automaticOpponent = normalize(automatic.footballEvidence.opponent);
  if (manualOpponent && automaticOpponent) {
    if (manualOpponent === automaticOpponent) identical.push("Adversaire identique");
    else contradictions.push("Adversaire différent");
  } else if (manualOpponent || automaticOpponent) {
    complementary.push("Adversaire présent dans une seule source");
  }
  const manualScore = normalize(manual.manualEntry.football?.score ?? manual.manualEntry.score);
  const automaticScore = normalize(automatic.footballEvidence.score);
  if (manualScore && automaticScore) {
    if (manualScore === automaticScore) identical.push("Score identique");
    else contradictions.push("Score différent");
  } else if (manualScore || automaticScore) {
    complementary.push("Score présent dans une seule source");
  }
  const manualParticipation = manual.manualEntry.football?.participationStatus ?? "unknown";
  const automaticParticipation = automatic.footballEvidence.participationProved
    ? automatic.footballEvidence.starter === true
      ? "starter"
      : "entered"
    : "unknown";
  if (manualParticipation !== "unknown" && automaticParticipation !== "unknown") {
    if (manualParticipation === automaticParticipation) identical.push("Participation concordante");
    else contradictions.push("Participation contradictoire");
  } else if (manualParticipation !== automaticParticipation) {
    complementary.push("Participation renseignée dans une seule source");
  }
  const probable = identical.includes("Adversaire identique")
    || identical.includes("Score identique");
  return probable ? { identical, complementary, contradictions } : null;
};

const compareManualToEvidence = (
  manual: SportsWatchCandidate,
  athleteId: string,
  eventDate: string,
  evidence: FootballCandidateEvidence,
): FootballReconciliationComparison | null => compareFootballCandidates(manual, {
  ...manual,
  id: "00000000-0000-4000-8000-000000000000",
  athleteId,
  eventDateFrom: eventDate,
  manualEntry: null,
  footballEvidence: evidence,
});

const bindingColumns = `
  id, athlete_id, footstats_team_id, footstats_team_name_snapshot,
  footstats_player_id, footstats_player_name_snapshot, aff_team_id, aff_player_id,
  competition_snapshot, season_snapshot, status, roster_snapshot_json,
  verification_evidence_json, verified_by_clerk_user_id, verified_at,
  version, updated_at
`;

export const FootballPublicRepository = {
  async listBindings(workspaceId: string): Promise<FootballPublicBinding[]> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${bindingColumns}
      FROM sports_watch_football_bindings
      WHERE workspace_id = $1
      ORDER BY updated_at DESC
    `, [workspaceId]) as FootballBindingRow[];
    return rows.map(mapBinding);
  },

  async getVerifiedBinding(
    workspaceId: string,
    athleteId: string,
  ): Promise<FootballPublicBinding | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT ${bindingColumns}
      FROM sports_watch_football_bindings
      WHERE workspace_id = $1 AND athlete_id = $2 AND status = 'verified'
      LIMIT 1
    `, [workspaceId, athleteId]) as FootballBindingRow[];
    return rows[0] ? mapBinding(rows[0]) : null;
  },

  async saveBinding(input: {
    workspaceId: string;
    athleteId: string;
    discovery: FootballPublicTeamDiscovery;
    selectedPlayerId: string | null;
    affTeamId: string | null;
    affPlayerId: string | null;
    status: FootballPublicBinding["status"];
    evidence: string[];
    clerkUserId: string;
    expectedVersion: number;
    now: string;
  }): Promise<FootballPublicBinding | null> {
    const sql = createContentStorageClient();
    const player = input.selectedPlayerId
      ? input.discovery.players.find((item) => item.id === input.selectedPlayerId)
      : null;
    const verified = input.status === "verified";
    const rows = await sql.query(`
      INSERT INTO sports_watch_football_bindings (
        id, workspace_id, athlete_id, footstats_team_id,
        footstats_team_name_snapshot, footstats_player_id,
        footstats_player_name_snapshot, aff_team_id, aff_player_id,
        competition_snapshot, season_snapshot, status, roster_snapshot_json,
        verification_evidence_json, verified_by_clerk_user_id, verified_at
      )
      SELECT
        $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16::timestamptz
      WHERE $17 = 0
         OR EXISTS (
           SELECT 1 FROM sports_watch_football_bindings
           WHERE workspace_id = $2 AND athlete_id = $3
         )
      ON CONFLICT (workspace_id, athlete_id) DO UPDATE
      SET footstats_team_id = EXCLUDED.footstats_team_id,
          footstats_team_name_snapshot = EXCLUDED.footstats_team_name_snapshot,
          footstats_player_id = EXCLUDED.footstats_player_id,
          footstats_player_name_snapshot = EXCLUDED.footstats_player_name_snapshot,
          aff_team_id = EXCLUDED.aff_team_id,
          aff_player_id = EXCLUDED.aff_player_id,
          competition_snapshot = EXCLUDED.competition_snapshot,
          season_snapshot = EXCLUDED.season_snapshot,
          status = EXCLUDED.status,
          roster_snapshot_json = EXCLUDED.roster_snapshot_json,
          verification_evidence_json = EXCLUDED.verification_evidence_json,
          verified_by_clerk_user_id = EXCLUDED.verified_by_clerk_user_id,
          verified_at = EXCLUDED.verified_at,
          version = sports_watch_football_bindings.version + 1,
          updated_at = NOW()
      WHERE sports_watch_football_bindings.version = $17
      RETURNING ${bindingColumns}
    `, [
      randomUUID(),
      input.workspaceId,
      input.athleteId,
      input.discovery.footstatsTeamId,
      input.discovery.teamName,
      player?.id ?? null,
      player?.name ?? null,
      input.affTeamId,
      input.affPlayerId,
      input.discovery.competition,
      input.discovery.season,
      input.status,
      JSON.stringify(input.discovery.players),
      JSON.stringify(input.evidence),
      verified ? input.clerkUserId : null,
      verified ? input.now : null,
      input.expectedVersion,
    ]) as FootballBindingRow[];
    return rows[0] ? mapBinding(rows[0]) : null;
  },

  async disableBinding(input: {
    workspaceId: string;
    athleteId: string;
    expectedVersion: number;
  }): Promise<FootballPublicBinding | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      UPDATE sports_watch_football_bindings
      SET status = 'disabled',
          verified_by_clerk_user_id = NULL,
          verified_at = NULL,
          version = version + 1,
          updated_at = NOW()
      WHERE workspace_id = $1
        AND athlete_id = $2
        AND version = $3
        AND status <> 'disabled'
      RETURNING ${bindingColumns}
    `, [input.workspaceId, input.athleteId, input.expectedVersion]) as FootballBindingRow[];
    return rows[0] ? mapBinding(rows[0]) : null;
  },

  async saveCollectedCandidates(
    workspaceId: string,
    candidates: CollectedSportsWatchCandidate[],
  ): Promise<number> {
    const sql = createContentStorageClient();
    let created = 0;
    for (const candidate of candidates) {
      if (!candidate.footballEvidence || !candidate.eventDateFrom) continue;
      const manualRows = await sql.query(`
        SELECT id
        FROM sports_watch_candidates
        WHERE workspace_id = $1
          AND athlete_id = $2
          AND source_key = 'manual-entry'
          AND event_date_from = $3::date
          AND NOT EXISTS (
            SELECT 1 FROM sports_watch_candidates replacement
            WHERE replacement.workspace_id = sports_watch_candidates.workspace_id
              AND replacement.supersedes_candidate_id = sports_watch_candidates.id
          )
      `, [workspaceId, candidate.athlete.id, candidate.eventDateFrom]) as Array<{ id: string }>;
      let suggested = false;
      for (const row of manualRows) {
        const manual = await PostgresSportsWatchRepository.getCandidate(workspaceId, row.id);
        if (!manual) continue;
        const comparison = compareManualToEvidence(
          manual,
          candidate.athlete.id,
          candidate.eventDateFrom,
          candidate.footballEvidence,
        );
        if (!comparison) continue;
        await sql.query(`
          INSERT INTO sports_watch_football_source_suggestions (
            id, workspace_id, manual_candidate_id, match_key, content_hash,
            evidence_json, comparison_json
          ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::jsonb, $7::jsonb)
          ON CONFLICT (
            workspace_id, manual_candidate_id, match_key, content_hash
          ) DO NOTHING
        `, [
          randomUUID(),
          workspaceId,
          manual.id,
          candidate.footballEvidence.matchKey,
          candidate.contentHash,
          JSON.stringify(candidate.footballEvidence),
          JSON.stringify(comparison),
        ]);
        suggested = true;
      }
      if (suggested) continue;
      created += await PostgresSportsWatchRepository.saveCandidates(workspaceId, [candidate]);
    }
    return created;
  },

  async listSourceSuggestions(workspaceId: string): Promise<FootballSourceSuggestion[]> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT id, manual_candidate_id, match_key, evidence_json, comparison_json,
             status, decided_by_clerk_user_id, decided_at, version
      FROM sports_watch_football_source_suggestions
      WHERE workspace_id = $1 AND status = 'pending'
      ORDER BY updated_at DESC
    `, [workspaceId]) as SourceSuggestionRow[];
    const suggestions: FootballSourceSuggestion[] = [];
    for (const row of rows) {
      const manualCandidate = await PostgresSportsWatchRepository.getCandidate(
        workspaceId,
        row.manual_candidate_id,
      );
      if (!manualCandidate) continue;
      suggestions.push({
        id: row.id,
        manualCandidateId: row.manual_candidate_id,
        matchKey: row.match_key,
        evidence: readJson(row.evidence_json),
        comparison: readJson(row.comparison_json),
        status: row.status,
        decidedByClerkUserId: row.decided_by_clerk_user_id,
        decidedAt: timestamp(row.decided_at),
        version: Number(row.version),
        manualCandidate,
      });
    }
    return suggestions;
  },

  async decideSourceSuggestion(input: {
    workspaceId: string;
    suggestionId: string;
    expectedVersion: number;
    decision: "attached" | "rejected";
    clerkUserId: string;
  }): Promise<SportsWatchCandidate | null> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT id, manual_candidate_id, match_key, evidence_json, comparison_json,
             status, decided_by_clerk_user_id, decided_at, version
      FROM sports_watch_football_source_suggestions
      WHERE workspace_id = $1 AND id = $2::uuid
        AND status = 'pending' AND version = $3
    `, [input.workspaceId, input.suggestionId, input.expectedVersion]) as SourceSuggestionRow[];
    const suggestion = rows[0];
    if (!suggestion) return null;
    if (input.decision === "rejected") {
      await sql.query(`
        UPDATE sports_watch_football_source_suggestions
        SET status = 'rejected', decided_by_clerk_user_id = $4,
            decided_at = NOW(), version = version + 1, updated_at = NOW()
        WHERE workspace_id = $1 AND id = $2::uuid
          AND version = $3 AND status = 'pending'
      `, [
        input.workspaceId,
        input.suggestionId,
        input.expectedVersion,
        input.clerkUserId,
      ]);
      return PostgresSportsWatchRepository.getCandidate(
        input.workspaceId,
        suggestion.manual_candidate_id,
      );
    }
    const manual = await PostgresSportsWatchRepository.getCandidate(
      input.workspaceId,
      suggestion.manual_candidate_id,
    );
    if (!manual?.manualEntry) return null;
    const evidence = readJson<FootballCandidateEvidence>(suggestion.evidence_json);
    const newId = randomUUID();
    const newVersion = manual.version + 1;
    const fieldProvenance = {
      eventDate: "existing_manual",
      title: "existing_manual",
      summary: "existing_manual",
      manualFacts: "existing_manual",
      publicReference: "footstats_public",
      collectiveResult: "footstats_public",
    };
    const completion = {
      mode: "public_source_attached",
      previousCandidateId: manual.id,
      completedByClerkUserId: input.clerkUserId,
      completedAt: new Date().toISOString(),
      previousVersion: manual.version,
      newVersion,
      fieldProvenance,
    };
    const contentHash = createHash("sha256")
      .update(`${manual.id}|${manual.version}|${JSON.stringify(evidence)}`)
      .digest("hex");
    const transaction = await sql.transaction([
      sql.query(`
        INSERT INTO sports_watch_candidates (
          id, workspace_id, source_key, athlete_id, athlete_name_snapshot,
          athlete_sport_snapshot, athlete_club_snapshot, source_name, source_url,
          article_url, title, excerpt, result_kind, publication_date,
          event_date_from, event_date_to, collected_at, attribution_status,
          attribution_evidence_json, factual_verification_status, admin_status,
          reviewed_by_clerk_user_id, reviewed_at, logical_key, content_hash,
          supersedes_candidate_id, version, manual_entry_json,
          created_by_clerk_user_id, idempotency_key, football_evidence_json,
          football_completion_json
        )
        SELECT
          $4::uuid, workspace_id, source_key, athlete_id, athlete_name_snapshot,
          athlete_sport_snapshot, athlete_club_snapshot,
          source_name || ' + Footstats — page publique, source tierce non officielle',
          source_url, article_url, title, excerpt, result_kind, publication_date,
          event_date_from, event_date_to, NOW(), attribution_status,
          attribution_evidence_json || $5::jsonb, factual_verification_status,
          admin_status, reviewed_by_clerk_user_id, reviewed_at, logical_key, $6,
          id, version + 1, manual_entry_json, created_by_clerk_user_id,
          $9::uuid, $7::jsonb, $8::jsonb
        FROM sports_watch_candidates
        WHERE workspace_id = $1 AND id = $2::uuid AND version = $3
          AND manual_entry_json IS NOT NULL
        RETURNING id
      `, [
        input.workspaceId,
        manual.id,
        manual.version,
        newId,
        JSON.stringify([
          "Résultat collectif rattaché depuis la page publique Footstats après validation Admin.",
        ]),
        contentHash,
        JSON.stringify(evidence),
        JSON.stringify(completion),
        randomUUID(),
      ]),
      sql.query(`
        UPDATE sports_watch_football_source_suggestions
        SET status = 'attached', decided_by_clerk_user_id = $4,
            decided_at = NOW(), version = version + 1, updated_at = NOW()
        WHERE workspace_id = $1 AND id = $2::uuid
          AND version = $3 AND status = 'pending'
          AND EXISTS (
            SELECT 1 FROM sports_watch_candidates
            WHERE workspace_id = $1 AND id = $5::uuid
          )
      `, [
        input.workspaceId,
        input.suggestionId,
        input.expectedVersion,
        input.clerkUserId,
        newId,
      ]),
      sql.query(`
        INSERT INTO sports_watch_football_completion_events (
          id, workspace_id, previous_candidate_id, new_candidate_id,
          action, actor_clerk_user_id, previous_version, new_version,
          public_facts_json, manual_facts_json, field_provenance_json
        )
        SELECT $1::uuid, $2, $3::uuid, $4::uuid, 'public_source_attached',
               $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb
        WHERE EXISTS (
          SELECT 1 FROM sports_watch_candidates
          WHERE workspace_id = $2 AND id = $4::uuid
        )
      `, [
        randomUUID(),
        input.workspaceId,
        manual.id,
        newId,
        input.clerkUserId,
        manual.version,
        newVersion,
        JSON.stringify(evidence),
        JSON.stringify(manual.manualEntry),
        JSON.stringify(fieldProvenance),
      ]),
    ]);
    const inserted = (transaction[0] as Array<{ id: string }>)[0]?.id;
    return inserted
      ? PostgresSportsWatchRepository.getCandidate(input.workspaceId, inserted)
      : null;
  },

  async completeCandidate(input: {
    workspaceId: string;
    candidateId: string;
    expectedVersion: number;
    clerkUserId: string;
    prepared: SportsWatchManualEntryCandidateInput;
  }): Promise<SportsWatchCandidate | null> {
    const sql = createContentStorageClient();
    const previous = await PostgresSportsWatchRepository.getCandidate(
      input.workspaceId,
      input.candidateId,
    );
    if (
      !previous?.footballEvidence
      || previous.manualEntry
      || previous.adminStatus !== "pending"
      || previous.version !== input.expectedVersion
    ) return null;
    const publicFields = [
      "eventDate", "club", "opponent", "score", "competition",
      "sourceName", "sourceReference",
    ];
    const manualFields = [
      "participationStatus", "minutes", "goals", "assists",
      "yellowCards", "redCards", "title", "summary", "internalNote",
    ];
    const fieldProvenance = Object.fromEntries([
      ...publicFields.map((field) => [field, "footstats_public"]),
      ...manualFields.map((field) => [field, "footstats_pro_admin"]),
    ]);
    const newId = randomUUID();
    const completion = {
      mode: "football_pro_completion",
      previousCandidateId: previous.id,
      completedByClerkUserId: input.clerkUserId,
      completedAt: input.prepared.collectedAt,
      previousVersion: previous.version,
      newVersion: previous.version + 1,
      fieldProvenance,
    };
    const attribution = [
      ...previous.attributionEvidence,
      ...input.prepared.attributionEvidence,
      "Les faits collectifs publics et les statistiques saisies par l’Admin conservent une provenance distincte.",
    ];
    const results = await sql.transaction([
      sql.query(`
        INSERT INTO sports_watch_candidates (
          id, workspace_id, source_key, athlete_id, athlete_name_snapshot,
          athlete_sport_snapshot, athlete_club_snapshot, source_name, source_url,
          article_url, title, excerpt, result_kind, publication_date,
          event_date_from, event_date_to, collected_at, attribution_status,
          attribution_evidence_json, factual_verification_status, admin_status,
          reviewed_by_clerk_user_id, reviewed_at, logical_key, content_hash,
          supersedes_candidate_id, version, manual_entry_json,
          created_by_clerk_user_id, idempotency_key, football_evidence_json,
          football_completion_json
        )
        SELECT
          $4::uuid, workspace_id, source_key, athlete_id, athlete_name_snapshot,
          athlete_sport_snapshot, athlete_club_snapshot,
          $5, source_url, article_url, $6, $7, $8, NOW(),
          event_date_from, event_date_to, $9::timestamptz, 'matched',
          $10::jsonb, 'unverified', $11,
          CASE WHEN $11 = 'validated' THEN $12 ELSE NULL END,
          CASE WHEN $11 = 'validated' THEN $9::timestamptz ELSE NULL END,
          logical_key, $13, id, version + 1, $14::jsonb,
          $12, $15::uuid, football_evidence_json, $16::jsonb
        FROM sports_watch_candidates
        WHERE workspace_id = $1
          AND id = $2::uuid
          AND version = $3
          AND admin_status = 'pending'
          AND manual_entry_json IS NULL
          AND football_evidence_json IS NOT NULL
        ON CONFLICT (workspace_id, idempotency_key)
          WHERE football_completion_json IS NOT NULL AND idempotency_key IS NOT NULL
        DO NOTHING
        RETURNING id
      `, [
        input.workspaceId,
        input.candidateId,
        input.expectedVersion,
        newId,
        `${previous.sourceName} + ${input.prepared.sourceName}`,
        input.prepared.title,
        input.prepared.excerpt,
        input.prepared.resultKind,
        input.prepared.collectedAt,
        JSON.stringify(attribution),
        input.prepared.initialStatus,
        input.clerkUserId,
        input.prepared.contentHash,
        JSON.stringify(input.prepared.metadata),
        input.prepared.idempotencyKey,
        JSON.stringify(completion),
      ]),
      sql.query(`
        INSERT INTO sports_watch_football_completion_events (
          id, workspace_id, previous_candidate_id, new_candidate_id,
          action, actor_clerk_user_id, previous_version, new_version,
          public_facts_json, manual_facts_json, field_provenance_json
        )
        SELECT
          $1::uuid, $2, $3::uuid, $4::uuid, 'footstats_pro_completed',
          $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb
        WHERE EXISTS (
          SELECT 1 FROM sports_watch_candidates
          WHERE workspace_id = $2 AND id = $4::uuid
        )
      `, [
        randomUUID(),
        input.workspaceId,
        input.candidateId,
        newId,
        input.clerkUserId,
        previous.version,
        previous.version + 1,
        JSON.stringify(previous.footballEvidence),
        JSON.stringify(input.prepared.metadata),
        JSON.stringify(fieldProvenance),
      ]),
    ]);
    const inserted = (results[0] as Array<{ id: string }>)[0]?.id;
    if (inserted) {
      return PostgresSportsWatchRepository.getCandidate(input.workspaceId, inserted);
    }
    const repeated = await sql.query(`
      SELECT id FROM sports_watch_candidates
      WHERE workspace_id = $1 AND idempotency_key = $2::uuid
        AND football_completion_json IS NOT NULL
    `, [input.workspaceId, input.prepared.idempotencyKey]) as Array<{ id: string }>;
    return repeated[0]
      ? PostgresSportsWatchRepository.getCandidate(input.workspaceId, repeated[0].id)
      : null;
  },

  async resolveCandidate(input: {
    workspaceId: string;
    candidateId: string;
    expectedVersion: number;
    resolution: FootballCandidateResolution;
    clerkUserId: string;
  }): Promise<SportsWatchCandidate | null> {
    const sql = createContentStorageClient();
    const toStatus = input.resolution === "incorrect" ? "rejected" : "dismissed";
    const rows = await sql.transaction([
      sql.query(`
        UPDATE sports_watch_candidates
        SET admin_status = $4,
            football_resolution = $5,
            reviewed_by_clerk_user_id = $6,
            reviewed_at = NOW(),
            version = version + 1
        WHERE workspace_id = $1
          AND id = $2::uuid
          AND version = $3
          AND admin_status = 'pending'
          AND football_evidence_json IS NOT NULL
        RETURNING id
      `, [
        input.workspaceId,
        input.candidateId,
        input.expectedVersion,
        toStatus,
        input.resolution,
        input.clerkUserId,
      ]),
      sql.query(`
        INSERT INTO sports_watch_candidate_events (
          id, workspace_id, candidate_id, action, from_status, to_status,
          actor_clerk_user_id
        )
        SELECT $1::uuid, $2, $3::uuid, $4, 'pending', $5, $6
        WHERE EXISTS (
          SELECT 1 FROM sports_watch_candidates
          WHERE workspace_id = $2 AND id = $3::uuid
            AND version = $7 AND football_resolution = $4
        )
      `, [
        randomUUID(),
        input.workspaceId,
        input.candidateId,
        input.resolution,
        toStatus,
        input.clerkUserId,
        input.expectedVersion + 1,
      ]),
    ]);
    const id = (rows[0] as Array<{ id: string }>)[0]?.id;
    return id
      ? PostgresSportsWatchRepository.getCandidate(input.workspaceId, id)
      : null;
  },

  async createReconciliations(
    workspaceId: string,
    automaticCandidates: SportsWatchCandidate[],
  ): Promise<number> {
    const sql = createContentStorageClient();
    let created = 0;
    for (const automatic of automaticCandidates) {
      if (!automatic.footballEvidence || !automatic.eventDateFrom) continue;
      const manualRows = await sql.query(`
        SELECT id
        FROM sports_watch_candidates
        WHERE workspace_id = $1
          AND athlete_id = $2
          AND source_key = 'manual-entry'
          AND event_date_from = $3::date
      `, [workspaceId, automatic.athleteId, automatic.eventDateFrom]) as Array<{ id: string }>;
      for (const row of manualRows) {
        const manual = await PostgresSportsWatchRepository.getCandidate(workspaceId, row.id);
        if (!manual) continue;
        const comparison = compareFootballCandidates(manual, automatic);
        if (!comparison) continue;
        const reconciliationId = randomUUID();
        const results = await sql.transaction([
          sql.query(`
            INSERT INTO sports_watch_candidate_reconciliations (
              id, workspace_id, manual_candidate_id, automatic_candidate_id,
              comparison_json
            ) VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::jsonb)
            ON CONFLICT (workspace_id, manual_candidate_id, automatic_candidate_id)
            DO NOTHING
            RETURNING id
          `, [
            reconciliationId,
            workspaceId,
            manual.id,
            automatic.id,
            JSON.stringify(comparison),
          ]),
          sql.query(`
            INSERT INTO sports_watch_candidate_reconciliation_events (
              id, workspace_id, reconciliation_id, action, actor_clerk_user_id
            )
            SELECT $1::uuid, $2, $3::uuid, 'created', 'football-public-collector'
            WHERE EXISTS (
              SELECT 1 FROM sports_watch_candidate_reconciliations
              WHERE workspace_id = $2 AND id = $3::uuid
            )
            AND NOT EXISTS (
              SELECT 1 FROM sports_watch_candidate_reconciliation_events
              WHERE workspace_id = $2 AND reconciliation_id = $3::uuid
            )
          `, [randomUUID(), workspaceId, reconciliationId]),
        ]);
        if ((results[0] as Array<{ id: string }>)[0]) created += 1;
      }
    }
    return created;
  },

  async createReconciliationsForMatchKeys(
    workspaceId: string,
    athleteId: string,
    matchKeys: string[],
  ): Promise<number> {
    if (matchKeys.length === 0) return 0;
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT id
      FROM sports_watch_candidates
      WHERE workspace_id = $1
        AND athlete_id = $2
        AND source_key = 'football-public'
        AND football_evidence_json->>'matchKey' = ANY($3::text[])
    `, [workspaceId, athleteId, matchKeys]) as Array<{ id: string }>;
    const candidates: SportsWatchCandidate[] = [];
    for (const row of rows) {
      const candidate = await PostgresSportsWatchRepository.getCandidate(workspaceId, row.id);
      if (candidate) candidates.push(candidate);
    }
    return this.createReconciliations(workspaceId, candidates);
  },

  async listReconciliations(
    workspaceId: string,
  ): Promise<FootballCandidateReconciliationView[]> {
    const sql = createContentStorageClient();
    const rows = await sql.query(`
      SELECT
        id, manual_candidate_id, automatic_candidate_id, decision,
        comparison_json, decided_by_clerk_user_id, decided_at, version
      FROM sports_watch_candidate_reconciliations
      WHERE workspace_id = $1
      ORDER BY updated_at DESC
    `, [workspaceId]) as ReconciliationRow[];
    const views: FootballCandidateReconciliationView[] = [];
    for (const row of rows) {
      const reconciliation = mapReconciliation(row);
      const [manualCandidate, automaticCandidate] = await Promise.all([
        PostgresSportsWatchRepository.getCandidate(workspaceId, reconciliation.manualCandidateId),
        PostgresSportsWatchRepository.getCandidate(workspaceId, reconciliation.automaticCandidateId),
      ]);
      if (!manualCandidate || !automaticCandidate) continue;
      views.push({ ...reconciliation, manualCandidate, automaticCandidate });
    }
    return views;
  },

  async decideReconciliation(input: {
    workspaceId: string;
    reconciliationId: string;
    decision: Exclude<FootballReconciliationDecision, "pending">;
    expectedVersion: number;
    clerkUserId: string;
  }): Promise<FootballCandidateReconciliation | null> {
    const sql = createContentStorageClient();
    const eventId = randomUUID();
    const transaction = await sql.transaction([
      sql.query(`
        UPDATE sports_watch_candidate_reconciliations
        SET decision = $4,
            decided_by_clerk_user_id = $5,
            decided_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE workspace_id = $1
          AND id = $2::uuid
          AND version = $3
        RETURNING
          id, manual_candidate_id, automatic_candidate_id, decision,
          comparison_json, decided_by_clerk_user_id, decided_at, version
      `, [
        input.workspaceId,
        input.reconciliationId,
        input.expectedVersion,
        input.decision,
        input.clerkUserId,
      ]),
      sql.query(`
        INSERT INTO sports_watch_candidate_reconciliation_events (
          id, workspace_id, reconciliation_id, action, actor_clerk_user_id
        )
        SELECT $1::uuid, $2, $3::uuid, $4, $5
        WHERE EXISTS (
          SELECT 1
          FROM sports_watch_candidate_reconciliations
          WHERE workspace_id = $2
            AND id = $3::uuid
            AND version = $6 + 1
        )
      `, [
        eventId,
        input.workspaceId,
        input.reconciliationId,
        input.decision,
        input.clerkUserId,
        input.expectedVersion,
      ]),
    ]);
    const rows = transaction[0] as ReconciliationRow[];
    return rows[0] ? mapReconciliation(rows[0]) : null;
  },
};
