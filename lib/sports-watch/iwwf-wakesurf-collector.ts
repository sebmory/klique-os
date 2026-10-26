import { createHash } from "node:crypto";
import {
  SPORTS_WATCH_USER_AGENT,
  SportsWatchSourceError,
  type CollectedSportsWatchCandidate,
  type SportsWatchAthleteSnapshot,
} from "@/lib/sports-watch/bcbulle-collector";
import type {
  IwwfIdentityVerification,
  IwwfOfficialIdentity,
} from "@/types/sports-watch";

export const IWWF_WAKESURF_SOURCE_KEY = "iwwf-wakesurf";
export const IWWF_WAKESURF_SOURCE_NAME = "IWWF Event Management System";
export const IWWF_BASE_URL = "https://ems.iwwf.sport/";

const SOURCE_HOSTNAME = "ems.iwwf.sport";
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 2;
const MAX_COMPETITIONS = 20;
const MAX_RESULT_ROWS = 80;
const REQUEST_TIMEOUT_MS = 10_000;

type CollectorDependencies = {
  fetch: typeof fetch;
  now: () => Date;
};

type IwwfResult = {
  competitionId: string;
  competitionName: string;
  competitionUrl: string;
  eventDateFrom: string;
  eventDateTo: string;
  discipline: string;
  eventCode: string;
  category: string;
  ranking: string | null;
  rounds: Array<{ name: string; score: string }>;
};

export type IwwfProfileConfig = IwwfOfficialIdentity;

export type IwwfCollectionResult = {
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
    `La source ${IWWF_WAKESURF_SOURCE_NAME} est inexploitable : ${detail}`,
  );

const safeSourceUrl = (value: string, base = IWWF_BASE_URL): URL => {
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

const readProfileUrl = (value: string): { url: URL; athleteId: string } => {
  const url = safeSourceUrl(value);
  const match = url.pathname.match(/^\/Athletes\/Profile\/([A-Z]{3}[A-Z0-9]{6,20})\/?$/i);
  if (!match || url.search) {
    throw sourceError("l’URL ne correspond pas à un profil athlète IWWF officiel.");
  }
  const athleteId = match[1].toUpperCase();
  url.pathname = `/Athletes/Profile/${athleteId}`;
  return { url, athleteId };
};

const fetchBoundedProfile = async (
  profileUrl: string,
  dependencies: CollectorDependencies,
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let url = readProfileUrl(profileUrl).url;
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
        url = readProfileUrl(safeSourceUrl(location, url.toString()).toString()).url;
        continue;
      }
      if (!response.ok) {
        throw new SportsWatchSourceError(
          `La source ${IWWF_WAKESURF_SOURCE_NAME} a refusé la lecture (HTTP ${response.status}).`,
          response.status,
        );
      }
      readProfileUrl(response.url || url.toString());
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

const samePersonName = (left: string, right: string): boolean => {
  const tokens = (value: string) => normalize(value).split(" ").filter(Boolean).sort();
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  return leftTokens.length >= 2
    && leftTokens.length === rightTokens.length
    && leftTokens.every((token, index) => token === rightTokens[index]);
};

const readOfficialIdentity = (
  html: string,
  profileUrl: string,
): IwwfOfficialIdentity => {
  const { url, athleteId } = readProfileUrl(profileUrl);
  const profileSection = html.match(
    /<h3\b[^>]*>\s*Athlete(?:'|&#0?39;|&apos;)s Profile\s*<\/h3>([\s\S]*?)(?:<h3\b[^>]*>[\s\S]*?Athlete(?:'|&#0?39;|&apos;)s Results|$)/i,
  )?.[1];
  if (!profileSection) throw sourceError("le bloc d’identité officiel est absent.");
  const name = Array.from(profileSection.matchAll(
    /<div\b[^>]*class=(?:"[^"]*\be\b[^"]*"|'[^']*\be\b[^']*')[^>]*>([\s\S]*?)<\/div>/gi,
  ))
    .map((match) => toPlainText(match[1]))
    .find((value) => value.split(/\s+/).length >= 2);
  const displayedAthleteId = Array.from(profileSection.matchAll(
    /<div\b[^>]*class=(?:"[^"]*\bn\b[^"]*"|'[^']*\bn\b[^']*')[^>]*>([\s\S]*?)<\/div>/gi,
  ))
    .map((match) => toPlainText(match[1]))
    .find((value) => /^[A-Z]{3}[A-Z0-9]{6,20}$/i.test(value));
  if (!name || !displayedAthleteId) {
    throw sourceError("le nom ou l’identifiant du propriétaire du profil est absent.");
  }
  if (displayedAthleteId.toUpperCase() !== athleteId) {
    throw sourceError("l’identifiant affiché ne concorde pas avec l’URL du profil.");
  }
  const birthYearMatch = profileSection.match(/Year of birth:\s*(\d{4})/i);
  return {
    profileUrl: url.toString(),
    athleteId,
    name,
    birthYear: birthYearMatch ? Number(birthYearMatch[1]) : null,
  };
};

const monthIndexes: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const validIsoDate = (day: number, month: number, year: number): string | null => {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
};

const readDateRange = (value: string): { from: string; to: string } | null => {
  const match = toPlainText(value).match(/^(\d{1,2})(?:-(\d{1,2}))?\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;
  const month = monthIndexes[match[3].toLocaleLowerCase("en")];
  if (!month) return null;
  const from = validIsoDate(Number(match[1]), month, Number(match[4]));
  const to = validIsoDate(Number(match[2] ?? match[1]), month, Number(match[4]));
  return from && to ? { from, to } : null;
};

const readAttribute = (html: string, name: string): string | null => {
  const match = html.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return match ? decodeHtml(match[1] ?? match[2] ?? "") : null;
};

const readCells = (rowHtml: string): Array<{ html: string; text: string; title: string | null }> =>
  Array.from(rowHtml.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)).map((match) => ({
    html: match[2],
    text: toPlainText(match[2]),
    title: readAttribute(match[1], "title"),
  }));

const parseResults = (html: string): IwwfResult[] => {
  const resultsSection = html.match(
    /<h3\b[^>]*>[\s\S]*?Athlete(?:'|&#0?39;|&apos;)s Results[\s\S]*?<\/h3>([\s\S]*)/i,
  )?.[1];
  if (!resultsSection) throw sourceError("la liste officielle des résultats est absente.");
  const cards = Array.from(resultsSection.matchAll(
    /<div\b[^>]*class=(?:"card"|'card')[^>]*>\s*<div\b[^>]*class=(?:"card-header"|'card-header')[^>]*>([\s\S]*?)<\/div>\s*<\/div>([\s\S]*?)(?=<div\b[^>]*class=(?:"card"|'card')|$)/gi,
  )).slice(0, MAX_COMPETITIONS);
  const results: IwwfResult[] = [];

  for (const card of cards) {
    const dateText = card[1].match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "";
    const dateRange = readDateRange(dateText);
    const competitionLink = card[1].match(
      /<a\b[^>]*href=(?:"([^"]*\/Competitions\/Details\/([0-9a-f-]{36})[^"]*)"|'([^']*\/Competitions\/Details\/([0-9a-f-]{36})[^']*)')[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!dateRange || !competitionLink) continue;
    const competitionId = (competitionLink[2] ?? competitionLink[4]).toLowerCase();
    const competitionUrl = safeSourceUrl(competitionLink[1] ?? competitionLink[3]).toString();
    const competitionName = toPlainText(competitionLink[5]);
    const rows = Array.from(card[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
      .slice(0, MAX_RESULT_ROWS);
    for (const row of rows) {
      const cells = readCells(row[1]);
      if (cells.length < 4) continue;
      const eventLink = cells[1]?.html.match(
        /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/i,
      );
      if (!eventLink) continue;
      const eventUrl = safeSourceUrl(eventLink[1] ?? eventLink[2]).toString();
      if (eventUrl !== competitionUrl) {
        throw sourceError("un résultat pointe vers une compétition officielle différente.");
      }
      const rankingCell = cells.find((cell) => normalize(cell.title) === "rank");
      const rounds = cells
        .filter((cell) => cell.title && normalize(cell.title) !== "rank" && cell.text)
        .map((cell) => ({ name: cell.title!, score: cell.text }));
      if (rounds.length === 0) continue;
      results.push({
        competitionId,
        competitionName,
        competitionUrl,
        eventDateFrom: dateRange.from,
        eventDateTo: dateRange.to,
        discipline: cells[0].text,
        eventCode: toPlainText(eventLink[3]),
        category: cells[2].text,
        ranking: rankingCell?.text || null,
        rounds,
      });
    }
  }
  if (cards.length > 0 && results.length === 0) {
    throw sourceError("le HTML des résultats ne correspond pas à la structure attendue.");
  }
  return results;
};

const subtractUtcDays = (date: Date, days: number): string => {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
};

export const verifyIwwfProfile = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    profileUrl: string;
    dependencies?: Partial<CollectorDependencies>;
  },
): Promise<IwwfIdentityVerification> => {
  const dependencies: CollectorDependencies = {
    fetch,
    now: () => new Date(),
    ...options.dependencies,
  };
  const html = await fetchBoundedProfile(options.profileUrl, dependencies);
  const officialIdentity = readOfficialIdentity(html, options.profileUrl);
  if (!samePersonName(athlete.name, officialIdentity.name)) {
    throw sourceError("le nom officiel ne concorde pas avec la fiche CRM.");
  }
  return {
    athlete,
    officialIdentity,
    evidence: [
      `Profil IWWF officiel ${officialIdentity.athleteId}.`,
      `Nom officiel ${officialIdentity.name} concordant avec la fiche CRM.`,
      officialIdentity.birthYear
        ? `Année de naissance officielle indiquée : ${officialIdentity.birthYear}.`
        : "Année de naissance non indiquée sur le profil officiel.",
    ],
    verifiedAt: dependencies.now().toISOString(),
  };
};

export const collectIwwfWakesurfCandidates = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    profile?: IwwfProfileConfig;
    lookbackDays?: number;
    dependencies?: Partial<CollectorDependencies>;
  } = {},
): Promise<IwwfCollectionResult> => {
  if (!options.profile) {
    throw sourceError("aucun profil IWWF vérifié n’a été fourni.");
  }
  const dependencies: CollectorDependencies = {
    fetch,
    now: () => new Date(),
    ...options.dependencies,
  };
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const html = await fetchBoundedProfile(options.profile.profileUrl, dependencies);
  const officialIdentity = readOfficialIdentity(html, options.profile.profileUrl);
  if (
    officialIdentity.athleteId !== options.profile.athleteId
    || !samePersonName(officialIdentity.name, options.profile.name)
    || !samePersonName(officialIdentity.name, athlete.name)
  ) {
    throw sourceError("l’identité relue ne concorde pas avec le rattachement confirmé.");
  }
  const results = parseResults(html);
  const today = dependencies.now().toISOString().slice(0, 10);
  const cutoff = subtractUtcDays(dependencies.now(), lookbackDays);
  const recent = results.filter((result) =>
    result.eventDateTo >= cutoff && result.eventDateFrom <= today);
  const collectedAt = dependencies.now().toISOString();
  const candidates = recent.flatMap((result) => result.rounds.map((round) => {
    const ranking = result.ranking
      ? ` Classement explicitement indiqué : ${result.ranking}.`
      : "";
    const excerpt = [
      `${result.competitionName} — ${result.eventCode}.`,
      `Discipline : ${result.discipline}.`,
      `Catégorie : ${result.category}.`,
      `Tour : ${round.name}.`,
      `Score explicite : ${round.score}.`,
      ranking.trim(),
    ].filter(Boolean).join(" ");
    const logicalKey = [
      IWWF_WAKESURF_SOURCE_KEY,
      officialIdentity.athleteId,
      result.competitionId,
      normalize(result.discipline),
      normalize(result.eventCode),
      normalize(result.category),
      normalize(round.name),
    ].join("|");
    return {
      sourceKey: IWWF_WAKESURF_SOURCE_KEY,
      athlete,
      sourceName: IWWF_WAKESURF_SOURCE_NAME,
      sourceUrl: officialIdentity.profileUrl,
      articleUrl: result.competitionUrl,
      title: `${result.competitionName} — ${result.category}`,
      excerpt,
      resultKind: "individual_result" as const,
      publicationDate: null,
      eventDateFrom: result.eventDateFrom,
      eventDateTo: result.eventDateTo,
      collectedAt,
      attributionStatus: "matched" as const,
      attributionEvidence: [
        `Identifiant athlète IWWF ${officialIdentity.athleteId} confirmé sur le profil officiel.`,
        `Résultat découvert depuis le profil IWWF vérifié de ${officialIdentity.name}.`,
      ],
      logicalKey,
      contentHash: sha256(JSON.stringify({
        excerpt,
        eventDateFrom: result.eventDateFrom,
        eventDateTo: result.eventDateTo,
        articleUrl: result.competitionUrl,
      })),
    };
  }));
  return {
    candidates,
    scannedCount: results.reduce((total, result) => total + result.rounds.length, 0),
    recentCount: recent.reduce((total, result) => total + result.rounds.length, 0),
  };
};

export const iwwfWakesurfCollectorTestUtils = {
  parseResults,
  readOfficialIdentity,
  readDateRange,
};
