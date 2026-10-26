import { createHash } from "node:crypto";
import {
  SPORTS_WATCH_USER_AGENT,
  SportsWatchSourceError,
  type CollectedSportsWatchCandidate,
  type SportsWatchAthleteSnapshot,
} from "@/lib/sports-watch/bcbulle-collector";
import type {
  SafvOfficialTeam,
  SafvTeamVerification,
} from "@/types/sports-watch";

export const SAFV_SOURCE_KEY = "safv";
export const SAFV_SOURCE_NAME = "Swiss American Football Federation";
export const SAFV_BASE_URL = "https://www.safv.ch/";

const SOURCE_HOSTNAME = "www.safv.ch";
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 2;
const MAX_GAMES = 120;
const REQUEST_TIMEOUT_MS = 10_000;

type CollectorDependencies = {
  fetch: typeof fetch;
  now: () => Date;
};

type SafvTeam = {
  id: number;
  name: string;
  full_name?: string;
};

type SafvGame = {
  id: number;
  team1: SafvTeam;
  team2: SafvTeam;
  score1: number | null;
  score2: number | null;
  start_date: string;
  completed: boolean;
  cancelled: boolean;
  competition?: { id: number; name: string };
};

type SafvSeason = {
  id: number;
  name: string;
  current: boolean;
};

type SafvSchedule = {
  url: string;
  leagueId: string;
  competitionName: string;
  season: SafvSeason;
  games: SafvGame[];
};

export type SafvTeamConfig = SafvOfficialTeam;

export type SafvCollectionResult = {
  candidates: CollectedSportsWatchCandidate[];
  scannedCount: number;
  recentCount: number;
};

const normalize = (value: unknown): string => String(value ?? "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const sourceError = (detail: string): SportsWatchSourceError =>
  new SportsWatchSourceError(`La source ${SAFV_SOURCE_NAME} est inexploitable : ${detail}`);

const safeSourceUrl = (value: string, base = SAFV_BASE_URL): URL => {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw sourceError("un lien officiel est invalide.");
  }
  if (url.protocol !== "https:" || url.hostname !== SOURCE_HOSTNAME) {
    throw sourceError("un lien quitte le domaine officiel autorisé.");
  }
  url.hash = "";
  return url;
};

const readScheduleUrl = (value: string): { url: URL; leagueId: string } => {
  const url = safeSourceUrl(value);
  const match = url.pathname.match(/^\/spiele-366618v4\/leagues\/(\d+)\/?$/);
  if (!match || url.search) {
    throw sourceError("l’URL ne correspond pas à un calendrier de ligue SAFV.");
  }
  url.pathname = `/spiele-366618v4/leagues/${match[1]}`;
  return { url, leagueId: match[1] };
};

const fetchBoundedSchedule = async (
  scheduleUrl: string,
  dependencies: CollectorDependencies,
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let url = readScheduleUrl(scheduleUrl).url;
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
          throw sourceError("la redirection officielle est invalide ou trop longue.");
        }
        url = readScheduleUrl(safeSourceUrl(location, url.toString()).toString()).url;
        continue;
      }
      if (!response.ok) {
        throw new SportsWatchSourceError(
          `La source ${SAFV_SOURCE_NAME} a refusé la lecture (HTTP ${response.status}).`,
          response.status,
        );
      }
      readScheduleUrl(response.url || url.toString());
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw sourceError("la réponse dépasse la taille autorisée.");
      }
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
        throw sourceError("la réponse dépasse la taille autorisée.");
      }
      return body;
    }
    throw sourceError("la redirection officielle est trop longue.");
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

const readBalancedJson = (value: string, key: string): unknown => {
  const keyIndex = value.indexOf(`"${key}":`);
  if (keyIndex < 0) return null;
  const start = value.indexOf("[", keyIndex + key.length + 3);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") inString = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(value.slice(start, index + 1)) as unknown;
        } catch {
          throw sourceError(`les données ${key} ne sont pas un JSON valide.`);
        }
      }
    }
  }
  throw sourceError(`les données ${key} sont incomplètes.`);
};

const decodeFlightChunks = (html: string): string[] =>
  Array.from(html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/gi))
    .map((match) => {
      try {
        const value = JSON.parse(match[1]) as unknown;
        return Array.isArray(value) && typeof value[1] === "string" ? value[1] : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean);

const isTeam = (value: unknown): value is SafvTeam =>
  typeof value === "object"
  && value !== null
  && Number.isInteger((value as SafvTeam).id)
  && typeof (value as SafvTeam).name === "string";

const isGame = (value: unknown): value is SafvGame => {
  if (typeof value !== "object" || value === null) return false;
  const game = value as SafvGame;
  return Number.isInteger(game.id)
    && isTeam(game.team1)
    && isTeam(game.team2)
    && typeof game.start_date === "string"
    && typeof game.completed === "boolean"
    && typeof game.cancelled === "boolean";
};

const isSeason = (value: unknown): value is SafvSeason =>
  typeof value === "object"
  && value !== null
  && Number.isInteger((value as SafvSeason).id)
  && typeof (value as SafvSeason).name === "string"
  && typeof (value as SafvSeason).current === "boolean";

const parseSchedule = (html: string, scheduleUrl: string): SafvSchedule => {
  const { url, leagueId } = readScheduleUrl(scheduleUrl);
  const dataChunk = decodeFlightChunks(html).find((chunk) =>
    chunk.includes("\"games\":[") && chunk.includes("\"seasons\":["));
  if (!dataChunk) throw sourceError("les données du calendrier sont absentes.");
  const rawGames = readBalancedJson(dataChunk, "games");
  const rawSeasons = readBalancedJson(dataChunk, "seasons");
  if (!Array.isArray(rawGames) || !Array.isArray(rawSeasons)) {
    throw sourceError("le calendrier ou la saison est absent.");
  }
  const games = rawGames.filter(isGame).slice(0, MAX_GAMES);
  if (rawGames.length > MAX_GAMES) throw sourceError("le calendrier dépasse le volume autorisé.");
  const season = rawSeasons.filter(isSeason).find((item) => item.current);
  if (!season) throw sourceError("la saison courante n’est pas explicitement indiquée.");
  const competitionNames = new Set(
    games
      .filter((game) => String(game.competition?.id ?? "") === leagueId)
      .map((game) => game.competition?.name)
      .filter((name): name is string => Boolean(name)),
  );
  if (competitionNames.size !== 1) {
    throw sourceError("la compétition ne peut pas être identifiée sans ambiguïté.");
  }
  return {
    url: url.toString(),
    leagueId,
    competitionName: Array.from(competitionNames)[0],
    season,
    games,
  };
};

const compareClub = (
  athleteClub: string,
  team: SafvTeam,
): "matching" | "different" | "unknown" => {
  const club = normalize(athleteClub);
  if (!club) return "unknown";
  const teamValues = [team.name, team.full_name ?? ""].map(normalize).filter(Boolean);
  const clubTokens = new Set(club.split(" ").filter((token) => token.length >= 4));
  return teamValues.some((value) =>
    value.includes(club) || Array.from(clubTokens).some((token) => value.includes(token)))
    ? "matching"
    : "different";
};

const findTeam = (schedule: SafvSchedule, teamName: string): SafvTeam => {
  const requested = normalize(teamName);
  if (!requested) throw sourceError("saisissez le nom officiel de l’équipe.");
  const teams = new Map<number, SafvTeam>();
  for (const game of schedule.games) {
    teams.set(game.team1.id, game.team1);
    teams.set(game.team2.id, game.team2);
  }
  const matches = Array.from(teams.values()).filter((team) =>
    normalize(team.name) === requested || normalize(team.full_name) === requested);
  if (matches.length !== 1) {
    throw sourceError("l’équipe saisie ne peut pas être vérifiée sans ambiguïté dans ce calendrier.");
  }
  return matches[0];
};

export const verifySafvTeam = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    scheduleUrl: string;
    teamName: string;
    dependencies?: Partial<CollectorDependencies>;
  },
): Promise<SafvTeamVerification> => {
  const dependencies: CollectorDependencies = {
    fetch,
    now: () => new Date(),
    ...options.dependencies,
  };
  const html = await fetchBoundedSchedule(options.scheduleUrl, dependencies);
  const schedule = parseSchedule(html, options.scheduleUrl);
  const team = findTeam(schedule, options.teamName);
  const clubComparison = compareClub(athlete.club, team);
  return {
    athlete,
    officialTeam: {
      scheduleUrl: schedule.url,
      leagueId: schedule.leagueId,
      teamId: String(team.id),
      teamName: team.name,
      competitionName: schedule.competitionName,
      seasonId: String(schedule.season.id),
      seasonName: schedule.season.name,
    },
    clubComparison,
    evidence: [
      `Équipe officielle ${team.name} (${team.id}) trouvée dans le calendrier SAFV.`,
      `Compétition ${schedule.competitionName} (${schedule.leagueId}), saison courante ${schedule.season.name} (${schedule.season.id}).`,
      clubComparison === "matching"
        ? "Le club CRM concorde avec l’équipe officielle."
        : clubComparison === "different"
          ? "Le club CRM diffère de l’équipe officielle ; confirmation Admin requise."
          : "Le club CRM ne permet pas de comparaison.",
      "Ce rattachement établit seulement une veille collective ; aucune participation individuelle n’est vérifiée.",
    ],
    verifiedAt: dependencies.now().toISOString(),
  };
};

const isoDate = (value: string): string | null => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const subtractUtcDays = (date: Date, days: number): string => {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
};

export const collectSafvCandidates = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    team?: SafvTeamConfig;
    lookbackDays?: number;
    dependencies?: Partial<CollectorDependencies>;
  } = {},
): Promise<SafvCollectionResult> => {
  if (!options.team) throw sourceError("aucune équipe SAFV vérifiée n’a été fournie.");
  const team = options.team;
  const dependencies: CollectorDependencies = {
    fetch,
    now: () => new Date(),
    ...options.dependencies,
  };
  const html = await fetchBoundedSchedule(options.team.scheduleUrl, dependencies);
  const schedule = parseSchedule(html, options.team.scheduleUrl);
  if (
    schedule.leagueId !== team.leagueId
    || schedule.competitionName !== team.competitionName
  ) {
    throw sourceError("la ligue relue ne concorde pas avec le rattachement confirmé.");
  }
  const teamId = Number(team.teamId);
  const teamGames = schedule.games.filter((game) =>
    game.team1.id === teamId || game.team2.id === teamId);
  if (teamGames.length === 0) {
    throw sourceError("l’équipe confirmée est absente du calendrier courant.");
  }
  const now = dependencies.now();
  const today = now.toISOString().slice(0, 10);
  const cutoff = subtractUtcDays(now, options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS);
  const recent = teamGames.filter((game) => {
    const date = isoDate(game.start_date);
    return date
      && date >= cutoff
      && date <= today
      && game.completed
      && !game.cancelled
      && Number.isInteger(game.score1)
      && Number.isInteger(game.score2);
  });
  const collectedAt = now.toISOString();
  const candidates = recent.map((game): CollectedSportsWatchCandidate => {
    const date = isoDate(game.start_date)!;
    const excerpt = [
      "Résultat collectif — participation individuelle non vérifiée.",
      `Compétition : ${schedule.competitionName} — saison ${schedule.season.name}.`,
      `Équipes dans l’ordre officiel : ${game.team1.name} puis ${game.team2.name}.`,
      `Score final explicite : ${game.score1}-${game.score2}.`,
    ].join(" ");
    const articleUrl = safeSourceUrl(`/games/${game.id}`).toString();
    return {
      sourceKey: SAFV_SOURCE_KEY,
      athlete,
      sourceName: SAFV_SOURCE_NAME,
      sourceUrl: schedule.url,
      articleUrl,
      title: `${schedule.competitionName} ${schedule.season.name} — ${game.team1.name} vs ${game.team2.name}`,
      excerpt,
      resultKind: "collective_result",
      publicationDate: null,
      eventDateFrom: date,
      eventDateTo: date,
      collectedAt,
      attributionStatus: "matched",
      attributionEvidence: [
        `Équipe SAFV ${team.teamName} (${team.teamId}) rattachée explicitement à la fiche CRM.`,
        "Résultat collectif uniquement ; aucune présence, statistique ou performance individuelle n’est déduite.",
      ],
      logicalKey: `${SAFV_SOURCE_KEY}|${schedule.leagueId}|${game.id}`,
      contentHash: sha256(JSON.stringify({
        date,
        competitionName: schedule.competitionName,
        seasonName: schedule.season.name,
        team1: { id: game.team1.id, name: game.team1.name },
        team2: { id: game.team2.id, name: game.team2.name },
        score1: game.score1,
        score2: game.score2,
      })),
    };
  });
  return {
    candidates,
    scannedCount: teamGames.length,
    recentCount: recent.length,
  };
};

export const safvCollectorTestUtils = {
  parseSchedule,
  readBalancedJson,
};
