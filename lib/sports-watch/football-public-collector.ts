import { createHash } from "node:crypto";
import {
  SPORTS_WATCH_USER_AGENT,
  SportsWatchSourceError,
  type CollectedSportsWatchCandidate,
  type SportsWatchAthleteSnapshot,
} from "@/lib/sports-watch/bcbulle-collector";
import type {
  FootballCandidateEvidence,
  FootballCollectionReport,
  FootballPublicBinding,
  FootballPublicPlayer,
  FootballPublicTeamDiscovery,
} from "@/types/sports-watch";

export const FOOTBALL_PUBLIC_SOURCE_KEY = "football-public";
export const FOOTSTATS_SOURCE_NAME =
  "Footstats — page publique, source tierce non officielle";
export const FOOTSTATS_BASE_URL = "https://www.footstats.ch/";
export const AFF_SOURCE_NAME = "Matchcenter AFF — source fédérale officielle";
export const AFF_ROBOTS_BLOCK_MESSAGE =
  "Le matchcenter AFF n’est pas interrogé : ses règles robots refusent explicitement cet agent et l’accès public renvoie HTTP 403.";

const FOOTSTATS_HOSTNAME = "www.footstats.ch";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 2;
const MAX_PLAYERS = 80;
const MAX_MATCHES = 80;

type FootballPublicDependencies = {
  fetch: typeof fetch;
  now: () => Date;
  collectAffMatches?: (binding: FootballPublicBinding) => Promise<FootballSourceMatch[]>;
};

export type FootballSourceMatch = {
  source: "footstats" | "aff";
  sourceUrl: string;
  date: string;
  competition: string | null;
  firstTeam: string;
  secondTeam: string;
  firstScore: number | null;
  secondScore: number | null;
  lineupAvailable: boolean;
  playerNamed: boolean;
  starter: boolean | null;
  substitute: boolean | null;
  entered: boolean | null;
  entryMinute: number | null;
  exitMinute: number | null;
  goals: number | null;
  goalMinutes: number[];
  yellowCards: number | null;
  redCards: number | null;
  cardMinutes: number[];
  facts: string[];
};

export type FootballPublicCollectionResult = {
  candidates: Array<CollectedSportsWatchCandidate & {
    footballEvidence: FootballCandidateEvidence;
  }>;
  scannedCount: number;
  recentCount: number;
  report: FootballCollectionReport;
};

const normalize = (value: unknown): string => String(value ?? "")
  .trim()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const decodeHtml = (value: string): string => value
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, "\"")
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&nbsp;/g, " ");

const htmlTextLines = (html: string): string[] =>
  decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n"),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const sourceError = (detail: string): SportsWatchSourceError =>
  new SportsWatchSourceError(`${FOOTSTATS_SOURCE_NAME} est inexploitable : ${detail}`);

const teamIdPattern = /^[a-z0-9]{6,20}$/i;
const playerIdPattern = /^[a-z0-9]{6,20}$/i;

const requireTeamId = (value: string): string => {
  const teamId = value.trim();
  if (!teamIdPattern.test(teamId)) throw sourceError("l’identifiant d’équipe est invalide.");
  return teamId;
};

const safeFootstatsUrl = (value: string, base = FOOTSTATS_BASE_URL): URL => {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw sourceError("une URL publique est invalide.");
  }
  if (url.protocol !== "https:" || url.hostname !== FOOTSTATS_HOSTNAME) {
    throw sourceError("une URL quitte le domaine public autorisé.");
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    throw sourceError("une route interdite par robots.txt a été demandée.");
  }
  url.hash = "";
  url.search = "";
  return url;
};

const fetchBoundedHtml = async (
  urlValue: string,
  dependencies: FootballPublicDependencies,
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let url = safeFootstatsUrl(urlValue);
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await dependencies.fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": SPORTS_WATCH_USER_AGENT,
        },
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw sourceError("une redirection est absente ou trop longue.");
        }
        url = safeFootstatsUrl(location, url.toString());
        continue;
      }
      if (!response.ok) {
        throw new SportsWatchSourceError(
          `${FOOTSTATS_SOURCE_NAME} a refusé la lecture (HTTP ${response.status}).`,
          response.status,
        );
      }
      safeFootstatsUrl(response.url || url.toString());
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) throw sourceError("la réponse dépasse la taille autorisée.");
      const html = await response.text();
      if (new TextEncoder().encode(html).byteLength > MAX_RESPONSE_BYTES) {
        throw sourceError("la réponse dépasse la taille autorisée.");
      }
      return html;
    }
    throw sourceError("une redirection est trop longue.");
  } catch (error) {
    if (error instanceof SportsWatchSourceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw sourceError("la lecture a dépassé le délai autorisé.");
    }
    throw sourceError("l’accès technique a échoué.");
  } finally {
    clearTimeout(timeout);
  }
};

const metaContent = (html: string, attribute: "name" | "property", key: string): string | null => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const direct = html.match(
    new RegExp(`<meta[^>]+${attribute}=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
  );
  const reverse = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}=["']${escaped}["'][^>]*>`, "i"),
  );
  return decodeHtml(direct?.[1] ?? reverse?.[1] ?? "").trim() || null;
};

const leagueName = (html: string): string | null => {
  const leagueLink = html.match(
    /<a\b[^>]*href=["']\/(?:de|fr)\/leagues\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i,
  );
  return leagueLink ? htmlTextLines(leagueLink[1]).join(" ").trim() || null : null;
};

export const parseFootstatsRoster = (html: string): FootballPublicPlayer[] => {
  const players: FootballPublicPlayer[] = [];
  const anchors = html.matchAll(
    /<a\b[^>]*href=["']\/(?:de|fr)\/players\/([a-z0-9]+)\/["'][^>]*>([\s\S]*?)<\/a>/gi,
  );
  for (const match of anchors) {
    if (players.some((player) => player.id === match[1])) continue;
    const lines = htmlTextLines(match[2]);
    if (lines.length < 2 || !playerIdPattern.test(match[1])) continue;
    const shirtIndex = lines.findIndex((line) => /^\d{1,3}$/.test(line));
    const shirtNumber = shirtIndex >= 0 ? lines[shirtIndex] : null;
    const filtered = lines.filter((line, index) =>
      index !== shirtIndex && line.length > 1 && line !== "C");
    const position = filtered.at(-1) ?? null;
    const name = filtered.slice(0, -1).find((line) => /\s/.test(line))
      ?? filtered.at(-2)
      ?? "";
    if (!name) continue;
    players.push({
      id: match[1],
      name,
      shirtNumber,
      position,
      profileUrl: `${FOOTSTATS_BASE_URL}de/players/${match[1]}/`,
    });
    if (players.length > MAX_PLAYERS) throw sourceError("l’effectif dépasse le volume autorisé.");
  }
  return players;
};

const datePattern = /^\d{2}\.\d{2}\.\d{4}$/;
const timePattern = /^\d{2}:\d{2}$/;
const scorePattern = /^\d{1,2}$/;

const isoDate = (value: string): string | null => {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const result = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result
    ? null
    : result;
};

export const parseFootstatsMatches = (
  html: string,
  matchesUrl: string,
): FootballSourceMatch[] => {
  const lines = htmlTextLines(html);
  const matches: FootballSourceMatch[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!datePattern.test(lines[index])) continue;
    const date = isoDate(lines[index]);
    if (!date) continue;
    const nextDateOffset = lines.slice(index + 1).findIndex((line) => datePattern.test(line));
    const end = nextDateOffset < 0 ? Math.min(lines.length, index + 10) : index + 1 + nextDateOffset;
    const row = lines.slice(index + 1, end);
    const timeIndex = row.findIndex((line) => timePattern.test(line));
    if (timeIndex < 0 || row.length < timeIndex + 3) continue;
    const competition = timeIndex > 0 ? row.slice(0, timeIndex).join(" · ") : null;
    const firstTeam = row[timeIndex + 1];
    const secondTeam = row[timeIndex + 2];
    let scoreIndex = timeIndex + 3;
    if (row[scoreIndex] === "F") scoreIndex += 1;
    const firstScore = scorePattern.test(row[scoreIndex] ?? "") ? Number(row[scoreIndex]) : null;
    const secondScore = scorePattern.test(row[scoreIndex + 1] ?? "") ? Number(row[scoreIndex + 1]) : null;
    matches.push({
      source: "footstats",
      sourceUrl: matchesUrl,
      date,
      competition,
      firstTeam,
      secondTeam,
      firstScore,
      secondScore,
      lineupAvailable: false,
      playerNamed: false,
      starter: null,
      substitute: null,
      entered: null,
      entryMinute: null,
      exitMinute: null,
      goals: null,
      goalMinutes: [],
      yellowCards: null,
      redCards: null,
      cardMinutes: [],
      facts: [
        "Match d’équipe publié.",
        firstScore !== null && secondScore !== null ? "Score collectif publié." : "Score absent.",
        "Aucune feuille de match publique n’est disponible sur cette page.",
      ],
    });
    if (matches.length > MAX_MATCHES) throw sourceError("le calendrier dépasse le volume autorisé.");
  }
  return matches;
};

export const discoverFootstatsFootballTeam = async (
  footstatsTeamId: string,
  dependencies: Partial<FootballPublicDependencies> = {},
): Promise<FootballPublicTeamDiscovery> => {
  const teamId = requireTeamId(footstatsTeamId);
  const resolved: FootballPublicDependencies = {
    fetch,
    now: () => new Date(),
    ...dependencies,
  };
  const teamUrl = `${FOOTSTATS_BASE_URL}de/teams/${teamId}/`;
  const rosterUrl = `${teamUrl}players/`;
  const matchesUrl = `${teamUrl}matches/`;
  const [teamHtml, rosterHtml] = await Promise.all([
    fetchBoundedHtml(teamUrl, resolved),
    fetchBoundedHtml(rosterUrl, resolved),
  ]);
  const title = metaContent(teamHtml, "property", "og:title")
    ?? metaContent(teamHtml, "name", "description")
    ?? "";
  const titleMatch = title.match(/^(.+?)\s*[-–]\s*(?:Resultate|Tabelle|Kader|Footstats)/i);
  const teamName = titleMatch?.[1]?.trim()
    ?? htmlTextLines(teamHtml).find((line) => /^FC\s+/i.test(line))
    ?? "";
  const rosterTitle = metaContent(rosterHtml, "property", "og:title")
    ?? metaContent(rosterHtml, "name", "description")
    ?? "";
  const season = rosterTitle.match(/\b20\d{2}\/\d{2}\b/)?.[0] ?? "saison non publiée";
  const competition = leagueName(teamHtml)
    ?? htmlTextLines(teamHtml).find((line) =>
      /\b(?:liga|ligue)\b/i.test(line) && line.length <= 80)
    ?? "compétition non publiée";
  const players = parseFootstatsRoster(rosterHtml);
  if (!teamName || players.length === 0) {
    throw sourceError("le nom d’équipe ou l’effectif public est absent.");
  }
  return {
    footstatsTeamId: teamId,
    teamName,
    competition,
    season,
    teamUrl,
    rosterUrl,
    matchesUrl,
    players,
    discoveredAt: resolved.now().toISOString(),
    warnings: [
      "Footstats est une source publique tierce non officielle.",
      "L’effectif ne prouve aucune participation à un match.",
      AFF_ROBOTS_BLOCK_MESSAGE,
    ],
  };
};

const sameMatch = (left: FootballSourceMatch, right: FootballSourceMatch): boolean => {
  if (left.date !== right.date) return false;
  const leftTeams = [normalize(left.firstTeam), normalize(left.secondTeam)].sort();
  const rightTeams = [normalize(right.firstTeam), normalize(right.secondTeam)].sort();
  return leftTeams[0] === rightTeams[0] && leftTeams[1] === rightTeams[1];
};

const mergeMatch = (
  footstats: FootballSourceMatch | undefined,
  aff: FootballSourceMatch | undefined,
): FootballSourceMatch => {
  const primary = aff ?? footstats;
  if (!primary) throw new Error("Un match est requis.");
  return {
    ...primary,
    competition: aff?.competition ?? footstats?.competition ?? null,
    firstScore: aff?.firstScore ?? footstats?.firstScore ?? null,
    secondScore: aff?.secondScore ?? footstats?.secondScore ?? null,
    lineupAvailable: aff?.lineupAvailable ?? false,
    playerNamed: aff?.playerNamed ?? false,
    starter: aff?.starter ?? null,
    substitute: aff?.substitute ?? null,
    entered: aff?.entered ?? null,
    entryMinute: aff?.entryMinute ?? null,
    exitMinute: aff?.exitMinute ?? null,
    goals: aff?.goals ?? null,
    goalMinutes: aff?.goalMinutes ?? [],
    yellowCards: aff?.yellowCards ?? null,
    redCards: aff?.redCards ?? null,
    cardMinutes: aff?.cardMinutes ?? [],
    facts: [...(footstats?.facts ?? []), ...(aff?.facts ?? [])],
  };
};

const isParticipationProved = (match: FootballSourceMatch): boolean =>
  match.starter === true
  || match.entered === true
  || match.goals !== null && match.goals > 0
  || match.yellowCards !== null && match.yellowCards > 0
  || match.redCards !== null && match.redCards > 0;

const evidenceForMatch = (
  match: FootballSourceMatch,
  binding: FootballPublicBinding,
  footstats: FootballSourceMatch | undefined,
  aff: FootballSourceMatch | undefined,
): FootballCandidateEvidence => {
  const teamFirst = normalize(match.firstTeam) === normalize(binding.footstatsTeamName);
  const opponent = teamFirst ? match.secondTeam : match.firstTeam;
  const score = match.firstScore === null || match.secondScore === null
    ? null
    : `${match.firstScore}–${match.secondScore}`;
  const proofs: FootballCandidateEvidence["proofs"] = ["team_match"];
  if (match.lineupAvailable) proofs.push("lineup_available");
  if (match.playerNamed) proofs.push("player_named");
  if (match.starter === true) proofs.push("starter");
  if (match.substitute === true) proofs.push("substitute");
  if (match.entered === true) proofs.push("entered");
  if (match.goals !== null && match.goals > 0) proofs.push("goal");
  if (
    match.yellowCards !== null && match.yellowCards > 0
    || match.redCards !== null && match.redCards > 0
  ) proofs.push("card");
  return {
    mode: "football_public",
    matchKey: `${match.date}|${[normalize(match.firstTeam), normalize(match.secondTeam)].sort().join("|")}`,
    eventDate: match.date,
    publicReference: footstats?.sourceUrl ?? match.sourceUrl,
    competition: match.competition ?? binding.competition,
    team: binding.footstatsTeamName,
    opponent,
    score,
    footstatsTeamId: binding.footstatsTeamId,
    footstatsPlayerId: binding.footstatsPlayerId,
    affTeamId: binding.affTeamId,
    affPlayerId: binding.affPlayerId,
    lineupAvailable: match.lineupAvailable,
    playerNamed: match.playerNamed,
    starter: match.starter,
    substitute: match.substitute,
    entered: match.entered,
    entryMinute: match.entryMinute,
    exitMinute: match.exitMinute,
    goals: match.goals,
    goalMinutes: match.goalMinutes,
    yellowCards: match.yellowCards,
    redCards: match.redCards,
    cardMinutes: match.cardMinutes,
    participationProved: isParticipationProved(match),
    proofs,
    sourceFacts: [
      ...(footstats ? [{
        source: "footstats" as const,
        sourceName: FOOTSTATS_SOURCE_NAME,
        sourceUrl: footstats.sourceUrl,
        official: false,
        facts: footstats.facts,
      }] : []),
      ...(aff ? [{
        source: "aff" as const,
        sourceName: AFF_SOURCE_NAME,
        sourceUrl: aff.sourceUrl,
        official: true,
        facts: aff.facts,
      }] : []),
    ],
  };
};

const titleForEvidence = (
  athleteName: string,
  evidence: FootballCandidateEvidence,
): string => {
  if (evidence.goals !== null && evidence.goals > 0) {
    return `${athleteName} buteur avec ${evidence.team}`;
  }
  if (evidence.starter === true) return `${athleteName} titulaire face à ${evidence.opponent}`;
  if (evidence.entered === true) return `${athleteName} entré en jeu face à ${evidence.opponent}`;
  if (evidence.playerNamed) return `${athleteName} sur la feuille face à ${evidence.opponent}`;
  return `Match détecté — participation de ${athleteName} à confirmer`;
};

const excerptForEvidence = (
  athleteName: string,
  evidence: FootballCandidateEvidence,
  date: string,
): string => {
  const result = evidence.score
    ? `${evidence.team} et ${evidence.opponent} ont disputé un match au score publié de ${evidence.score}, le ${date}.`
    : `${evidence.team} et ${evidence.opponent} ont disputé un match le ${date}.`;
  if (!evidence.playerNamed) {
    return `${result} La participation de ${athleteName} n’est pas renseignée.`;
  }
  if (evidence.starter === true) return `${result} ${athleteName} était explicitement titulaire.`;
  if (evidence.entered === true) {
    return `${result} L’entrée en jeu de ${athleteName} est explicitement publiée.`;
  }
  if (evidence.substitute === true) {
    return `${result} ${athleteName} figure parmi les remplaçants, sans entrée en jeu prouvée.`;
  }
  return `${result} ${athleteName} figure sur la feuille, sans participation prouvée.`;
};

export const collectFootballPublicCandidates = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    binding: FootballPublicBinding;
    lookbackDays?: number;
    dependencies?: Partial<FootballPublicDependencies>;
  },
): Promise<FootballPublicCollectionResult> => {
  if (options.binding.status !== "verified") {
    throw sourceError("seul un rattachement vérifié peut être collecté.");
  }
  const dependencies: FootballPublicDependencies = {
    fetch,
    now: () => new Date(),
    ...options.dependencies,
  };
  const report: FootballCollectionReport = {
    sourcesQueried: [],
    matchesExamined: 0,
    lineupsFound: 0,
    namedPresenceFound: 0,
    candidatesProposed: 0,
    duplicates: 0,
    errors: [],
    partialCoverage: false,
  };
  let footstatsMatches: FootballSourceMatch[] = [];
  let affMatches: FootballSourceMatch[] = [];
  try {
    const matchesUrl = `${FOOTSTATS_BASE_URL}de/teams/${requireTeamId(options.binding.footstatsTeamId)}/matches/`;
    footstatsMatches = parseFootstatsMatches(
      await fetchBoundedHtml(matchesUrl, dependencies),
      matchesUrl,
    );
    report.sourcesQueried.push({
      source: "footstats",
      status: "available",
      detail: `${footstatsMatches.length} match(s) public(s) lu(s).`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lecture Footstats impossible.";
    report.sourcesQueried.push({ source: "footstats", status: "failed", detail: message });
    report.errors.push(message);
  }
  if (dependencies.collectAffMatches) {
    try {
      affMatches = await dependencies.collectAffMatches(options.binding);
      report.sourcesQueried.push({
        source: "aff",
        status: "available",
        detail: `${affMatches.length} match(s) fédéral(aux) lu(s).`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lecture AFF impossible.";
      report.sourcesQueried.push({ source: "aff", status: "failed", detail: message });
      report.errors.push(message);
    }
  } else {
    report.sourcesQueried.push({
      source: "aff",
      status: "unavailable",
      detail: AFF_ROBOTS_BLOCK_MESSAGE,
    });
    report.errors.push(AFF_ROBOTS_BLOCK_MESSAGE);
  }
  if (footstatsMatches.length === 0 && affMatches.length === 0) {
    throw sourceError(`aucune source n’est disponible. ${report.errors.join(" ")}`);
  }
  report.partialCoverage = report.sourcesQueried.some((source) => source.status !== "available");
  const allMatches: Array<{
    footstats?: FootballSourceMatch;
    aff?: FootballSourceMatch;
  }> = footstatsMatches.map((footstats) => ({
    footstats,
    aff: affMatches.find((aff) => sameMatch(footstats, aff)),
  }));
  for (const aff of affMatches) {
    if (!footstatsMatches.some((footstats) => sameMatch(footstats, aff))) allMatches.push({ aff });
  }
  const now = dependencies.now();
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - (options.lookbackDays ?? 30));
  const candidates: FootballPublicCollectionResult["candidates"] = [];
  for (const sources of allMatches) {
    const match = mergeMatch(sources.footstats, sources.aff);
    report.matchesExamined += 1;
    if (match.lineupAvailable) report.lineupsFound += 1;
    if (match.playerNamed) report.namedPresenceFound += 1;
    const eventDate = new Date(`${match.date}T00:00:00Z`);
    if (
      Number.isNaN(eventDate.getTime())
      || eventDate < cutoff
      || eventDate > now
      || match.firstScore === null
      || match.secondScore === null
    ) continue;
    const evidence = evidenceForMatch(match, options.binding, sources.footstats, sources.aff);
    const articleUrl = sources.aff?.sourceUrl ?? sources.footstats?.sourceUrl ?? FOOTSTATS_BASE_URL;
    const title = titleForEvidence(athlete.name, evidence);
    const excerpt = excerptForEvidence(athlete.name, evidence, match.date);
    candidates.push({
      sourceKey: FOOTBALL_PUBLIC_SOURCE_KEY,
      athlete,
      sourceName: sources.aff
        ? `${FOOTSTATS_SOURCE_NAME} + ${AFF_SOURCE_NAME}`
        : FOOTSTATS_SOURCE_NAME,
      sourceUrl: `${FOOTSTATS_BASE_URL}de/teams/${options.binding.footstatsTeamId}/`,
      articleUrl,
      title,
      excerpt,
      resultKind: evidence.participationProved ? "participation" : "collective_result",
      publicationDate: null,
      eventDateFrom: match.date,
      eventDateTo: match.date,
      collectedAt: now.toISOString(),
      attributionStatus: "matched",
      attributionEvidence: [
        `Rattachement vérifié à l’équipe ${options.binding.footstatsTeamName}.`,
        evidence.playerNamed
          ? "Présence nominative explicitement publiée."
          : "Aucune présence nominative publiée pour ce match.",
        ...evidence.sourceFacts.flatMap((source) => source.facts.map((fact) =>
          `${source.sourceName} : ${fact}`)),
      ],
      logicalKey: `${FOOTBALL_PUBLIC_SOURCE_KEY}|${evidence.matchKey}`,
      contentHash: sha256(JSON.stringify({
        title,
        excerpt,
        evidence,
      })),
      footballEvidence: evidence,
    });
  }
  report.candidatesProposed = candidates.length;
  return {
    candidates,
    scannedCount: allMatches.length,
    recentCount: candidates.length,
    report,
  };
};
