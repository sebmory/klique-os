import { createHash } from "node:crypto";
import {
  SPORTS_WATCH_USER_AGENT,
  SportsWatchSourceError,
  type CollectedSportsWatchCandidate,
  type SportsWatchAthleteSnapshot,
} from "@/lib/sports-watch/bcbulle-collector";
import type {
  BeBasketBindingVerification,
  BeBasketOfficialIdentity,
  SportsWatchCollectionObservation,
} from "@/types/sports-watch";

export const BEBASKET_SOURCE_KEY = "bebasket";
export const BEBASKET_SOURCE_NAME = "BeBasket — source tierce";
export const BEBASKET_BASE_URL = "https://www.bebasket.fr/";

const SOURCE_HOSTNAME = "www.bebasket.fr";
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 2;
const MAX_CALENDAR_MATCHES = 80;
const MAX_RECENT_MATCHES = 16;
const REQUEST_TIMEOUT_MS = 10_000;

type CollectorDependencies = {
  fetch: typeof fetch;
  now: () => Date;
};

type CalendarMatch = {
  id: string;
  url: string;
  title: string;
  approximateDate: string;
};

type SportsEvent = {
  name: string;
  description: string | null;
  startDate: string;
};

type PlayerStatistics = {
  player: {
    firstname: string;
    lastname: string;
    slug: string | null;
  };
  venue: "home" | "away" | null;
  timePlayed: number | null;
  points: number | null;
  twoPointersMade: number | null;
  twoPointersAttempted: number | null;
  threePointersMade: number | null;
  threePointersAttempted: number | null;
  freeThrowsMade: number | null;
  freeThrowsAttempted: number | null;
  fieldGoalsMade: number | null;
  fieldGoalsAttempted: number | null;
  fouls: number | null;
  foulsOn: number | null;
  reboundsOffensive: number | null;
  reboundsDefensive: number | null;
  rebounds: number | null;
  steals: number | null;
  turnovers: number | null;
  blocks: number | null;
  blocksAgainst: number | null;
  assists: number | null;
  plusMinus: number | null;
  isStarter: boolean | null;
  efficiency: number | null;
  pir: number | null;
  pie: number | null;
  usagePercentage: number | null;
  possessions: number | null;
};

type ParsedMatch = {
  event: SportsEvent;
  playerStatistics: PlayerStatistics[];
};

export type BeBasketCollectionResult = {
  candidates: CollectedSportsWatchCandidate[];
  observations: SportsWatchCollectionObservation[];
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
  new SportsWatchSourceError(`La source ${BEBASKET_SOURCE_NAME} est inexploitable : ${detail}`);

const safeSourceUrl = (value: string, base = BEBASKET_BASE_URL): URL => {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw sourceError("un lien est invalide.");
  }
  if (url.protocol !== "https:" || url.hostname !== SOURCE_HOSTNAME) {
    throw sourceError("un lien quitte le domaine BeBasket autorisé.");
  }
  url.hash = "";
  return url;
};

const readCalendarUrl = (value: string): { url: URL; teamSlug: string } => {
  const url = safeSourceUrl(value);
  const match = url.pathname.match(/^\/equipe\/([a-z0-9-]+)\/calendrier\/?$/);
  if (!match || url.search) {
    throw sourceError("l’URL ne correspond pas à un calendrier d’équipe BeBasket.");
  }
  url.pathname = `/equipe/${match[1]}/calendrier`;
  return { url, teamSlug: match[1] };
};

const readMatchUrl = (value: string): { url: URL; matchId: string } => {
  const url = safeSourceUrl(value);
  const match = url.pathname.match(/^\/match\/([0-9a-f-]{36})\/?$/i);
  if (!match || url.search) throw sourceError("un lien de match BeBasket est invalide.");
  url.pathname = `/match/${match[1]}`;
  return { url, matchId: match[1].toLowerCase() };
};

const fetchBoundedHtml = async (
  inputUrl: string,
  dependencies: CollectorDependencies,
  validateUrl: (value: string) => URL,
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let url = validateUrl(inputUrl);
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
          throw sourceError("une redirection est invalide ou trop longue.");
        }
        url = validateUrl(safeSourceUrl(location, url.toString()).toString());
        continue;
      }
      if (!response.ok) {
        throw new SportsWatchSourceError(
          `${BEBASKET_SOURCE_NAME} a refusé la lecture (HTTP ${response.status}).`,
          response.status,
        );
      }
      validateUrl(response.url || url.toString());
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) throw sourceError("une réponse dépasse la taille autorisée.");
      const html = await response.text();
      if (new TextEncoder().encode(html).byteLength > MAX_RESPONSE_BYTES) {
        throw sourceError("une réponse dépasse la taille autorisée.");
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

const fetchCalendar = (
  calendarUrl: string,
  dependencies: CollectorDependencies,
): Promise<string> => fetchBoundedHtml(
  calendarUrl,
  dependencies,
  (value) => readCalendarUrl(value).url,
);

const fetchMatch = (
  matchUrl: string,
  dependencies: CollectorDependencies,
): Promise<string> => fetchBoundedHtml(
  matchUrl,
  dependencies,
  (value) => readMatchUrl(value).url,
);

const decodeHtml = (value: string): string => value
  .replace(/&quot;/gi, "\"")
  .replace(/&#0?39;|&apos;/gi, "'")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

const stripTags = (value: string): string => decodeHtml(value)
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const readAttribute = (tag: string, name: string): string | null => {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2]).trim() : null;
};

const closestCalendarDate = (day: number, month: number, now: Date): string | null => {
  const candidates = [-1, 0, 1].map((offset) =>
    new Date(Date.UTC(now.getUTCFullYear() + offset, month - 1, day)));
  const valid = candidates.filter((date) =>
    date.getUTCDate() === day && date.getUTCMonth() === month - 1);
  if (valid.length === 0) return null;
  valid.sort((left, right) =>
    Math.abs(left.getTime() - now.getTime()) - Math.abs(right.getTime() - now.getTime()));
  return valid[0].toISOString().slice(0, 10);
};

const parseCalendar = (html: string, now: Date): CalendarMatch[] => {
  const matches = new Map<string, CalendarMatch>();
  for (const anchor of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const href = readAttribute(anchor[0], "href");
    if (!href?.startsWith("/match/")) continue;
    const { url, matchId } = readMatchUrl(href);
    if (matches.has(matchId)) continue;
    const text = stripTags(anchor[0]);
    const dateMatch = text.match(/\b(\d{2})\/(\d{2})\b/);
    const title = readAttribute(anchor[0], "title");
    if (!dateMatch || !title) continue;
    const approximateDate = closestCalendarDate(Number(dateMatch[1]), Number(dateMatch[2]), now);
    if (!approximateDate) continue;
    matches.set(matchId, {
      id: matchId,
      url: url.toString(),
      title,
      approximateDate,
    });
    if (matches.size > MAX_CALENDAR_MATCHES) {
      throw sourceError("le calendrier dépasse le volume autorisé.");
    }
  }
  if (matches.size === 0) throw sourceError("aucun lien de match n’est découvrable dans le calendrier.");
  return Array.from(matches.values());
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

const readBalancedObject = (value: string, start: number): string | null => {
  if (value[start] !== "{") return null;
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
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const nullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const nullableBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const parseEvent = (chunks: string[]): SportsEvent | null => {
  for (const chunk of chunks) {
    const marker = chunk.indexOf("{\"@context\":\"https://schema.org\",\"@type\":\"SportsEvent\"");
    if (marker < 0) continue;
    const encoded = readBalancedObject(chunk, marker);
    if (!encoded) continue;
    try {
      const value = JSON.parse(encoded) as unknown;
      if (
        isRecord(value)
        && typeof value.name === "string"
        && typeof value.startDate === "string"
      ) {
        return {
          name: value.name,
          description: typeof value.description === "string" ? value.description : null,
          startDate: value.startDate,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
};

const parsePlayerStatistics = (chunks: string[]): PlayerStatistics[] => {
  const statistics: PlayerStatistics[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    for (const match of chunk.matchAll(/\{"id":"[^"]+","player":\{/g)) {
      const encoded = readBalancedObject(chunk, match.index);
      if (!encoded) continue;
      try {
        const value = JSON.parse(encoded) as unknown;
        if (!isRecord(value) || !isRecord(value.player)) continue;
        const firstname = value.player.firstname;
        const lastname = value.player.lastname;
        if (typeof firstname !== "string" || typeof lastname !== "string") continue;
        const key = `${normalize(firstname)}|${normalize(lastname)}|${String(value.venue ?? "")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        statistics.push({
          player: {
            firstname,
            lastname,
            slug: typeof value.player.slug === "string" ? value.player.slug : null,
          },
          venue: value.venue === "home" || value.venue === "away" ? value.venue : null,
          timePlayed: nullableNumber(value.timePlayed),
          points: nullableNumber(value.points),
          twoPointersMade: nullableNumber(value.twoPointersMade),
          twoPointersAttempted: nullableNumber(value.twoPointersAttempted),
          threePointersMade: nullableNumber(value.threePointersMade),
          threePointersAttempted: nullableNumber(value.threePointersAttempted),
          freeThrowsMade: nullableNumber(value.freeThrowsMade),
          freeThrowsAttempted: nullableNumber(value.freeThrowsAttempted),
          fieldGoalsMade: nullableNumber(value.fieldGoalsMade),
          fieldGoalsAttempted: nullableNumber(value.fieldGoalsAttempted),
          fouls: nullableNumber(value.fouls),
          foulsOn: nullableNumber(value.foulsOn),
          reboundsOffensive: nullableNumber(value.reboundsOffensive),
          reboundsDefensive: nullableNumber(value.reboundsDefensive),
          rebounds: nullableNumber(value.rebounds),
          steals: nullableNumber(value.steals),
          turnovers: nullableNumber(value.turnovers),
          blocks: nullableNumber(value.blocks),
          blocksAgainst: nullableNumber(value.blocksAgainst),
          assists: nullableNumber(value.assists),
          plusMinus: nullableNumber(value.plusMinus),
          isStarter: nullableBoolean(value.isStarter),
          efficiency: nullableNumber(value.efficiency),
          pir: nullableNumber(value.pir),
          pie: nullableNumber(value.pie),
          usagePercentage: nullableNumber(value.usagePercentage),
          possessions: nullableNumber(value.possessions),
        });
      } catch {
        continue;
      }
    }
  }
  return statistics;
};

const parseMatch = (html: string): ParsedMatch => {
  const chunks = decodeFlightChunks(html);
  const event = parseEvent(chunks);
  if (!event) throw sourceError("les métadonnées factuelles d’un match sont absentes.");
  return {
    event,
    playerStatistics: parsePlayerStatistics(chunks),
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

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};

const pair = (made: number | null, attempted: number | null): string | null =>
  made === null || attempted === null ? null : `${made}/${attempted}`;

const explicitStatistics = (statistics: PlayerStatistics): Array<[string, string]> => {
  const values: Array<[string, string | null]> = [
    ["MIN", statistics.timePlayed === null ? null : formatDuration(statistics.timePlayed)],
    ["PTS", statistics.points === null ? null : String(statistics.points)],
    ["TIRS", pair(statistics.fieldGoalsMade, statistics.fieldGoalsAttempted)],
    ["2PTS", pair(statistics.twoPointersMade, statistics.twoPointersAttempted)],
    ["3PTS", pair(statistics.threePointersMade, statistics.threePointersAttempted)],
    ["LF", pair(statistics.freeThrowsMade, statistics.freeThrowsAttempted)],
    ["RO", statistics.reboundsOffensive === null ? null : String(statistics.reboundsOffensive)],
    ["RD", statistics.reboundsDefensive === null ? null : String(statistics.reboundsDefensive)],
    ["REB", statistics.rebounds === null ? null : String(statistics.rebounds)],
    ["PD", statistics.assists === null ? null : String(statistics.assists)],
    ["INT", statistics.steals === null ? null : String(statistics.steals)],
    ["BP", statistics.turnovers === null ? null : String(statistics.turnovers)],
    ["CTR", statistics.blocks === null ? null : String(statistics.blocks)],
    ["CS", statistics.blocksAgainst === null ? null : String(statistics.blocksAgainst)],
    ["FA", statistics.fouls === null ? null : String(statistics.fouls)],
    ["FP", statistics.foulsOn === null ? null : String(statistics.foulsOn)],
    ["+/-", statistics.plusMinus === null ? null : String(statistics.plusMinus)],
    ["EVAL", statistics.efficiency === null ? null : String(statistics.efficiency)],
    ["PIR", statistics.pir === null ? null : String(statistics.pir)],
    ["PIE", statistics.pie === null ? null : String(statistics.pie)],
    ["USG%", statistics.usagePercentage === null ? null : String(statistics.usagePercentage)],
    ["POSS.", statistics.possessions === null ? null : String(statistics.possessions)],
    ["Titulaire", statistics.isStarter === null ? null : statistics.isStarter ? "oui" : "non"],
  ];
  return values.filter((entry): entry is [string, string] => entry[1] !== null);
};

const findPlayer = (
  statistics: PlayerStatistics[],
  playerName: string,
  venue: "home" | "away",
): PlayerStatistics | null => {
  const requested = normalize(playerName);
  const matches = statistics.filter((item) =>
    item.venue === venue
    &&
    normalize(`${item.player.firstname} ${item.player.lastname}`) === requested);
  return matches.length === 1 ? matches[0] : null;
};

const targetVenue = (eventName: string, teamName: string): "home" | "away" | null => {
  const scoreSuffixRemoved = eventName.replace(/\s+\(\d+\s*-\s*\d+\)\s*$/, "").trim();
  const teams = scoreSuffixRemoved.split(/\s+vs\.?\s+/i);
  if (teams.length !== 2) return null;
  const requested = normalize(teamName);
  if (normalize(teams[0]) === requested) return "home";
  if (normalize(teams[1]) === requested) return "away";
  return null;
};

const hasExplicitParticipation = (statistics: PlayerStatistics): boolean =>
  statistics.timePlayed !== null && statistics.timePlayed > 0;

const buildCandidate = (
  athlete: SportsWatchAthleteSnapshot,
  binding: BeBasketOfficialIdentity,
  match: CalendarMatch,
  parsed: ParsedMatch,
  player: PlayerStatistics,
  collectedAt: string,
): CollectedSportsWatchCandidate => {
  const eventDate = isoDate(parsed.event.startDate);
  if (!eventDate) throw sourceError("la date factuelle d’un match est invalide.");
  const values = explicitStatistics(player);
  const playerName = `${player.player.firstname} ${player.player.lastname}`;
  const excerpt = [
    "Source : BeBasket — source tierce.",
    "Statut factuel : non vérifié ; aucune corroboration officielle.",
    `Match : ${parsed.event.name}.`,
    `Date : ${eventDate}.`,
    `Participation explicitement documentée pour ${playerName}.`,
    values.length > 0
      ? `Statistiques explicitement présentes : ${values.map(([label, value]) => `${label} ${value}`).join(" · ")}.`
      : "Aucune statistique chiffrée explicite n’est présente.",
  ].join(" ");
  return {
    sourceKey: BEBASKET_SOURCE_KEY,
    athlete,
    sourceName: BEBASKET_SOURCE_NAME,
    sourceUrl: binding.calendarUrl,
    articleUrl: match.url,
    title: `${parsed.event.name} — ${playerName}`,
    excerpt,
    resultKind: "individual_result",
    publicationDate: null,
    eventDateFrom: eventDate,
    eventDateTo: eventDate,
    collectedAt,
    attributionStatus: "matched",
    attributionEvidence: [
      `Rattachement Admin : équipe ${binding.teamName}, joueuse ${binding.playerName}.`,
      `Le nom complet ${playerName} apparaît une seule fois dans la feuille BeBasket liée depuis le calendrier.`,
      "La présence et les statistiques proviennent d’une source tierce et restent factuellement non vérifiées.",
    ],
    logicalKey: `${BEBASKET_SOURCE_KEY}|${match.id}|${normalize(binding.playerName)}`,
    contentHash: sha256(JSON.stringify({
      eventDate,
      eventName: parsed.event.name,
      player: player.player,
      values,
    })),
  };
};

export const verifyBeBasketBinding = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    calendarUrl: string;
    teamName: string;
    playerName: string;
    dependencies?: Partial<CollectorDependencies>;
  },
): Promise<BeBasketBindingVerification> => {
  const dependencies: CollectorDependencies = {
    fetch,
    now: () => new Date(),
    ...options.dependencies,
  };
  const requestedTeamName = options.teamName.trim();
  const requestedPlayerName = options.playerName.trim();
  if (!requestedTeamName) throw sourceError("saisissez le nom de l’équipe.");
  if (!requestedPlayerName) throw sourceError("saisissez le nom de la joueuse.");
  if (normalize(requestedPlayerName) !== normalize(athlete.name)) {
    throw sourceError("le nom de la joueuse doit correspondre sans ambiguïté au nom complet CRM.");
  }
  const { url, teamSlug } = readCalendarUrl(options.calendarUrl);
  const html = await fetchCalendar(url.toString(), dependencies);
  const matches = parseCalendar(html, dependencies.now());
  const teamMatches = matches.filter((match) =>
    normalize(match.title).includes(normalize(requestedTeamName)));
  if (teamMatches.length === 0) {
    throw sourceError("l’équipe saisie n’apparaît dans aucun match du calendrier.");
  }
  return {
    athlete,
    officialIdentity: {
      calendarUrl: url.toString(),
      teamSlug,
      teamName: requestedTeamName,
      playerName: requestedPlayerName,
    },
    evidence: [
      `Calendrier public BeBasket de l’équipe ${requestedTeamName} (${teamSlug}) accessible.`,
      `${teamMatches.length} lien${teamMatches.length === 1 ? "" : "s"} de match public${teamMatches.length === 1 ? "" : "s"} découvert${teamMatches.length === 1 ? "" : "s"}.`,
      `Le nom configuré ${requestedPlayerName} correspond au nom complet CRM.`,
      "BeBasket est une source tierce ; ce rattachement ne constitue pas une corroboration officielle.",
    ],
    verifiedAt: dependencies.now().toISOString(),
  };
};

export const collectBeBasketCandidates = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    identity?: BeBasketOfficialIdentity;
    lookbackDays?: number;
    dependencies?: Partial<CollectorDependencies>;
  } = {},
): Promise<BeBasketCollectionResult> => {
  if (!options.identity) throw sourceError("aucun rattachement BeBasket confirmé n’a été fourni.");
  const identity = options.identity;
  const dependencies: CollectorDependencies = {
    fetch,
    now: () => new Date(),
    ...options.dependencies,
  };
  const now = dependencies.now();
  const html = await fetchCalendar(identity.calendarUrl, dependencies);
  const { teamSlug } = readCalendarUrl(identity.calendarUrl);
  if (teamSlug !== identity.teamSlug) {
    throw sourceError("le calendrier relu ne concorde pas avec le rattachement confirmé.");
  }
  const cutoff = subtractUtcDays(now, options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS);
  const today = now.toISOString().slice(0, 10);
  const discoverable = parseCalendar(html, now)
    .filter((match) => match.approximateDate >= cutoff && match.approximateDate <= today)
    .slice(0, MAX_RECENT_MATCHES);
  const observations: SportsWatchCollectionObservation[] = [];
  const candidates: CollectedSportsWatchCandidate[] = [];
  const collectedAt = now.toISOString();

  for (const match of discoverable) {
    const parsed = parseMatch(await fetchMatch(match.url, dependencies));
    const eventDate = isoDate(parsed.event.startDate);
    if (!eventDate || eventDate < cutoff || eventDate > today) continue;
    if (parsed.playerStatistics.length === 0) {
      observations.push({
        matchUrl: match.url,
        title: parsed.event.name,
        eventDate,
        status: "sheet_absent",
      });
      continue;
    }
    const venue = targetVenue(parsed.event.name, identity.teamName);
    if (!venue) {
      throw sourceError("l’équipe rattachée ne peut pas être située sans ambiguïté dans un match.");
    }
    const teamStatistics = parsed.playerStatistics.filter((item) => item.venue === venue);
    if (teamStatistics.length === 0) {
      observations.push({
        matchUrl: match.url,
        title: parsed.event.name,
        eventDate,
        status: "sheet_absent",
      });
      continue;
    }
    const player = findPlayer(teamStatistics, identity.playerName, venue);
    if (!player) {
      observations.push({
        matchUrl: match.url,
        title: parsed.event.name,
        eventDate,
        status: "player_absent",
      });
      continue;
    }
    if (!hasExplicitParticipation(player)) {
      observations.push({
        matchUrl: match.url,
        title: parsed.event.name,
        eventDate,
        status: "player_listed_without_participation",
      });
      continue;
    }
    observations.push({
      matchUrl: match.url,
      title: parsed.event.name,
      eventDate,
      status: "participation_explicit",
    });
    candidates.push(buildCandidate(athlete, identity, match, parsed, player, collectedAt));
  }

  return {
    candidates,
    observations,
    scannedCount: discoverable.length,
    recentCount: observations.length,
  };
};

export const beBasketCollectorTestUtils = {
  decodeFlightChunks,
  explicitStatistics,
  parseCalendar,
  parseMatch,
};
