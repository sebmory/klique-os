import { createHash } from "node:crypto";
import type {
  SwissBasketballBindingVerification,
  SwissBasketballOfficialIdentity,
  SportsWatchCollectionObservation,
} from "@/types/sports-watch";
import type {
  CollectedSportsWatchCandidate,
  SportsWatchAthleteSnapshot,
} from "@/lib/sports-watch/bcbulle-collector";

export const SWISS_BASKETBALL_SOURCE_KEY = "swiss-basketball" as const;
export const SWISS_BASKETBALL_SOURCE_NAME = "Swiss Basketball — source officielle";
export const SWISS_BASKETBALL_BASE_URL = "https://swiss.basketball/";
const FEDERATION_ID = "12";
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_HOLDINGS = 8;
const MAX_RECENT_MATCHES = 24;
const MAX_VERIFICATION_MATCHES = 12;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

type CollectorDependencies = {
  fetch: typeof fetch;
  now: () => Date;
};

type LeagueHolding = {
  id: string;
  leagueId: string;
  leagueName: string;
  name: string;
  from: string;
  to: string;
};

type ScheduleTeam = {
  id: string;
  clubId: string;
  name: string;
  result: number | null;
};

type ScheduleMatch = {
  id: string;
  date: string;
  time: string;
  categoryName: string;
  matchDayName: string;
  homeTeam: ScheduleTeam;
  awayTeam: ScheduleTeam;
};

type GamePlayer = {
  playerId: string;
  playerName: string;
  firstName: string;
  lastName: string;
  number: string | null;
  points: number | null;
  starter: boolean | null;
};

type GameOverview = {
  gameId: string;
  gameNumber: string | null;
  date: string;
  homeTeam: ScheduleTeam;
  awayTeam: ScheduleTeam;
  homePlayers: GamePlayer[];
  awayPlayers: GamePlayer[];
};

export type SwissBasketballCollectionResult = {
  candidates: CollectedSportsWatchCandidate[];
  observations: SportsWatchCollectionObservation[];
  scannedCount: number;
  recentCount: number;
};

export class SwissBasketballSourceError extends Error {
  constructor(message: string) {
    super(`Swiss Basketball : ${message}`);
    this.name = "SwissBasketballSourceError";
  }
}

const sourceError = (message: string): SwissBasketballSourceError =>
  new SwissBasketballSourceError(message);

const normalize = (value: unknown): string => String(value ?? "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const requireNumericId = (value: string, label: string): string => {
  const id = value.trim();
  if (!/^\d+$/.test(id)) throw sourceError(`${label} invalide.`);
  return id;
};

const decodeXml = (value: string): string => value
  .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
  .replace(/&quot;/g, "\"")
  .replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");

const attributes = (value: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const match of value.matchAll(/([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
    result[match[1]] = decodeXml(match[2]);
  }
  return result;
};

const nullableInteger = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === "") return null;
  if (!/^-?\d+$/.test(value.trim())) return null;
  return Number.parseInt(value, 10);
};

const nullableBoolean = (value: string | undefined): boolean | null => {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
};

const fetchXml = async (url: string, dependencies: CollectorDependencies): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await dependencies.fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.1" },
      signal: controller.signal,
    });
    if (!response.ok) throw sourceError(`la source a répondu HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_RESPONSE_BYTES) throw sourceError("la réponse dépasse la taille autorisée.");
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
      throw sourceError("la réponse dépasse la taille autorisée.");
    }
    if (!body.includes("<basketplan")) throw sourceError("la réponse XML publique est invalide.");
    return body;
  } catch (error) {
    if (error instanceof SwissBasketballSourceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw sourceError("la source n’a pas répondu dans le délai autorisé.");
    }
    throw sourceError(error instanceof Error ? error.message : "la lecture de la source a échoué.");
  } finally {
    clearTimeout(timer);
  }
};

const holdingUrl = (seasonId: string, leagueId: string): string =>
  `${SWISS_BASKETBALL_BASE_URL}basketplan/findAllLeagueHoldings.do?lang=fr&xmlView=rss&leagueId=${encodeURIComponent(leagueId)}&federationId=${FEDERATION_ID}&seasonId=${encodeURIComponent(seasonId)}`;

const scheduleXmlUrl = (leagueId: string, holdingId: string): string =>
  `${SWISS_BASKETBALL_BASE_URL}basketplan/showLeagueSchedule.do?lang=fr&xmlView=rss&leagueId=${encodeURIComponent(leagueId)}&leagueHoldingId=${encodeURIComponent(holdingId)}&daysBack=2500&daysFuture=2250&totalGames=200&resultType=big`;

const gameOverviewUrl = (gameId: string): string =>
  `${SWISS_BASKETBALL_BASE_URL}basketplan/showGameOverview.do?lang=fr&xmlView=rss&gameId=${encodeURIComponent(gameId)}`;

const publicGameUrl = (gameId: string): string =>
  gameOverviewUrl(gameId);

const parseHoldings = (xml: string): LeagueHolding[] => [...xml.matchAll(/<LeagueHoldingRSS\b([^>]*)>/g)]
  .map((match) => attributes(match[1]))
  .filter((item) => item.id && item.leagueId && item.leagueName && item.from && item.to)
  .map((item) => ({
    id: item.id,
    leagueId: item.leagueId,
    leagueName: item.leagueName,
    name: item.name ?? "",
    from: item.from,
    to: item.to,
  }));

const parseTeam = (block: string, tagName: "homeTeam" | "guestTeam"): ScheduleTeam | null => {
  const match = block.match(new RegExp(`<${tagName}\\b([^>]*)\\/?`));
  if (!match) return null;
  const item = attributes(match[1]);
  if (!item.id || !item.clubId || !item.name) return null;
  return {
    id: item.id,
    clubId: item.clubId,
    name: item.name,
    result: nullableInteger(item.result),
  };
};

const parseSchedule = (xml: string): ScheduleMatch[] => {
  const matches: ScheduleMatch[] = [];
  for (const match of xml.matchAll(/<GameRSS\b([^>]*)>([\s\S]*?)<\/GameRSS>/g)) {
    const item = attributes(match[1]);
    const homeTeam = parseTeam(match[2], "homeTeam");
    const awayTeam = parseTeam(match[2], "guestTeam");
    if (!item.id || !item.date || !item.time || !homeTeam || !awayTeam) continue;
    matches.push({
      id: item.id,
      date: item.date,
      time: item.time,
      categoryName: item.categoryName ?? "",
      matchDayName: item.matchDayName ?? "",
      homeTeam,
      awayTeam,
    });
  }
  return matches;
};

const parsePlayers = (xml: string, containerName: "homeTeamRows" | "guestTeamRows"): GamePlayer[] => {
  const container = xml.match(new RegExp(`<${containerName}\\b[^>]*>([\\s\\S]*?)<\\/${containerName}>`));
  if (!container) return [];
  return [...container[1].matchAll(/<PersonGameRow\b([^>]*)\/?>/g)]
    .map((match) => attributes(match[1]))
    .filter((item) => item.playerId && item.playerName)
    .map((item) => ({
      playerId: item.playerId,
      playerName: item.playerName,
      firstName: item.playerFirstName ?? "",
      lastName: item.playerLastName ?? "",
      number: item.playerNrThisGame?.trim() || item.playerNr?.trim() || null,
      points: nullableInteger(item.points),
      starter: nullableBoolean(item.isStartLineup),
    }));
};

const parseOverview = (xml: string): GameOverview => {
  const match = xml.match(/<GameOverView\b([^>]*)>/);
  if (!match) throw sourceError("la feuille officielle ne contient pas de match exploitable.");
  const item = attributes(match[1]);
  const required = [
    item.gameId,
    item.gameDate,
    item.homeTeamId,
    item.homeClubId,
    item.homeTeamName,
    item.guestTeamId,
    item.guestClubId,
    item.guestTeamName,
  ];
  if (required.some((value) => !value)) {
    throw sourceError("l’identité des équipes de la feuille est incomplète.");
  }
  return {
    gameId: item.gameId,
    gameNumber: item.gameStr?.trim() || null,
    date: item.gameDate.slice(0, 10),
    homeTeam: {
      id: item.homeTeamId,
      clubId: item.homeClubId,
      name: item.homeTeamName,
      result: nullableInteger(item.homeResult),
    },
    awayTeam: {
      id: item.guestTeamId,
      clubId: item.guestClubId,
      name: item.guestTeamName,
      result: nullableInteger(item.guestResult),
    },
    homePlayers: parsePlayers(xml, "homeTeamRows"),
    awayPlayers: parsePlayers(xml, "guestTeamRows"),
  };
};

const seasonName = (holdings: LeagueHolding[]): string => {
  const years = holdings.flatMap((holding) => [holding.from.slice(0, 4), holding.to.slice(0, 4)])
    .filter((year) => /^\d{4}$/.test(year));
  if (years.length === 0) return "saison inconnue";
  return `${years.sort()[0]}-${years.sort().at(-1)}`;
};

const findUniquePlayerByName = (players: GamePlayer[], athleteName: string): GamePlayer | null => {
  const requested = normalize(athleteName);
  const matches = players.filter((player) =>
    normalize(`${player.firstName} ${player.lastName}`) === requested
    || normalize(player.playerName) === requested);
  const ids = new Set(matches.map((player) => player.playerId));
  if (ids.size > 1) throw sourceError("plusieurs identifiants joueur correspondent au nom CRM.");
  return matches[0] ?? null;
};

const targetSide = (
  match: Pick<ScheduleMatch | GameOverview, "homeTeam" | "awayTeam">,
  teamId: string,
): "home" | "away" | null => {
  const sides = [
    match.homeTeam.id === teamId ? "home" as const : null,
    match.awayTeam.id === teamId ? "away" as const : null,
  ].filter((value): value is "home" | "away" => value !== null);
  return sides.length === 1 ? sides[0] : null;
};

const readHoldingsAndSchedules = async (
  seasonId: string,
  leagueId: string,
  dependencies: CollectorDependencies,
): Promise<{ holdings: LeagueHolding[]; matches: ScheduleMatch[] }> => {
  const holdings = parseHoldings(await fetchXml(holdingUrl(seasonId, leagueId), dependencies))
    .filter((holding) => holding.leagueId === leagueId)
    .slice(0, MAX_HOLDINGS);
  if (holdings.length === 0) throw sourceError("aucune phase publique ne correspond à cette saison et cette ligue.");
  const byId = new Map<string, ScheduleMatch>();
  for (const holding of holdings) {
    const matches = parseSchedule(await fetchXml(scheduleXmlUrl(leagueId, holding.id), dependencies));
    for (const match of matches) byId.set(match.id, match);
  }
  return { holdings, matches: [...byId.values()] };
};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const buildCandidate = (
  athlete: SportsWatchAthleteSnapshot,
  identity: SwissBasketballOfficialIdentity,
  match: ScheduleMatch,
  overview: GameOverview,
  player: GamePlayer,
  collectedAt: string,
): CollectedSportsWatchCandidate => {
  const homeScore = overview.homeTeam.result;
  const awayScore = overview.awayTeam.result;
  if (homeScore === null || awayScore === null) {
    throw sourceError("le résultat collectif terminé est incomplet.");
  }
  const participationEstablished = player.points !== null && player.points > 0 || player.starter === true;
  const statistics = [
    player.points === null ? null : `PTS ${player.points}`,
  ].filter((value): value is string => value !== null);
  const excerpt = [
    "Source : Swiss Basketball — source officielle.",
    `Compétition : ${identity.leagueName} · ${identity.seasonName}.`,
    `Équipe : ${identity.teamName}.`,
    `Match : ${overview.homeTeam.name} ${homeScore}–${awayScore} ${overview.awayTeam.name}.`,
    `Date : ${overview.date}.`,
    `Présence nominative : ${player.playerName}, identifiant joueur ${player.playerId}${player.number ? `, numéro ${player.number}` : ""}.`,
    `Titularisation : ${player.starter === null ? "non renseignée" : player.starter ? "oui" : "non"}.`,
    participationEstablished
      ? "Participation établie par une donnée individuelle explicite."
      : "Participation non établie par la seule présence sur la feuille.",
    statistics.length > 0
      ? `Statistiques individuelles explicitement présentes : ${statistics.join(" · ")}.`
      : "Aucune statistique individuelle chiffrée explicite n’est présente.",
    "Minutes et autres statistiques absentes : aucune valeur n’est déduite.",
  ].join(" ");
  return {
    sourceKey: SWISS_BASKETBALL_SOURCE_KEY,
    athlete,
    sourceName: SWISS_BASKETBALL_SOURCE_NAME,
    sourceUrl: identity.scheduleUrl,
    articleUrl: publicGameUrl(match.id),
    title: `${overview.homeTeam.name} ${homeScore}–${awayScore} ${overview.awayTeam.name} — ${player.playerName}`,
    excerpt,
    resultKind: participationEstablished ? "individual_result" : "participation",
    publicationDate: null,
    eventDateFrom: overview.date,
    eventDateTo: overview.date,
    collectedAt,
    attributionStatus: "matched",
    attributionEvidence: [
      `Rattachement Admin : ${identity.teamName} (équipe ${identity.teamId}), ${identity.leagueName}, ${identity.seasonName}.`,
      `Identifiant joueur officiel ${player.playerId} relu dans la composition de l’équipe ${identity.teamId}.`,
      `Match officiel ${match.id}${overview.gameNumber ? ` (${overview.gameNumber})` : ""}.`,
      "Résultat collectif, présence, titularisation et statistiques individuelles sont conservés séparément.",
    ],
    logicalKey: [
      SWISS_BASKETBALL_SOURCE_KEY,
      identity.seasonId,
      identity.leagueId,
      identity.teamId,
      match.id,
      player.playerId,
    ].join("|"),
    contentHash: sha256(JSON.stringify({
      gameId: match.id,
      leagueId: identity.leagueId,
      teamId: identity.teamId,
      playerId: player.playerId,
      homeTeam: overview.homeTeam,
      awayTeam: overview.awayTeam,
      points: player.points,
      starter: player.starter,
    })),
  };
};

export const verifySwissBasketballBinding = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    seasonId: string;
    leagueId: string;
    teamId: string;
    dependencies?: Partial<CollectorDependencies>;
  },
): Promise<SwissBasketballBindingVerification> => {
  const dependencies: CollectorDependencies = {
    fetch,
    now: () => new Date(),
    ...options.dependencies,
  };
  const seasonId = requireNumericId(options.seasonId, "identifiant de saison");
  const leagueId = requireNumericId(options.leagueId, "identifiant de ligue");
  const teamId = requireNumericId(options.teamId, "identifiant d’équipe");
  const { holdings, matches } = await readHoldingsAndSchedules(seasonId, leagueId, dependencies);
  const teamMatches = matches.filter((match) => targetSide(match, teamId) !== null);
  if (teamMatches.length === 0) throw sourceError("l’équipe n’apparaît dans aucun match de cette compétition.");
  const teamSnapshots = teamMatches.flatMap((match) => [match.homeTeam, match.awayTeam])
    .filter((team) => team.id === teamId);
  const teamNames = new Set(teamSnapshots.map((team) => team.name));
  const clubIds = new Set(teamSnapshots.map((team) => team.clubId));
  if (teamNames.size !== 1 || clubIds.size !== 1) {
    throw sourceError("l’identité officielle de l’équipe varie dans le calendrier.");
  }
  const finished = teamMatches
    .filter((match) => match.homeTeam.result !== null && match.awayTeam.result !== null)
    .sort((left, right) => `${right.date}T${right.time}`.localeCompare(`${left.date}T${left.time}`))
    .slice(0, MAX_VERIFICATION_MATCHES);
  let verifiedPlayer: GamePlayer | null = null;
  let verificationGameId: string | null = null;
  for (const match of finished) {
    const overview = parseOverview(await fetchXml(gameOverviewUrl(match.id), dependencies));
    if (overview.gameId !== match.id) throw sourceError("la feuille relue ne correspond pas au match demandé.");
    const side = targetSide(overview, teamId);
    if (!side) throw sourceError(`l’équipe ${teamId} est ambiguë dans la feuille ${match.id}.`);
    const player = findUniquePlayerByName(
      side === "home" ? overview.homePlayers : overview.awayPlayers,
      athlete.name,
    );
    if (!player) continue;
    verifiedPlayer = player;
    verificationGameId = match.id;
    break;
  }
  if (!verifiedPlayer || !verificationGameId) {
    throw sourceError("le nom complet CRM n’apparaît sans ambiguïté dans aucune composition récente de cette équipe.");
  }
  const team = teamSnapshots[0];
  const leagueNames = new Set(holdings.map((holding) => holding.leagueName));
  if (leagueNames.size !== 1) throw sourceError("le nom officiel de la ligue varie entre les phases.");
  const resolvedSeasonName = seasonName(holdings);
  return {
    athlete,
    officialIdentity: {
      scheduleUrl: holdingUrl(seasonId, leagueId),
      federationId: FEDERATION_ID,
      seasonId,
      seasonName: resolvedSeasonName,
      leagueId,
      leagueName: holdings[0].leagueName,
      teamId,
      teamName: team.name,
      clubId: team.clubId,
      playerId: verifiedPlayer.playerId,
      playerName: athlete.name,
    },
    evidence: [
      `${holdings.length} phase${holdings.length === 1 ? "" : "s"} publique${holdings.length === 1 ? "" : "s"} découverte${holdings.length === 1 ? "" : "s"} pour ${holdings[0].leagueName}.`,
      `Équipe officielle ${team.name} : identifiant ${teamId}, club ${team.clubId}.`,
      `Le nom CRM ${athlete.name} correspond au joueur ${verifiedPlayer.playerId} dans la feuille officielle ${verificationGameId}.`,
      "La confirmation Admin n’attribue aucune participation au-delà des données explicitement publiées.",
    ],
    verifiedAt: dependencies.now().toISOString(),
  };
};

export const collectSwissBasketballCandidates = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    identity?: SwissBasketballOfficialIdentity;
    lookbackDays?: number;
    dependencies?: Partial<CollectorDependencies>;
  } = {},
): Promise<SwissBasketballCollectionResult> => {
  if (!options.identity) throw sourceError("aucun rattachement Swiss Basketball confirmé n’a été fourni.");
  const identity = options.identity;
  const dependencies: CollectorDependencies = {
    fetch,
    now: () => new Date(),
    ...options.dependencies,
  };
  const { holdings, matches } = await readHoldingsAndSchedules(
    identity.seasonId,
    identity.leagueId,
    dependencies,
  );
  if (holdings.some((holding) => holding.leagueName !== identity.leagueName)) {
    throw sourceError("la ligue relue ne concorde pas avec le rattachement confirmé.");
  }
  const now = dependencies.now();
  const cutoffDate = new Date(now);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - (options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS));
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const recent = matches
    .filter((match) =>
      targetSide(match, identity.teamId) !== null
      && match.date >= cutoff
      && match.date <= today
      && match.homeTeam.result !== null
      && match.awayTeam.result !== null)
    .sort((left, right) => `${right.date}T${right.time}`.localeCompare(`${left.date}T${left.time}`))
    .slice(0, MAX_RECENT_MATCHES);
  const candidates: CollectedSportsWatchCandidate[] = [];
  const observations: SportsWatchCollectionObservation[] = [];
  const collectedAt = now.toISOString();
  for (const match of recent) {
    const url = publicGameUrl(match.id);
    try {
      const overview = parseOverview(await fetchXml(gameOverviewUrl(match.id), dependencies));
      if (overview.gameId !== match.id || overview.date !== match.date) {
        throw sourceError("la feuille ne correspond pas au match du calendrier.");
      }
      const side = targetSide(overview, identity.teamId);
      if (!side) throw sourceError("l’équipe rattachée est absente ou ambiguë dans la feuille.");
      const players = side === "home" ? overview.homePlayers : overview.awayPlayers;
      const byId = players.filter((player) => player.playerId === identity.playerId);
      if (byId.length > 1) throw sourceError("l’identifiant joueur apparaît plusieurs fois dans la composition.");
      const player = byId[0] ?? findUniquePlayerByName(players, identity.playerName);
      if (!player) {
        observations.push({
          matchUrl: url,
          title: `${match.homeTeam.name} – ${match.awayTeam.name}`,
          eventDate: match.date,
          status: "player_absent",
        });
        continue;
      }
      if (player.playerId !== identity.playerId) {
        throw sourceError("le nom correspond mais l’identifiant joueur diffère du rattachement confirmé.");
      }
      const participationEstablished = player.points !== null && player.points > 0 || player.starter === true;
      observations.push({
        matchUrl: url,
        title: `${match.homeTeam.name} – ${match.awayTeam.name}`,
        eventDate: match.date,
        status: participationEstablished
          ? "participation_explicit"
          : "player_listed_without_participation",
      });
      candidates.push(buildCandidate(athlete, identity, match, overview, player, collectedAt));
    } catch (error) {
      observations.push({
        matchUrl: url,
        title: `${match.homeTeam.name} – ${match.awayTeam.name}`,
        eventDate: match.date,
        status: "sheet_absent",
        warning: `${error instanceof Error ? error.message : "Feuille officielle inexploitable."} URL : ${url}`,
      });
    }
  }
  return {
    candidates,
    observations,
    scannedCount: matches.length,
    recentCount: recent.length,
  };
};

export const swissBasketballCollectorTestUtils = {
  parseHoldings,
  parseOverview,
  parseSchedule,
};
