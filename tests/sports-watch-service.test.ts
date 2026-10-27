import { describe, expect, it, vi } from "vitest";
import {
  createSportsWatchService,
  type SportsWatchAdminIdentity,
} from "@/lib/sports-watch/service";
import type {
  CollectedSportsWatchCandidate,
} from "@/lib/sports-watch/bcbulle-collector";
import type { SportsWatchRepository } from "@/lib/sports-watch/repository";
import type { Athlete } from "@/types/athlete";
import type {
  BeBasketBinding,
  IwwfBinding,
  SafvBinding,
  SportsWatchCandidate,
  SportsWatchCollectionObservation,
  SwissBasketballBinding,
  SwissBadmintonBinding,
} from "@/types/sports-watch";

const identity = (workspaceId: string): SportsWatchAdminIdentity => ({
  workspaceId,
  clerkUserId: `admin-${workspaceId}`,
});

const athlete = {
  key: "antoine-majeux",
  athleteId: "antoine-majeux",
  name: "Antoine Majeux",
  sport: "Badminton",
  club: "BC Bulle",
} as Athlete;

const swissVerification = (selectedAthlete = athlete, playerId = "206063") => ({
  athlete: {
    id: selectedAthlete.athleteId!,
    name: selectedAthlete.name,
    sport: selectedAthlete.sport,
    club: selectedAthlete.club,
  },
  officialIdentity: {
    profileUrl: `https://sb.tournamentsoftware.com/player-profile/00000000-0000-4000-8000-${playerId.padStart(12, "0")}`,
    profileUuid: `00000000-0000-4000-8000-${playerId.padStart(12, "0")}`,
    playerId,
    name: selectedAthlete.name,
    club: selectedAthlete.club,
  },
  clubComparison: "matching" as const,
  evidence: [`Identifiant joueur ${playerId}.`],
  verifiedAt: "2026-10-26T10:00:00.000Z",
});

const iwwfAthlete = {
  key: "giuliano-muret",
  athleteId: "giuliano-muret",
  name: "Giuliano Muret",
  sport: "Wakesurf",
  club: "Aloha Wake à Estavayer-le-Lac",
} as Athlete;

const iwwfVerification = (selectedAthlete = iwwfAthlete, officialAthleteId = "SUI982014944") => ({
  athlete: {
    id: selectedAthlete.athleteId!,
    name: selectedAthlete.name,
    sport: selectedAthlete.sport,
    club: selectedAthlete.club,
  },
  officialIdentity: {
    profileUrl: `https://ems.iwwf.sport/Athletes/Profile/${officialAthleteId}`,
    athleteId: officialAthleteId,
    name: selectedAthlete.name,
    birthYear: 2015,
  },
  evidence: [`Identifiant athlète IWWF ${officialAthleteId}.`],
  verifiedAt: "2026-10-26T10:00:00.000Z",
});

const safvAthlete = {
  key: "herez-moussa",
  athleteId: "herez-moussa",
  name: "Herez Moussa",
  sport: "Football américain",
  club: "Lausanne Owls",
} as Athlete;

const safvVerification = () => ({
  athlete: {
    id: safvAthlete.athleteId!,
    name: safvAthlete.name,
    sport: safvAthlete.sport,
    club: safvAthlete.club,
  },
  officialTeam: {
    scheduleUrl: "https://www.safv.ch/spiele-366618v4/leagues/14028",
    leagueId: "14028",
    teamId: "352051",
    teamName: "LUCAF Owls",
    competitionName: "NLB",
    seasonId: "217",
    seasonName: "2026",
  },
  clubComparison: "matching" as const,
  evidence: ["Résultat collectif uniquement."],
  verifiedAt: "2026-07-10T10:00:00.000Z",
});

const beBasketAthlete = {
  key: "mila-benjak",
  athleteId: "mila-benjak",
  name: "Mila Benjak",
  sport: "Basketball",
  club: "BCF Elfic Fribourg",
} as Athlete;

const beBasketVerification = () => ({
  athlete: {
    id: beBasketAthlete.athleteId!,
    name: beBasketAthlete.name,
    sport: beBasketAthlete.sport,
    club: beBasketAthlete.club,
  },
  officialIdentity: {
    calendarUrl: "https://www.bebasket.fr/equipe/bcf-elfic-fribourg/calendrier",
    teamSlug: "bcf-elfic-fribourg",
    teamName: "BCF Elfic Fribourg",
    playerName: "Mila Benjak",
  },
  evidence: ["BeBasket est une source tierce."],
  verifiedAt: "2026-10-27T10:00:00.000Z",
});

const swissBasketballVerification = (teamId: string, teamName: string) => ({
  athlete: {
    id: beBasketAthlete.athleteId!,
    name: beBasketAthlete.name,
    sport: beBasketAthlete.sport,
    club: beBasketAthlete.club,
  },
  officialIdentity: {
    scheduleUrl: `https://swiss.basketball/basketplan/findAllLeagueHoldings.do?lang=fr&xmlView=rss&leagueId=7&federationId=12&seasonId=31`,
    federationId: "12",
    seasonId: "31",
    seasonName: "2026-2027",
    leagueId: "7",
    leagueName: "NLB Women",
    teamId,
    teamName,
    clubId: "199",
    playerId: "71375",
    playerName: "Mila Benjak",
  },
  evidence: [`Équipe officielle ${teamName}.`],
  verifiedAt: "2026-10-27T10:00:00.000Z",
});

const collectedCandidate = (contentHash: string, excerpt: string): CollectedSportsWatchCandidate => ({
  sourceKey: "bc-bulle",
  athlete: {
    id: athlete.athleteId!,
    name: athlete.name,
    sport: athlete.sport,
    club: athlete.club,
  },
  sourceName: "Badminton Club Bulle",
  sourceUrl: "https://bcbulle.ch/feed/",
  articleUrl: "https://bcbulle.ch/resultats-seen-turnier/",
  title: "Résultats : Seen-Turnier",
  excerpt,
  resultKind: "individual_result",
  publicationDate: "2026-10-20T15:26:03.000Z",
  eventDateFrom: "2026-10-18",
  eventDateTo: "2026-10-18",
  collectedAt: "2026-10-26T10:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: [
    "Nom complet présent dans la publication officielle de Badminton Club Bulle.",
    "Le sport CRM concorde avec le badminton.",
    "Le club CRM concorde avec BC Bulle.",
  ],
  logicalKey: "logical-key",
  contentHash,
});

const createMemoryRepository = (): SportsWatchRepository => {
  const records: Array<{
    workspaceId: string;
    logicalKey: string;
    contentHash: string;
    candidate: SportsWatchCandidate;
  }> = [];
  let sequence = 0;
  let runActive = false;
  const bindings: Array<{ workspaceId: string; binding: SwissBadmintonBinding }> = [];
  const iwwfBindings: Array<{ workspaceId: string; binding: IwwfBinding }> = [];
  const safvBindings: Array<{ workspaceId: string; binding: SafvBinding }> = [];
  const beBasketBindings: Array<{ workspaceId: string; binding: BeBasketBinding }> = [];
  const swissBasketballBindings: Array<{
    workspaceId: string;
    binding: SwissBasketballBinding;
  }> = [];

  return {
    async startRun() {
      if (runActive) return null;
      runActive = true;
      return "11111111-1111-4111-8111-111111111111";
    },
    async completeRun() {
      runActive = false;
    },
    async failRun() {
      runActive = false;
    },
    async saveCandidates(workspaceId, candidates) {
      let created = 0;
      for (const item of candidates) {
        if (records.some((record) =>
          record.workspaceId === workspaceId
          && record.candidate.athleteId === item.athlete.id
          && record.logicalKey === item.logicalKey
          && record.contentHash === item.contentHash)) {
          continue;
        }
        const previous = records
          .filter((record) =>
            record.workspaceId === workspaceId
            && record.candidate.athleteId === item.athlete.id
            && record.logicalKey === item.logicalKey)
          .at(-1);
        sequence += 1;
        records.push({
          workspaceId,
          logicalKey: item.logicalKey,
          contentHash: item.contentHash,
          candidate: {
            id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
            athleteId: item.athlete.id,
            athleteName: item.athlete.name,
            sourceName: item.sourceName,
            sourceUrl: item.sourceUrl,
            articleUrl: item.articleUrl,
            title: item.title,
            excerpt: item.excerpt,
            resultKind: item.resultKind,
            publicationDate: item.publicationDate,
            eventDateFrom: item.eventDateFrom,
            eventDateTo: item.eventDateTo,
            collectedAt: item.collectedAt,
            attributionStatus: item.attributionStatus,
            attributionEvidence: item.attributionEvidence,
            verificationStatus: "unverified",
            adminStatus: "pending",
            supersedesCandidateId: previous?.candidate.id ?? null,
            version: 1,
          },
        });
        created += 1;
      }
      return created;
    },
    async listCandidates(workspaceId) {
      return records.filter((record) => record.workspaceId === workspaceId).map((record) => record.candidate);
    },
    async getCandidate(workspaceId, candidateId) {
      return records.find((record) =>
        record.workspaceId === workspaceId
        && record.candidate.id === candidateId)?.candidate ?? null;
    },
    async reviewCandidate(input) {
      const record = records.find((item) =>
        item.workspaceId === input.workspaceId
        && item.candidate.id === input.candidateId
        && item.candidate.version === input.expectedVersion);
      if (!record) return null;
      record.candidate = {
        ...record.candidate,
        adminStatus: input.status,
        version: record.candidate.version + 1,
      };
      return record.candidate;
    },
    async getValidatedCandidate(workspaceId, candidateId) {
      return records.find((record) =>
        record.workspaceId === workspaceId
        && record.candidate.id === candidateId
        && record.candidate.adminStatus === "validated")?.candidate ?? null;
    },
    async listSwissBindings(workspaceId) {
      return bindings
        .filter((record) => record.workspaceId === workspaceId)
        .map((record) => record.binding);
    },
    async getActiveSwissBinding(workspaceId, athleteId) {
      return bindings.find((record) =>
        record.workspaceId === workspaceId
        && record.binding.athleteId === athleteId
        && record.binding.active)?.binding ?? null;
    },
    async saveSwissBinding(input) {
      const existing = bindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.verification.athlete.id);
      if (existing && existing.binding.version !== input.expectedVersion) return null;
      const duplicate = bindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId !== input.verification.athlete.id
        && record.binding.active
        && (
          record.binding.officialIdentity.playerId === input.verification.officialIdentity.playerId
          || record.binding.officialIdentity.profileUuid === input.verification.officialIdentity.profileUuid
        ));
      if (duplicate) throw Object.assign(new Error("duplicate"), { code: "23505" });
      const binding: SwissBadmintonBinding = {
        id: existing?.binding.id ?? `10000000-0000-4000-8000-${String(bindings.length + 1).padStart(12, "0")}`,
        athleteId: input.verification.athlete.id,
        officialIdentity: input.verification.officialIdentity,
        clubComparison: input.verification.clubComparison,
        evidence: input.verification.evidence,
        verifiedAt: input.verification.verifiedAt,
        confirmedAt: input.confirmedAt,
        active: true,
        disabledAt: null,
        version: existing ? existing.binding.version + 1 : 1,
      };
      if (existing) existing.binding = binding;
      else bindings.push({ workspaceId: input.workspaceId, binding });
      return binding;
    },
    async disableSwissBinding(input) {
      const existing = bindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.athleteId
        && record.binding.active
        && record.binding.version === input.expectedVersion);
      if (!existing) return null;
      existing.binding = {
        ...existing.binding,
        active: false,
        disabledAt: "2026-10-26T10:00:00.000Z",
        version: existing.binding.version + 1,
      };
      return existing.binding;
    },
    async listIwwfBindings(workspaceId) {
      return iwwfBindings
        .filter((record) => record.workspaceId === workspaceId)
        .map((record) => record.binding);
    },
    async getActiveIwwfBinding(workspaceId, athleteId) {
      return iwwfBindings.find((record) =>
        record.workspaceId === workspaceId
        && record.binding.athleteId === athleteId
        && record.binding.active)?.binding ?? null;
    },
    async saveIwwfBinding(input) {
      const existing = iwwfBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.verification.athlete.id);
      if (existing && existing.binding.version !== input.expectedVersion) return null;
      const duplicate = iwwfBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId !== input.verification.athlete.id
        && record.binding.active
        && (
          record.binding.officialIdentity.athleteId === input.verification.officialIdentity.athleteId
          || record.binding.officialIdentity.profileUrl === input.verification.officialIdentity.profileUrl
        ));
      if (duplicate) throw Object.assign(new Error("duplicate"), { code: "23505" });
      const binding: IwwfBinding = {
        id: existing?.binding.id ?? `20000000-0000-4000-8000-${String(iwwfBindings.length + 1).padStart(12, "0")}`,
        athleteId: input.verification.athlete.id,
        officialIdentity: input.verification.officialIdentity,
        evidence: input.verification.evidence,
        verifiedAt: input.verification.verifiedAt,
        confirmedAt: input.confirmedAt,
        active: true,
        disabledAt: null,
        version: existing ? existing.binding.version + 1 : 1,
      };
      if (existing) existing.binding = binding;
      else iwwfBindings.push({ workspaceId: input.workspaceId, binding });
      return binding;
    },
    async disableIwwfBinding(input) {
      const existing = iwwfBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.athleteId
        && record.binding.active
        && record.binding.version === input.expectedVersion);
      if (!existing) return null;
      existing.binding = {
        ...existing.binding,
        active: false,
        disabledAt: "2026-10-26T10:00:00.000Z",
        version: existing.binding.version + 1,
      };
      return existing.binding;
    },
    async listSafvBindings(workspaceId) {
      return safvBindings
        .filter((record) => record.workspaceId === workspaceId)
        .map((record) => record.binding);
    },
    async getActiveSafvBinding(workspaceId, athleteId) {
      return safvBindings.find((record) =>
        record.workspaceId === workspaceId
        && record.binding.athleteId === athleteId
        && record.binding.active)?.binding ?? null;
    },
    async saveSafvBinding(input) {
      const existing = safvBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.verification.athlete.id);
      if (existing && existing.binding.version !== input.expectedVersion) return null;
      const binding: SafvBinding = {
        id: existing?.binding.id ?? `30000000-0000-4000-8000-${String(safvBindings.length + 1).padStart(12, "0")}`,
        athleteId: input.verification.athlete.id,
        officialTeam: input.verification.officialTeam,
        clubComparison: input.verification.clubComparison,
        evidence: input.verification.evidence,
        verifiedAt: input.verification.verifiedAt,
        confirmedAt: input.confirmedAt,
        active: true,
        disabledAt: null,
        version: existing ? existing.binding.version + 1 : 1,
      };
      if (existing) existing.binding = binding;
      else safvBindings.push({ workspaceId: input.workspaceId, binding });
      return binding;
    },
    async disableSafvBinding(input) {
      const existing = safvBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.athleteId
        && record.binding.active
        && record.binding.version === input.expectedVersion);
      if (!existing) return null;
      existing.binding = {
        ...existing.binding,
        active: false,
        disabledAt: "2026-10-26T10:00:00.000Z",
        version: existing.binding.version + 1,
      };
      return existing.binding;
    },
    async listBeBasketBindings(workspaceId) {
      return beBasketBindings
        .filter((record) => record.workspaceId === workspaceId)
        .map((record) => record.binding);
    },
    async getActiveBeBasketBinding(workspaceId, athleteId) {
      return beBasketBindings.find((record) =>
        record.workspaceId === workspaceId
        && record.binding.athleteId === athleteId
        && record.binding.active)?.binding ?? null;
    },
    async saveBeBasketBinding(input) {
      const existing = beBasketBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.verification.athlete.id);
      if (existing && existing.binding.version !== input.expectedVersion) return null;
      const binding: BeBasketBinding = {
        id: existing?.binding.id ?? `40000000-0000-4000-8000-${String(beBasketBindings.length + 1).padStart(12, "0")}`,
        athleteId: input.verification.athlete.id,
        officialIdentity: input.verification.officialIdentity,
        evidence: input.verification.evidence,
        verifiedAt: input.verification.verifiedAt,
        confirmedAt: input.confirmedAt,
        active: true,
        disabledAt: null,
        version: existing ? existing.binding.version + 1 : 1,
      };
      if (existing) existing.binding = binding;
      else beBasketBindings.push({ workspaceId: input.workspaceId, binding });
      return binding;
    },
    async disableBeBasketBinding(input) {
      const existing = beBasketBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.athleteId
        && record.binding.active
        && record.binding.version === input.expectedVersion);
      if (!existing) return null;
      existing.binding = {
        ...existing.binding,
        active: false,
        disabledAt: "2026-10-26T10:00:00.000Z",
        version: existing.binding.version + 1,
      };
      return existing.binding;
    },
    async listSwissBasketballBindings(workspaceId) {
      return swissBasketballBindings
        .filter((record) => record.workspaceId === workspaceId)
        .map((record) => record.binding);
    },
    async getActiveSwissBasketballBindings(workspaceId, athleteId) {
      return swissBasketballBindings
        .filter((record) =>
          record.workspaceId === workspaceId
          && record.binding.athleteId === athleteId
          && record.binding.active)
        .map((record) => record.binding);
    },
    async saveSwissBasketballBinding(input) {
      const official = input.verification.officialIdentity;
      const existing = swissBasketballBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.athleteId === input.verification.athlete.id
        && record.binding.officialIdentity.seasonId === official.seasonId
        && record.binding.officialIdentity.leagueId === official.leagueId
        && record.binding.officialIdentity.teamId === official.teamId);
      if (existing && existing.binding.version !== input.expectedVersion) return null;
      const binding: SwissBasketballBinding = {
        id: existing?.binding.id
          ?? `50000000-0000-4000-8000-${String(swissBasketballBindings.length + 1).padStart(12, "0")}`,
        athleteId: input.verification.athlete.id,
        officialIdentity: official,
        evidence: input.verification.evidence,
        verifiedAt: input.verification.verifiedAt,
        confirmedAt: input.confirmedAt,
        active: true,
        disabledAt: null,
        version: existing ? existing.binding.version + 1 : 1,
      };
      if (existing) existing.binding = binding;
      else swissBasketballBindings.push({ workspaceId: input.workspaceId, binding });
      return binding;
    },
    async disableSwissBasketballBinding(input) {
      const existing = swissBasketballBindings.find((record) =>
        record.workspaceId === input.workspaceId
        && record.binding.id === input.bindingId
        && record.binding.active
        && record.binding.version === input.expectedVersion);
      if (!existing) return null;
      existing.binding = {
        ...existing.binding,
        active: false,
        disabledAt: "2026-10-27T10:00:00.000Z",
        version: existing.binding.version + 1,
      };
      return existing.binding;
    },
  };
};

describe("sports watch service", () => {
  it("collects multiple Swiss Basketball teams, deduplicates common matches and reports partial coverage", async () => {
    const repository = createMemoryRepository();
    const candidate: CollectedSportsWatchCandidate = {
      ...collectedCandidate("swiss-basketball-hash", [
        "Source : Swiss Basketball — source officielle.",
        "Compétition : NLB Women · 2026-2027.",
        "Équipe : Elfic Fribourg Génération.",
        "Match : Elfic Fribourg Génération 63–51 BC Arlesheim.",
        "Présence nominative : Benjak Mila.",
        "Titularisation : non.",
        "Statistiques individuelles explicitement présentes : PTS 16.",
      ].join(" ")),
      sourceKey: "swiss-basketball",
      athlete: {
        id: beBasketAthlete.athleteId!,
        name: beBasketAthlete.name,
        sport: beBasketAthlete.sport,
        club: beBasketAthlete.club,
      },
      sourceName: "Swiss Basketball — source officielle",
      sourceUrl: swissBasketballVerification("1269", "Elfic Fribourg Génération")
        .officialIdentity.scheduleUrl,
      articleUrl: "https://swiss.basketball/basketplan/showGameOverview.do?lang=fr&xmlView=rss&gameId=367576",
      title: "Elfic Fribourg Génération 63–51 BC Arlesheim — Benjak Mila",
      eventDateFrom: "2026-10-25",
      eventDateTo: "2026-10-25",
      logicalKey: "swiss-basketball|31|7|1269|367576|71375",
    };
    const collectSwissBasketball = vi.fn(async (
      _selectedAthlete,
      options: { swissBasketballIdentity?: { teamId: string; teamName: string } },
    ) => {
      if (options.swissBasketballIdentity?.teamId === "8888") {
        throw new Error("feuille indisponible");
      }
      return {
        candidates: [candidate],
        observations: [{
          matchUrl: candidate.articleUrl,
          title: candidate.title,
          eventDate: "2026-10-25",
          status: "participation_explicit" as const,
        }],
        scannedCount: 14,
        recentCount: 1,
      };
    });
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [beBasketAthlete],
      collectors: { "swiss-basketball": collectSwissBasketball },
      verifySwissBasketballBinding: vi.fn(async (_selected, options) =>
        swissBasketballVerification(
          options.teamId,
          options.teamId === "1269"
            ? "Elfic Fribourg Génération"
            : options.teamId === "7777"
              ? "Équipe secondaire"
              : "Équipe indisponible",
        )),
      now: () => new Date("2026-10-27T10:00:00.000Z"),
    });

    for (const teamId of ["1269", "7777", "8888"]) {
      await service.confirmSwissBasketballBinding(
        beBasketAthlete.athleteId,
        "31",
        "7",
        teamId,
        0,
        identity("workspace-a"),
      );
    }
    const run = await service.run(
      "swiss-basketball",
      beBasketAthlete.athleteId,
      identity("workspace-a"),
    );

    expect(collectSwissBasketball).toHaveBeenCalledTimes(3);
    expect(run.createdCount).toBe(1);
    expect(run.message).toContain("Couverture partielle : 1 rattachement en échec");
    expect(run.message).toContain("Équipe indisponible · NLB Women");
    const swissCandidates = run.candidates.filter((item) =>
      item.sourceName === "Swiss Basketball — source officielle");
    expect(swissCandidates).toHaveLength(1);
    const validated = await service.review(
      swissCandidates[0].id,
      "validated",
      swissCandidates[0].version,
      identity("workspace-a"),
    );
    const prefill = await service.buildArticlePrefill(
      validated.id,
      identity("workspace-a"),
    );
    expect(prefill.materials.map((material) => material.text).join(" ")).toContain("PTS 16");
    expect(prefill.materials[0].provenance).toContain(
      "Swiss Basketball — source officielle",
    );
    expect(await service.listBeBasketBindings(identity("workspace-a"))).toEqual([]);
  });

  it("keeps BeBasket third-party facts unverified through Admin review and Article transfer", async () => {
    const repository = createMemoryRepository();
    const excerpt = [
      "Source : BeBasket — source tierce.",
      "Statut factuel : non vérifié ; aucune corroboration officielle.",
      "Participation explicitement documentée pour Mila Benjak.",
      "Statistiques explicitement présentes : MIN 2:16 · PTS 1 · LF 1/2.",
    ].join(" ");
    const collectBeBasket = vi.fn(async () => ({
      candidates: [{
        ...collectedCandidate("bebasket-hash", excerpt),
        sourceKey: "bebasket" as const,
        athlete: beBasketVerification().athlete,
        sourceName: "BeBasket — source tierce",
        sourceUrl: beBasketVerification().officialIdentity.calendarUrl,
        articleUrl: "https://www.bebasket.fr/match/01a11769-7ce4-7bfe-b0de-89de7cc46107",
        title: "BCF Elfic Fribourg vs Nyon Basket Feminin — Mila Benjak",
        eventDateFrom: "2026-10-25",
        eventDateTo: "2026-10-25",
        logicalKey: "bebasket|match|mila-benjak",
      }],
      observations: [{
        matchUrl: "https://www.bebasket.fr/match/01a11769-7ce4-7bfe-b0de-89de7cc46107",
        title: "BCF Elfic Fribourg vs Nyon Basket Feminin",
        eventDate: "2026-10-25",
        status: "participation_explicit" as SportsWatchCollectionObservation["status"],
      }],
      scannedCount: 1,
      recentCount: 1,
    }));
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [beBasketAthlete],
      collectors: { bebasket: collectBeBasket },
      verifyBeBasketBinding: vi.fn(async () => beBasketVerification()),
      now: () => new Date("2026-10-27T10:00:00.000Z"),
    });

    const binding = await service.confirmBeBasketBinding(
      beBasketAthlete.athleteId,
      beBasketVerification().officialIdentity.calendarUrl,
      beBasketVerification().officialIdentity.teamName,
      beBasketVerification().officialIdentity.playerName,
      0,
      identity("workspace-a"),
    );
    const run = await service.run(
      "bebasket",
      beBasketAthlete.athleteId,
      identity("workspace-a"),
    );

    expect(collectBeBasket).toHaveBeenCalledWith(
      expect.objectContaining({ id: beBasketAthlete.athleteId }),
      expect.objectContaining({ beBasketIdentity: binding.officialIdentity, lookbackDays: 30 }),
    );
    expect(run.message).toContain("Participation explicite : 1");
    const validated = await service.review(
      run.candidates[0].id,
      "validated",
      run.candidates[0].version,
      identity("workspace-a"),
    );
    expect(validated.verificationStatus).toBe("unverified");

    const prefill = await service.buildArticlePrefill(validated.id, identity("workspace-a"));
    expect(prefill.verificationStatus).toBe("unverified");
    expect(prefill.materials.map((material) => material.text).join(" ")).toContain("PTS 1");
    expect(prefill.materials[0].provenance).toContain("BeBasket — source tierce");
    expect(prefill.materials[0].provenance).toContain("Vérification factuelle : non vérifiée");

    collectBeBasket.mockResolvedValueOnce({
      candidates: [],
      observations: [{
        matchUrl: "https://www.bebasket.fr/match/zero-minute-fixture",
        title: "Ravens Geneve vs BCF Elfic Fribourg",
        eventDate: "2026-10-18",
        status: "player_listed_without_participation",
      }],
      scannedCount: 1,
      recentCount: 1,
    });
    const listedOnlyRun = await service.run(
      "bebasket",
      beBasketAthlete.athleteId,
      identity("workspace-a"),
    );
    expect(listedOnlyRun.message).toContain("Joueuse listée sans participation établie : 1");

    const ambiguousUrl = "https://www.bebasket.fr/match/ambiguous-team-fixture";
    collectBeBasket.mockResolvedValueOnce({
      candidates: [],
      observations: [{
        matchUrl: ambiguousUrl,
        title: "Equipe indécidable vs autre équipe",
        eventDate: "2026-10-19",
        status: "team_ambiguous",
      }],
      scannedCount: 1,
      recentCount: 1,
    });
    const ambiguousRun = await service.run(
      "bebasket",
      beBasketAthlete.athleteId,
      identity("workspace-a"),
    );
    expect(ambiguousRun.message).toContain("Feuille ambiguë écartée : 1");
    expect(ambiguousRun.message).toContain(ambiguousUrl);
  });

  it("uses an active SAFV binding and keeps collective provenance unverified for Article", async () => {
    const repository = createMemoryRepository();
    const excerpt = [
      "Résultat collectif — participation individuelle non vérifiée.",
      "NLB 2026.",
      "Équipes dans l’ordre officiel : Langenthal Invaders puis LUCAF Owls.",
      "Score final explicite : 28-7.",
    ].join(" ");
    const collectSafv = vi.fn(async () => ({
      candidates: [{
        ...collectedCandidate("safv-hash", excerpt),
        sourceKey: "safv" as const,
        athlete: safvVerification().athlete,
        sourceName: "SAFV",
        sourceUrl: safvVerification().officialTeam.scheduleUrl,
        articleUrl: "https://www.safv.ch/games/2447915",
        title: "NLB 2026 — Langenthal Invaders vs LUCAF Owls",
        resultKind: "collective_result" as const,
        publicationDate: null,
        eventDateFrom: "2026-07-04",
        eventDateTo: "2026-07-04",
        logicalKey: "safv|14028|2447915",
      }],
      scannedCount: 1,
      recentCount: 1,
    }));
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [safvAthlete],
      collectors: { safv: collectSafv },
      verifySafvTeam: vi.fn(async () => safvVerification()),
      now: () => new Date("2026-07-10T10:00:00.000Z"),
    });

    await expect(service.run("safv", safvAthlete.athleteId, identity("workspace-a")))
      .rejects.toThrow("Configurez et confirmez");

    const binding = await service.confirmSafvBinding(
      safvAthlete.athleteId,
      safvVerification().officialTeam.scheduleUrl,
      "LUCAF Owls",
      0,
      identity("workspace-a"),
    );
    const run = await service.run("safv", safvAthlete.athleteId, identity("workspace-a"));
    expect(collectSafv).toHaveBeenCalledWith(
      expect.objectContaining({ id: safvAthlete.athleteId }),
      expect.objectContaining({ safvTeam: binding.officialTeam }),
    );
    expect(run.createdCount).toBe(1);
    const duplicateRun = await service.run(
      "safv",
      safvAthlete.athleteId,
      identity("workspace-a"),
    );
    expect(duplicateRun.createdCount).toBe(0);
    expect(duplicateRun.candidates).toHaveLength(1);

    const validated = await service.review(
      run.candidates[0].id,
      "validated",
      run.candidates[0].version,
      identity("workspace-a"),
    );
    const prefill = await service.buildArticlePrefill(validated.id, identity("workspace-a"));
    expect(prefill.verificationStatus).toBe("unverified");
    expect(prefill.materials).toHaveLength(1);
    expect(prefill.materials[0].text).toBe(excerpt);

    const disabled = await service.disableSafvBinding(
      safvAthlete.athleteId,
      binding.version,
      identity("workspace-a"),
    );
    expect(disabled.active).toBe(false);
    await expect(service.run("safv", safvAthlete.athleteId, identity("workspace-a")))
      .rejects.toThrow("Configurez et confirmez");
    expect(await service.list(identity("workspace-a"))).toHaveLength(1);
    expect(await service.listSafvBindings(identity("workspace-b"))).toEqual([]);
  });

  it("keeps an honest empty Kempo run and blocks validation when attribution is ambiguous", async () => {
    const repository = createMemoryRepository();
    const ambiguous = {
      ...collectedCandidate("kempo-ambiguous", "Timothée Fuchs participe à une compétition."),
      sourceKey: "kenpokan",
      athlete: {
        id: "timothee-fuchs",
        name: "Timothée Fuchs",
        sport: "Kempo",
        club: "Club inconnu",
      },
      sourceName: "Kenpokan Dojo",
      sourceUrl: "https://kenpokan-dojo.ch/feed/",
      articleUrl: "https://kenpokan-dojo.ch/competition/",
      attributionStatus: "ambiguous" as const,
    };
    let collection = { candidates: [] as CollectedSportsWatchCandidate[], scannedCount: 1, recentCount: 0 };
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [{
        key: "timothee-fuchs",
        athleteId: "timothee-fuchs",
        name: "Timothée Fuchs",
        sport: "Kempo",
        club: "Kenpokandojo",
      } as Athlete],
      collectors: {
        kenpokan: async () => collection,
      },
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    const empty = await service.run("kenpokan", "timothee-fuchs", identity("workspace-a"));
    expect(empty).toMatchObject({
      createdCount: 0,
      recentCount: 0,
      message: "Aucune publication Kenpokan Dojo des 30 derniers jours. Aucune archive n’a été remontée.",
    });

    collection = { candidates: [ambiguous], scannedCount: 1, recentCount: 1 };
    const run = await service.run("kenpokan", "timothee-fuchs", identity("workspace-a"));
    await expect(service.review(
      run.candidates[0].id,
      "validated",
      run.candidates[0].version,
      identity("workspace-a"),
    )).rejects.toThrow("attribution de ce candidat est ambiguë");
    await expect(service.review(
      run.candidates[0].id,
      "rejected",
      run.candidates[0].version,
      identity("workspace-a"),
    )).resolves.toMatchObject({ adminStatus: "rejected" });
  });

  it("verifies, confirms and injects an IWWF binding into the shared collector flow", async () => {
    const repository = createMemoryRepository();
    const collectIwwf = vi.fn(async () => ({
      candidates: [{
        ...collectedCandidate("iwwf-hash", "Tour : Final. Score explicite : 36,67."),
        sourceKey: "iwwf-wakesurf",
        athlete: {
          id: iwwfAthlete.athleteId!,
          name: iwwfAthlete.name,
          sport: iwwfAthlete.sport,
          club: iwwfAthlete.club,
        },
        sourceName: "IWWF Event Management System",
        sourceUrl: iwwfVerification().officialIdentity.profileUrl,
        articleUrl: "https://ems.iwwf.sport/Competitions/Details/official",
      }],
      scannedCount: 1,
      recentCount: 1,
    }));
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [iwwfAthlete],
      collectors: { "iwwf-wakesurf": collectIwwf },
      verifyIwwfProfile: vi.fn(async () => iwwfVerification()),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    await expect(service.run(
      "iwwf-wakesurf",
      iwwfAthlete.athleteId,
      identity("workspace-a"),
    )).rejects.toThrow("Configurez et confirmez");

    const binding = await service.confirmIwwfBinding(
      iwwfAthlete.athleteId,
      iwwfVerification().officialIdentity.profileUrl,
      0,
      identity("workspace-a"),
    );
    const result = await service.run(
      "iwwf-wakesurf",
      iwwfAthlete.athleteId,
      identity("workspace-a"),
    );

    expect(binding).toMatchObject({
      athleteId: "giuliano-muret",
      active: true,
      officialIdentity: { athleteId: "SUI982014944" },
    });
    expect(collectIwwf).toHaveBeenCalledWith(
      expect.objectContaining({ id: "giuliano-muret" }),
      expect.objectContaining({
        iwwfProfile: expect.objectContaining({ athleteId: "SUI982014944" }),
      }),
    );
    expect(result).toMatchObject({
      sourceName: "IWWF Event Management System",
      sourceUrl: iwwfVerification().officialIdentity.profileUrl,
      createdCount: 1,
    });
    const candidate = await service.review(
      result.candidates[0].id,
      "validated",
      result.candidates[0].version,
      identity("workspace-a"),
    );
    const prefill = await service.buildArticlePrefill(candidate.id, identity("workspace-a"));
    expect(prefill).toMatchObject({
      athleteId: "giuliano-muret",
      verificationStatus: "unverified",
      materials: [expect.objectContaining({
        text: "Tour : Final. Score explicite : 36,67.",
      })],
    });
    expect(prefill.materials[0].provenance).toContain(
      "https://ems.iwwf.sport/Competitions/Details/official",
    );

    await service.disableIwwfBinding(
      iwwfAthlete.athleteId,
      binding.version,
      identity("workspace-a"),
    );
    await expect(service.run(
      "iwwf-wakesurf",
      iwwfAthlete.athleteId,
      identity("workspace-a"),
    )).rejects.toThrow("Configurez et confirmez");
    expect(await service.list(identity("workspace-a"))).toEqual([
      expect.objectContaining({ id: candidate.id, adminStatus: "validated" }),
    ]);
    expect(await service.listIwwfBindings(identity("workspace-b"))).toEqual([]);
  });

  it("uses the server-selected collector and run key", async () => {
    const repository = createMemoryRepository();
    const startRun = vi.spyOn(repository, "startRun");
    const collectSwiss = vi.fn(async () => ({
      candidates: [{
        ...collectedCandidate("swiss-hash", "Résultat officiel Swiss Badminton."),
        sourceKey: "swiss-badminton",
        sourceName: "Swiss Badminton / Tournamentsoftware",
        sourceUrl: "https://sb.tournamentsoftware.com/player-profile/official",
        articleUrl: "https://sb.tournamentsoftware.com/sport/draw.aspx?id=official&draw=1",
      }],
      scannedCount: 1,
      recentCount: 1,
    }));
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete],
      collectors: { "swiss-badminton": collectSwiss },
      verifySwissProfile: vi.fn(async () => swissVerification()),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );
    await service.run("swiss-badminton", athlete.athleteId, identity("workspace-a"));

    expect(collectSwiss).toHaveBeenCalledOnce();
    expect(collectSwiss).toHaveBeenCalledWith(
      expect.objectContaining({ id: "antoine-majeux" }),
      expect.objectContaining({
        swissProfile: expect.objectContaining({ playerId: "206063" }),
      }),
    );
    expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-a",
      sourceKey: "swiss-badminton",
      athleteId: "antoine-majeux",
    }));
  });

  it("deduplicates an identical result and creates a pending successor for a modified result", async () => {
    const repository = createMemoryRepository();
    let current = collectedCandidate("hash-v1", "Antoine Majeux termine à la 2ème place.");
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete],
      collectors: {
        "bc-bulle": async () => ({ candidates: [current], scannedCount: 1, recentCount: 1 }),
      },
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    const first = await service.run("bc-bulle", athlete.athleteId, identity("workspace-a"));
    expect(first.createdCount).toBe(1);
    const firstCandidate = first.candidates[0];
    await service.review(firstCandidate.id, "validated", firstCandidate.version, identity("workspace-a"));

    const duplicate = await service.run("bc-bulle", athlete.athleteId, identity("workspace-a"));
    expect(duplicate.createdCount).toBe(0);

    current = collectedCandidate("hash-v2", "Antoine Majeux termine à la 1ère place.");
    const modified = await service.run("bc-bulle", athlete.athleteId, identity("workspace-a"));
    expect(modified.createdCount).toBe(1);
    expect(modified.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: firstCandidate.id, adminStatus: "validated" }),
      expect.objectContaining({
        excerpt: "Antoine Majeux termine à la 1ère place.",
        adminStatus: "pending",
        supersedesCandidateId: firstCandidate.id,
      }),
    ]));
  });

  it("reconstructs a faithful Article material only for a validated candidate in the same workspace", async () => {
    const repository = createMemoryRepository();
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete],
      collectors: {
        "bc-bulle": async () => ({
          candidates: [collectedCandidate("hash-v1", "Antoine Majeux termine à la 2ème place.")],
          scannedCount: 1,
          recentCount: 1,
        }),
      },
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });
    const run = await service.run("bc-bulle", athlete.athleteId, identity("workspace-a"));
    const candidate = await service.review(
      run.candidates[0].id,
      "validated",
      run.candidates[0].version,
      identity("workspace-a"),
    );

    const prefill = await service.buildArticlePrefill(candidate.id, identity("workspace-a"));
    expect(prefill).toMatchObject({
      candidateId: candidate.id,
      athleteId: "antoine-majeux",
      verificationStatus: "unverified",
      materials: [expect.objectContaining({
        kind: "note",
        text: "Antoine Majeux termine à la 2ème place.",
        sourceDate: "2026-10-18",
      })],
    });
    expect(prefill.materials[0].provenance).toContain("https://bcbulle.ch/resultats-seen-turnier/");
    expect(prefill.materials[0].provenance).toContain("Vérification factuelle : non vérifiée");

    await expect(service.buildArticlePrefill(candidate.id, identity("workspace-b")))
      .rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps distinct verified profiles isolated by athlete and workspace", async () => {
    const repository = createMemoryRepository();
    const secondAthlete = {
      ...athlete,
      key: "second-athlete",
      athleteId: "second-athlete",
      name: "Deuxième Athlète",
      club: "Autre Club",
    } as Athlete;
    const verifySwissProfile = vi.fn(async (selected: {
      id: string;
      name: string;
      sport: string;
      club: string;
    }) => swissVerification(
      selected.id === athlete.athleteId ? athlete : secondAthlete,
      selected.id === athlete.athleteId ? "206063" : "306064",
    ));
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete, secondAthlete],
      verifySwissProfile,
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification(athlete, "206063").officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );
    await service.confirmSwissBinding(
      secondAthlete.athleteId,
      swissVerification(secondAthlete, "306064").officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );

    expect(await service.listSwissBindings(identity("workspace-a"))).toHaveLength(2);
    expect(await service.listSwissBindings(identity("workspace-b"))).toEqual([]);
    await expect(service.run(
      "swiss-badminton",
      athlete.athleteId,
      identity("workspace-b"),
    )).rejects.toThrow("Configurez et confirmez");
  });

  it("rejects a duplicate active official profile in the same workspace", async () => {
    const repository = createMemoryRepository();
    const secondAthlete = {
      ...athlete,
      key: "second-athlete",
      athleteId: "second-athlete",
      name: "Deuxième Athlète",
    } as Athlete;
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete, secondAthlete],
      verifySwissProfile: vi.fn(async (selected) => ({
        ...swissVerification(athlete, "206063"),
        athlete: selected,
        officialIdentity: {
          ...swissVerification(athlete, "206063").officialIdentity,
          name: selected.name,
        },
      })),
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );
    await expect(service.confirmSwissBinding(
      secondAthlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "206063",
      0,
      identity("workspace-a"),
    )).rejects.toMatchObject({ code: "conflict" });
  });

  it("disables and re-verifies a binding without deleting historical candidates", async () => {
    const repository = createMemoryRepository();
    const verifySwissProfile = vi.fn(async () => swissVerification());
    const service = createSportsWatchService({
      repository,
      getAthletes: async () => [athlete],
      verifySwissProfile,
      collectors: {
        "swiss-badminton": async () => ({
          candidates: [{
            ...collectedCandidate("swiss-history", "Résultat Swiss historique."),
            sourceKey: "swiss-badminton",
          }],
          scannedCount: 1,
          recentCount: 1,
        }),
      },
      now: () => new Date("2026-10-26T10:00:00.000Z"),
    });

    const active = await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "",
      0,
      identity("workspace-a"),
    );
    await service.run("swiss-badminton", athlete.athleteId, identity("workspace-a"));
    const disabled = await service.disableSwissBinding(
      athlete.athleteId,
      active.version,
      identity("workspace-a"),
    );

    expect(disabled.active).toBe(false);
    expect(await service.list(identity("workspace-a"))).toEqual([
      expect.objectContaining({ excerpt: "Résultat Swiss historique." }),
    ]);
    await expect(service.run(
      "swiss-badminton",
      athlete.athleteId,
      identity("workspace-a"),
    )).rejects.toThrow("Configurez et confirmez");

    const reactivated = await service.confirmSwissBinding(
      athlete.athleteId,
      swissVerification().officialIdentity.profileUrl,
      "206063",
      disabled.version,
      identity("workspace-a"),
    );
    expect(reactivated.active).toBe(true);
    expect(verifySwissProfile).toHaveBeenCalledTimes(2);
  });
});
