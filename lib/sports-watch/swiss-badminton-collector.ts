import { createHash } from "node:crypto";
import {
  SPORTS_WATCH_USER_AGENT,
  SportsWatchSourceError,
  type CollectedSportsWatchCandidate,
  type SportsWatchAthleteSnapshot,
} from "@/lib/sports-watch/bcbulle-collector";

export const SWISS_BADMINTON_SOURCE_KEY = "swiss-badminton";
export const SWISS_BADMINTON_SOURCE_NAME = "Swiss Badminton / Tournamentsoftware";
export const SWISS_BADMINTON_PROFILE_URL =
  "https://sb.tournamentsoftware.com/player-profile/E4A0E261-0D72-4F64-AA20-CF9AAB291A68";
export const SWISS_BADMINTON_PLAYER_ID = "206063";

const SOURCE_HOSTNAME = "sb.tournamentsoftware.com";
const PROFILE_UUID = "E4A0E261-0D72-4F64-AA20-CF9AAB291A68";
const PILOT_NAME = "Antoine Majeux";
const PILOT_CLUB = "BC Bulle";
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 2;
const MAX_TOURNAMENTS = 8;
const MAX_MATCHES = 80;
const REQUEST_TIMEOUT_MS = 10_000;

type CollectorDependencies = {
  fetch: typeof fetch;
  now: () => Date;
};

type HtmlBlock = {
  html: string;
  index: number;
};

type ParsedMatch = {
  tournamentId: string;
  tournamentTitle: string;
  eventCode: string;
  drawUrl: string;
  stage: string;
  matchDate: string;
  discipline: "simple" | "double" | "mixte";
  orderedTeams: [
    { players: string[]; playerIds: string[] },
    { players: string[]; playerIds: string[] },
  ];
  displayedScores: Array<[string, string]>;
  winnerTeamIndex: 0 | 1;
  athleteTeamIndex: 0 | 1;
  explicitRanking: string | null;
};

export type SwissBadmintonCollectionResult = {
  candidates: CollectedSportsWatchCandidate[];
  scannedCount: number;
  recentCount: number;
};

const normalize = (value: unknown): string => String(value ?? "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/\s+/g, " ");

const decodeHtml = (value: string): string => value
  .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, "\"")
  .replace(/&#0?39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

const toPlainText = (value: string): string => decodeHtml(value)
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const sourceError = (detail: string): SportsWatchSourceError =>
  new SportsWatchSourceError(
    `La source ${SWISS_BADMINTON_SOURCE_NAME} est inexploitable : ${detail}`,
  );

const safeSourceUrl = (value: string, base = SWISS_BADMINTON_PROFILE_URL): URL => {
  let url: URL;
  try {
    url = new URL(decodeHtml(value), base);
  } catch {
    throw sourceError("un lien officiel est invalide.");
  }
  if (url.protocol !== "https:" || url.hostname !== SOURCE_HOSTNAME) {
    throw sourceError("un lien quitte le domaine officiel autorisé.");
  }
  url.hash = "";
  return url;
};

const fetchBoundedProfile = async (dependencies: CollectorDependencies): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let url = safeSourceUrl(SWISS_BADMINTON_PROFILE_URL);
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
        url = safeSourceUrl(location, url.toString());
        continue;
      }
      if (!response.ok) {
        throw new SportsWatchSourceError(
          `La source ${SWISS_BADMINTON_SOURCE_NAME} a refusé la lecture (HTTP ${response.status}).`,
          response.status,
        );
      }
      if (safeSourceUrl(response.url || url.toString()).hostname !== SOURCE_HOSTNAME) {
        throw sourceError("la réponse quitte le domaine officiel autorisé.");
      }
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

const findBlocks = (html: string, openingPattern: RegExp, limit: number): HtmlBlock[] => {
  const matches = Array.from(html.matchAll(openingPattern)).slice(0, limit);
  return matches.map((match, index) => ({
    index: match.index ?? 0,
    html: html.slice(match.index ?? 0, matches[index + 1]?.index ?? html.length),
  }));
};

const readAttribute = (html: string, name: string): string | null => {
  const match = html.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? decodeHtml(match[1] ?? match[2] ?? "") : null;
};

const readDottedDate = (html: string): string | null => {
  const match = toPlainText(html).match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (!match) return null;
  const value = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
};

const readExplicitRanking = (html: string): string | null => {
  const match = toPlainText(html).match(
    /(?:classement final|final ranking|endrang)\s*:?\s*(\d{1,3})(?:er|re|e|ème|\.)?\b/i,
  );
  return match ? `${match[1]}${match[1] === "1" ? "er" : "e"}` : null;
};

const readDiscipline = (
  eventCode: string,
  teams: [string[], string[]],
): ParsedMatch["discipline"] | null => {
  if (teams.every((team) => team.length === 1)) {
    return /^(?:SM|SD|HE|DE|MS|WS|SH|SF)\d*$/i.test(eventCode) ? "simple" : null;
  }
  if (!teams.every((team) => team.length === 2)) return null;
  if (/^(?:DX|MX|XD)\d*$/i.test(eventCode)) return "mixte";
  return /^(?:DM|DD|HD|MD|WD|DH|DF)\d*$/i.test(eventCode) ? "double" : null;
};

const readH2hTeams = (html: string): [string[], string[]] | null => {
  const href = html.match(/href=(?:"([^"]*\/head-2-head\?[^"]+)"|'([^']*\/head-2-head\?[^']+)')/i);
  if (!href) return null;
  const url = safeSourceUrl(href[1] ?? href[2] ?? "");
  const teams = ([1, 2] as const).map((team) =>
    ([1, 2] as const)
      .map((player) => url.searchParams.get(`T${team}P${player}MemberID`))
      .filter((id): id is string => Boolean(id)));
  return teams[0].length > 0 && teams[1].length > 0
    ? [teams[0], teams[1]]
    : null;
};

const readMatchRows = (
  html: string,
): { teams: [string[], string[]]; winnerTeamIndex: 0 | 1 } | null => {
  const resultIndex = html.indexOf("match__result");
  if (resultIndex < 0) return null;
  const rowBlocks = findBlocks(
    html.slice(0, resultIndex),
    /<div\b[^>]*class=(?:"match__row(?:\s[^"]*)?"|'match__row(?:\s[^']*)?')[^>]*>/gi,
    3,
  );
  if (rowBlocks.length !== 2) return null;
  const teams = rowBlocks.map((row) => {
    const links = Array.from(row.html.matchAll(
      /<a\b[^>]*href=(?:"[^"]*\/sport\/player\.aspx[^"]*"|'[^']*\/sport\/player\.aspx[^']*')[^>]*>([\s\S]*?)<\/a>/gi,
    ));
    return links.map((link) => toPlainText(link[1])).filter(Boolean);
  });
  if (
    teams.some((team) => team.length < 1 || team.length > 2)
    || teams[0].length !== teams[1].length
  ) {
    return null;
  }
  const winners = rowBlocks
    .map((row, index) => /\bhas-won\b/i.test(row.html) ? index : -1)
    .filter((index) => index >= 0);
  if (winners.length !== 1) return null;
  return {
    teams: [teams[0], teams[1]],
    winnerTeamIndex: winners[0] as 0 | 1,
  };
};

const readDisplayedScores = (html: string): Array<[string, string]> | null => {
  const groups = Array.from(html.matchAll(
    /<ul\b[^>]*class=(?:"points"|'points')[^>]*>([\s\S]*?)<\/ul>/gi,
  ));
  if (groups.length < 2 || groups.length > 5) return null;
  const scores = groups.map((group) =>
    Array.from(group[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))
      .map((cell) => toPlainText(cell[1])));
  return scores.every((set) => set.length === 2 && set.every(Boolean))
    ? scores.map((set) => [set[0], set[1]] as [string, string])
    : null;
};

const parseMatch = (
  matchHtml: string,
  context: {
    tournamentId: string;
    tournamentTitle: string;
    eventCode: string;
    drawUrl: string;
    explicitRanking: string | null;
  },
): ParsedMatch | null => {
  if (!normalize(toPlainText(matchHtml)).includes(normalize(PILOT_NAME))) return null;
  const rows = readMatchRows(matchHtml);
  const orderedPlayerIds = readH2hTeams(matchHtml);
  const displayedScores = readDisplayedScores(matchHtml);
  const matchDate = readDottedDate(matchHtml);
  const header = matchHtml.match(
    /<div\b[^>]*class=(?:"match__header"|'match__header')[^>]*>([\s\S]*?)<\/div>/i,
  );
  const stage = header ? toPlainText(header[1]).replace(/\b\d+\s*m\b/i, "").trim() : "";
  if (!rows || !orderedPlayerIds || !displayedScores || !matchDate || !stage) {
    throw sourceError("un match attribué à Antoine Majeux possède un HTML incomplet.");
  }
  if (
    rows.teams[0].length !== orderedPlayerIds[0].length
    || rows.teams[1].length !== orderedPlayerIds[1].length
  ) {
    throw sourceError("l’ordre des équipes ne concorde pas avec les identifiants officiels.");
  }
  const flattenedPlayerIds = orderedPlayerIds.flat();
  if (new Set(flattenedPlayerIds).size !== flattenedPlayerIds.length) {
    throw sourceError("les identifiants officiels des équipes sont ambigus.");
  }
  const officialPositions = orderedPlayerIds.flatMap((team, teamIndex) =>
    team.map((id, playerIndex) => ({ id, teamIndex, playerIndex })))
    .filter((position) => position.id === SWISS_BADMINTON_PLAYER_ID);
  if (officialPositions.length !== 1) {
    throw sourceError("la position d’Antoine Majeux est absente ou ambiguë.");
  }
  const [{ teamIndex, playerIndex }] = officialPositions;
  if (
    normalize(rows.teams[teamIndex][playerIndex]) !== normalize(PILOT_NAME)
  ) {
    throw sourceError("la position d’Antoine Majeux ne concorde pas avec son identifiant officiel.");
  }
  const discipline = readDiscipline(context.eventCode, rows.teams);
  if (!discipline) {
    throw sourceError("la discipline ou la composition des équipes est ambiguë.");
  }
  return {
    ...context,
    stage,
    matchDate,
    discipline,
    orderedTeams: [
      { players: rows.teams[0], playerIds: orderedPlayerIds[0] },
      { players: rows.teams[1], playerIds: orderedPlayerIds[1] },
    ],
    displayedScores,
    winnerTeamIndex: rows.winnerTeamIndex,
    athleteTeamIndex: teamIndex as 0 | 1,
  };
};

const parseProfile = (html: string): ParsedMatch[] => {
  const plain = toPlainText(html);
  if (
    !plain.includes(`${PILOT_NAME} (${SWISS_BADMINTON_PLAYER_ID})`)
    || !normalize(plain).includes(normalize(PILOT_CLUB))
    || !html.includes(PROFILE_UUID)
  ) {
    throw sourceError("l’identité officielle du profil ne concorde pas.");
  }
  if (!/\bTurniere\b/i.test(plain) || !/\bmedia__title\b/i.test(html)) {
    throw sourceError("la section des compétitions est absente ou inattendue.");
  }

  const tournamentBlocks = findBlocks(
    html,
    /<h4\b[^>]*class=(?:"[^"]*\bmedia__title\b[^"]*"|'[^']*\bmedia__title\b[^']*')[^>]*>/gi,
    MAX_TOURNAMENTS,
  );
  const matches: ParsedMatch[] = [];
  for (const tournamentBlock of tournamentBlocks) {
    const headingEnd = tournamentBlock.html.indexOf("</h4>");
    const heading = headingEnd >= 0 ? tournamentBlock.html.slice(0, headingEnd + 5) : "";
    if (!/\/sport\/tournament(?:\.aspx)?\?id=/i.test(heading)) continue;
    const anchor = heading.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    if (!anchor) throw sourceError("une compétition ne possède pas de lien officiel exploitable.");
    const href = readAttribute(anchor[1], "href");
    const tournamentUrl = href ? safeSourceUrl(href) : null;
    const tournamentId = tournamentUrl?.searchParams.get("id");
    const tournamentTitle = toPlainText(anchor[2]);
    if (!tournamentId || !tournamentTitle) {
      throw sourceError("une compétition ne possède pas d’identité exploitable.");
    }

    const eventBlocks = findBlocks(
      tournamentBlock.html,
      /<h4\b[^>]*class=(?:"[^"]*\bmodule-divider\b[^"]*"|'[^']*\bmodule-divider\b[^']*')[^>]*>[\s\S]*?Konkurrenz:\s*[^<]+/gi,
      20,
    );
    for (const eventBlock of eventBlocks) {
      const eventHeadingEnd = eventBlock.html.indexOf("</h4>");
      const eventHeading = eventHeadingEnd >= 0 ? eventBlock.html.slice(0, eventHeadingEnd + 5) : "";
      const eventCodeMatch = toPlainText(eventHeading).match(/Konkurrenz:\s*(\S+)/i);
      if (!eventCodeMatch) {
        throw sourceError("une épreuve ne possède pas d’identité exploitable.");
      }
      const drawHref = eventBlock.html.match(
        /href=(?:"([^"]*\/sport\/draw\.aspx\?[^"]+)"|'([^']*\/sport\/draw\.aspx\?[^']+)')/i,
      );
      if (!drawHref) {
        throw sourceError("une épreuve ne possède pas de lien de tableau exploitable.");
      }
      const drawUrl = safeSourceUrl(drawHref[1] ?? drawHref[2] ?? "").toString();
      const matchBlocks = findBlocks(eventBlock.html, /<div class="match">/gi, MAX_MATCHES);
      if (
        matchBlocks.length === 0
        && normalize(toPlainText(eventBlock.html)).includes(normalize(PILOT_NAME))
      ) {
        throw sourceError("une épreuve attribuée à Antoine Majeux ne contient aucun match exploitable.");
      }
      for (const matchBlock of matchBlocks) {
        const parsed = parseMatch(matchBlock.html, {
          tournamentId,
          tournamentTitle,
          eventCode: eventCodeMatch[1],
          drawUrl,
          explicitRanking: readExplicitRanking(eventBlock.html),
        });
        if (parsed) matches.push(parsed);
      }
    }
  }
  return matches.slice(0, MAX_MATCHES);
};

const buildCandidate = (
  athlete: SportsWatchAthleteSnapshot,
  match: ParsedMatch,
  collectedAt: string,
): CollectedSportsWatchCandidate => {
  const displayedScore = match.displayedScores
    .map(([first, second]) => `${first}-${second}`)
    .join(", ");
  const athleteScore = match.displayedScores
    .map((set) => `${set[match.athleteTeamIndex]}-${set[match.athleteTeamIndex === 0 ? 1 : 0]}`)
    .join(", ");
  const athleteTeam = match.orderedTeams[match.athleteTeamIndex];
  const opponentTeam = match.orderedTeams[match.athleteTeamIndex === 0 ? 1 : 0];
  const winnerTeam = match.orderedTeams[match.winnerTeamIndex];
  const teamLabel = (team: ParsedMatch["orderedTeams"][number]): string =>
    team.players.join(" et ");
  const excerptParts = [
    `${match.tournamentTitle} — ${match.eventCode} (${match.discipline}) — ${match.stage}.`,
  ];
  if (match.discipline === "simple") {
    excerptParts.push(
      `Ordre officiel : ${teamLabel(match.orderedTeams[0])} puis ${teamLabel(match.orderedTeams[1])}.`,
      `Vainqueur explicite : ${teamLabel(winnerTeam)}.`,
      `Scores dans l’ordre officiel : ${displayedScore}.`,
      `Score du point de vue d’${PILOT_NAME} : ${athleteScore}.`,
    );
  } else {
    const partner = athleteTeam.players.find((player) => normalize(player) !== normalize(PILOT_NAME));
    if (!partner || opponentTeam.players.length !== 2) {
      throw sourceError("le partenaire ou les adversaires d’Antoine Majeux sont ambigus.");
    }
    excerptParts.push(
      `Équipe 1 officielle : ${teamLabel(match.orderedTeams[0])}.`,
      `Équipe 2 officielle : ${teamLabel(match.orderedTeams[1])}.`,
      `Équipe d’${PILOT_NAME} : ${teamLabel(athleteTeam)}.`,
      `Partenaire d’${PILOT_NAME} : ${partner}.`,
      `Adversaires : ${teamLabel(opponentTeam)}.`,
      `Équipe gagnante explicite : ${teamLabel(winnerTeam)}.`,
      `Scores dans l’ordre officiel des équipes : ${displayedScore}.`,
      `Scores du point de vue de l’équipe d’${PILOT_NAME} : ${athleteScore}.`,
    );
  }
  if (match.explicitRanking) {
    excerptParts.push(`Classement final explicitement indiqué : ${match.explicitRanking}.`);
  }
  const logicalKey = sha256([
    athlete.id,
    SWISS_BADMINTON_SOURCE_KEY,
    match.tournamentId,
    match.eventCode,
    match.matchDate,
    match.stage,
    ...match.orderedTeams.flatMap((team) => team.playerIds),
  ].join("|"));
  const excerpt = excerptParts.join(" ");
  const contentHash = sha256(JSON.stringify({
    title: `${match.tournamentTitle} — ${match.eventCode}`,
    excerpt,
    eventDate: match.matchDate,
    articleUrl: match.drawUrl,
  }));
  return {
    sourceKey: SWISS_BADMINTON_SOURCE_KEY,
    athlete,
    sourceName: SWISS_BADMINTON_SOURCE_NAME,
    sourceUrl: SWISS_BADMINTON_PROFILE_URL,
    articleUrl: match.drawUrl,
    title: `${match.tournamentTitle} — ${match.eventCode}`,
    excerpt,
    resultKind: match.discipline === "simple" ? "individual_result" : "collective_result",
    publicationDate: null,
    eventDateFrom: match.matchDate,
    eventDateTo: match.matchDate,
    collectedAt,
    attributionStatus: "matched",
    attributionEvidence: [
      `Profil officiel ${PROFILE_UUID}.`,
      `Identifiant joueur Swiss Badminton ${SWISS_BADMINTON_PLAYER_ID}.`,
      `Nom officiel ${PILOT_NAME} et club ${PILOT_CLUB} concordants.`,
      `Équipe et position confirmées dans le match par l’identifiant membre ${SWISS_BADMINTON_PLAYER_ID}.`,
    ],
    logicalKey,
    contentHash,
  };
};

const localFixtureEnabled = (): boolean =>
  process.env.NODE_ENV === "development"
  && process.env.KLIQUE_SPORTS_WATCH_SWISS_LOCAL_FIXTURE === "three-disciplines";

const fixtureMatch = (input: {
  stage: string;
  date: string;
  teams: [Array<{ name: string; id: string }>, Array<{ name: string; id: string }>];
  winnerTeamIndex: 0 | 1;
  scores: Array<[string, string]>;
}): string => `
  <div class="match">
    <div class="match__header"><span class="nav-link__value">${input.stage}</span></div>
    <div class="match__body">
      <div class="match__row-wrapper">
        ${input.teams.map((team, teamIndex) => `
          <div class="match__row ${input.winnerTeamIndex === teamIndex ? "has-won" : ""}">
            ${team.map((player, playerIndex) => `
              <a href="/sport/player.aspx?id=fixture&amp;player=${teamIndex + 1}${playerIndex + 1}">${player.name}</a>
            `).join("")}
          </div>
        `).join("")}
      </div>
      <div class="match__result">
        ${input.scores.map(([first, second]) =>
          `<ul class="points"><li>${first}</li><li>${second}</li></ul>`).join("")}
      </div>
      <a href="/head-2-head?OrganizationCode=official&amp;${
        input.teams.flatMap((team, teamIndex) =>
          team.map((player, playerIndex) =>
            `T${teamIndex + 1}P${playerIndex + 1}MemberID=${player.id}`)).join("&amp;")
      }">H2H</a>
    </div>
    <div class="match__footer"><span>${input.date}</span></div>
  </div>
`;

const buildLocalFixtureProfile = (): string => {
  const tournamentId = "B2E4D29A-5E0D-4935-B2B3-3A5DD226E8C4";
  const event = (code: string, draw: number, match: string) => `
    <h4 class="module-divider"><span>Konkurrenz: ${code}</span></h4>
    <h5><a href="/sport/draw.aspx?id=${tournamentId}&amp;draw=${draw}">${code}</a></h5>
    ${match}
  `;
  return `
    <html>
      <body data-profile="${PROFILE_UUID}">
        <h2>${PILOT_NAME} (${SWISS_BADMINTON_PLAYER_ID})</h2>
        <a href="/association/group/bc-bulle">${PILOT_CLUB}</a>
        <h3>Turniere</h3>
        <h4 class="media__title media__title--medium">
          <a href="/sport/tournament?id=${tournamentId}">[FIXTURE LOCALE] Neuch'Cup 2026</a>
        </h4>
        ${event("SM1", 1, fixtureMatch({
          stage: "Ronde van 16",
          date: "25.10.2026",
          teams: [
            [{ name: "Matteo Marmillod", id: "118994" }],
            [{ name: PILOT_NAME, id: SWISS_BADMINTON_PLAYER_ID }],
          ],
          winnerTeamIndex: 1,
          scores: [["15", "13"], ["9", "15"], ["15", "17"]],
        }))}
        ${event("DM2", 9, fixtureMatch({
          stage: "Ronde van 16",
          date: "24.10.2026",
          teams: [
            [
              { name: "Daniel Günter", id: "97725" },
              { name: "Ethan Roth", id: "202288" },
            ],
            [
              { name: PILOT_NAME, id: SWISS_BADMINTON_PLAYER_ID },
              { name: "Max Pasquier", id: "202582" },
            ],
          ],
          winnerTeamIndex: 1,
          scores: [["15", "9"], ["8", "15"], ["8", "15"]],
        }))}
        ${event("DX1", 4, fixtureMatch({
          stage: "Kwartfinale",
          date: "24.10.2026",
          teams: [
            [
              { name: PILOT_NAME, id: SWISS_BADMINTON_PLAYER_ID },
              { name: "Anja Stehlin", id: "205947" },
            ],
            [
              { name: "Alan Sterchi", id: "113621" },
              { name: "Katarzyna Wojtowicz", id: "106506" },
            ],
          ],
          winnerTeamIndex: 1,
          scores: [["12", "15"], ["10", "15"]],
        }))}
      </body>
    </html>
  `;
};

export const collectSwissBadmintonCandidates = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    lookbackDays?: number;
    dependencies?: Partial<CollectorDependencies>;
  } = {},
): Promise<SwissBadmintonCollectionResult> => {
  if (
    normalize(athlete.name) !== normalize(PILOT_NAME)
    || !normalize(athlete.sport).includes("badminton")
    || !normalize(athlete.club).includes("bulle")
  ) {
    throw sourceError("l’athlète CRM sélectionné ne concorde pas avec le pilote officiel.");
  }
  const dependencies: CollectorDependencies = {
    fetch: options.dependencies?.fetch ?? fetch,
    now: options.dependencies?.now ?? (() => new Date()),
  };
  const collectedAtDate = dependencies.now();
  const collectedAt = collectedAtDate.toISOString();
  const cutoff = collectedAtDate.getTime()
    - (options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000;
  const profileHtml = localFixtureEnabled()
    ? buildLocalFixtureProfile()
    : await fetchBoundedProfile(dependencies);
  const parsedMatches = parseProfile(profileHtml);
  const recentCandidates = parsedMatches
    .filter((match) => {
      const timestamp = new Date(`${match.matchDate}T23:59:59.999Z`).getTime();
      return timestamp >= cutoff && timestamp <= collectedAtDate.getTime();
    })
    .map((match) => buildCandidate(athlete, match, collectedAt));
  const candidatesByMatch = new Map<string, CollectedSportsWatchCandidate>();
  for (const candidate of recentCandidates) {
    const existing = candidatesByMatch.get(candidate.logicalKey);
    if (existing && existing.contentHash !== candidate.contentHash) {
      throw sourceError("le même match officiel présente des données contradictoires.");
    }
    if (!existing) candidatesByMatch.set(candidate.logicalKey, candidate);
  }
  const candidates = Array.from(candidatesByMatch.values());
  return {
    candidates,
    scannedCount: parsedMatches.length,
    recentCount: candidates.length,
  };
};

export const swissBadmintonCollectorTestUtils = {
  buildLocalFixtureProfile,
  buildCandidate,
  parseProfile,
};
