import { createHash } from "node:crypto";
import type {
  SportsWatchAttributionStatus,
  SportsWatchResultKind,
} from "@/types/sports-watch";

export const BC_BULLE_SOURCE_NAME = "Badminton Club Bulle";
export const BC_BULLE_FEED_URL = "https://bcbulle.ch/feed/";
export const SPORTS_WATCH_USER_AGENT = "KLIQUE-OS-Sports-Watch/1.0 (+https://app.klique.ch)";

const SOURCE_HOSTNAME = "bcbulle.ch";
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_FEED_ITEMS = 10;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const fixtureMonths = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export type SportsWatchAthleteSnapshot = {
  id: string;
  name: string;
  sport: string;
  club: string;
};

export type CollectedSportsWatchCandidate = {
  sourceKey: string;
  athlete: SportsWatchAthleteSnapshot;
  sourceName: string;
  sourceUrl: string;
  articleUrl: string;
  title: string;
  excerpt: string;
  resultKind: SportsWatchResultKind;
  publicationDate: string | null;
  eventDateFrom: string | null;
  eventDateTo: string | null;
  collectedAt: string;
  attributionStatus: SportsWatchAttributionStatus;
  attributionEvidence: string[];
  logicalKey: string;
  contentHash: string;
};

export type BcBulleCollectionResult = {
  candidates: CollectedSportsWatchCandidate[];
  scannedCount: number;
  recentCount: number;
};

type CollectorDependencies = {
  fetch: typeof fetch;
  now: () => Date;
};

export type RssSportsWatchSourceConfig = {
  key: string;
  name: string;
  feedUrl: string;
  hostname: string;
  sportLabels: string[];
  clubLabels: string[];
  requireArticleClubContext?: boolean;
};

const BC_BULLE_RSS_SOURCE: RssSportsWatchSourceConfig = {
  key: "bc-bulle",
  name: BC_BULLE_SOURCE_NAME,
  feedUrl: BC_BULLE_FEED_URL,
  hostname: SOURCE_HOSTNAME,
  sportLabels: ["badminton"],
  clubLabels: ["bulle"],
};

export class SportsWatchSourceError extends Error {
  constructor(message: string, public readonly httpStatus?: number) {
    super(message);
    this.name = "SportsWatchSourceError";
  }
}

const localFixtureMode = (): "recent" | "empty" | null => {
  if (process.env.NODE_ENV !== "development") return null;
  const value = process.env.KLIQUE_SPORTS_WATCH_LOCAL_FIXTURE;
  return value === "recent" || value === "empty" ? value : null;
};

const normalize = (value: unknown): string => String(value ?? "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("fr")
  .replace(/\s+/g, " ");

const includesExactName = (text: string, athleteName: string): boolean => {
  const escapedName = normalize(athleteName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escapedName) && new RegExp(`(?:^|\\s)${escapedName}(?:$|\\s|[.,;:!?])`).test(normalize(text));
};

const decodeHtml = (value: string): string => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
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
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(?:p|li|h[1-6])>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/[ \t]+/g, " ")
  .replace(/\s*\n\s*/g, "\n")
  .trim();

const readXmlTag = (item: string, tag: string): string => {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? toPlainText(match[1]) : "";
};

const toIsoTimestamp = (value: string): string | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const safeSourceArticleUrl = (
  value: string,
  source: RssSportsWatchSourceConfig,
): string | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== source.hostname) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const fetchBoundedText = async (
  url: string,
  dependencies: CollectorDependencies,
  source: RssSportsWatchSourceConfig,
): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await dependencies.fetch(url, {
      headers: {
        Accept: "text/html, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "User-Agent": SPORTS_WATCH_USER_AGENT,
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new SportsWatchSourceError(
        `La source ${source.name} a refusé la lecture (HTTP ${response.status}).`,
        response.status,
      );
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new SportsWatchSourceError("La réponse de la source dépasse la taille autorisée.");
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
      throw new SportsWatchSourceError("La réponse de la source dépasse la taille autorisée.");
    }
    return body;
  } catch (error) {
    if (error instanceof SportsWatchSourceError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SportsWatchSourceError("La lecture de la source a dépassé le délai autorisé.");
    }
    throw new SportsWatchSourceError(`La source ${source.name} est techniquement inaccessible.`);
  } finally {
    clearTimeout(timeout);
  }
};

const frenchMonths: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

const buildIsoDate = (day: number, monthLabel: string, year: number): string | null => {
  const month = frenchMonths[normalize(monthLabel)];
  if (!month) return null;
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
};

const extractEventDates = (text: string): { from: string | null; to: string | null } => {
  const range = normalize(text).match(
    /(?:week-end du|du)\s+(\d{1,2})\s+(?:au|a|-)\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/,
  );
  if (range) {
    return {
      from: buildIsoDate(Number(range[1]), range[3], Number(range[4])),
      to: buildIsoDate(Number(range[2]), range[3], Number(range[4])),
    };
  }
  const joinedRange = normalize(text).match(
    /(?:les|du)\s+(\d{1,2})\s+et\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/,
  );
  if (joinedRange) {
    return {
      from: buildIsoDate(Number(joinedRange[1]), joinedRange[3], Number(joinedRange[4])),
      to: buildIsoDate(Number(joinedRange[2]), joinedRange[3], Number(joinedRange[4])),
    };
  }
  const single = normalize(text).match(/(?:le|du)\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  const date = single ? buildIsoDate(Number(single[1]), single[2], Number(single[3])) : null;
  return { from: date, to: date };
};

const excerptAroundName = (text: string, athleteName: string): string => {
  const lowerText = normalize(text);
  const lowerName = normalize(athleteName);
  const normalizedIndex = lowerText.indexOf(lowerName);
  if (normalizedIndex < 0) return text.slice(0, 360).trim();

  const words = text.split(/\s+/);
  const nameWords = athleteName.trim().split(/\s+/);
  const start = words.findIndex((_, index) =>
    normalize(words.slice(index, index + nameWords.length).join(" ")).includes(lowerName));
  if (start < 0) return text.slice(0, 360).trim();
  return words.slice(Math.max(0, start - 18), start + nameWords.length + 32).join(" ").slice(0, 420).trim();
};

const classifyExplicitInformation = (excerpt: string): SportsWatchResultKind => {
  const value = normalize(excerpt);
  if (/\d{1,2}(?:er|re|e|eme)\s+place\b/.test(value)) return "individual_result";
  if (/\b(?:victoire|defaite|match nul)\b.*\b\d+\s*[-:]\s*\d+\b/.test(value)) return "collective_result";
  if (/\b(?:participe|participera|selectionne|selectionnee|engage|engagee)\b/.test(value)) return "participation";
  return "news_excerpt";
};

const buildAttribution = (
  athlete: SportsWatchAthleteSnapshot,
  articleText: string,
  source: RssSportsWatchSourceConfig,
): { status: SportsWatchAttributionStatus; evidence: string[] } => {
  const evidence = [`Nom complet présent dans la publication officielle de ${source.name}.`];
  const sportMatches = source.sportLabels.some((label) => normalize(athlete.sport).includes(normalize(label)));
  const crmClubMatches = source.clubLabels.some((label) => normalize(athlete.club).includes(normalize(label)));
  const articleContextMatches = !source.requireArticleClubContext
    || source.clubLabels.some((label) => normalize(articleText).includes(normalize(label)));
  if (sportMatches) evidence.push(`Le sport CRM concorde avec ${source.name}.`);
  if (crmClubMatches && articleContextMatches) {
    evidence.push(`Le club CRM et le contexte de la publication concordent avec ${source.name}.`);
  }
  return {
    status: sportMatches && crmClubMatches && articleContextMatches ? "matched" : "ambiguous",
    evidence,
  };
};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const buildRssCandidate = (
  athlete: SportsWatchAthleteSnapshot,
  item: { title: string; articleUrl: string; publicationDate: string },
  articleHtml: string,
  collectedAt: string,
  source: RssSportsWatchSourceConfig,
): CollectedSportsWatchCandidate | null => {
  const articleText = toPlainText(articleHtml);
  if (!includesExactName(articleText, athlete.name)) return null;

  const excerpt = excerptAroundName(articleText, athlete.name);
  const eventDates = extractEventDates(articleText);
  const attribution = buildAttribution(athlete, articleText, source);
  const resultKind = classifyExplicitInformation(excerpt);
  const logicalKey = sha256(`${athlete.id}|${item.articleUrl}`);
  const contentHash = sha256(JSON.stringify({
    title: item.title,
    excerpt,
    resultKind,
    publicationDate: item.publicationDate,
    eventDateFrom: eventDates.from,
    eventDateTo: eventDates.to,
  }));

  return {
    sourceKey: source.key,
    athlete,
    sourceName: source.name,
    sourceUrl: source.feedUrl,
    articleUrl: item.articleUrl,
    title: item.title,
    excerpt,
    resultKind,
    publicationDate: item.publicationDate,
    eventDateFrom: eventDates.from,
    eventDateTo: eventDates.to,
    collectedAt,
    attributionStatus: attribution.status,
    attributionEvidence: attribution.evidence,
    logicalKey,
    contentHash,
  };
};

const buildCandidate = (
  athlete: SportsWatchAthleteSnapshot,
  item: { title: string; articleUrl: string; publicationDate: string },
  articleHtml: string,
  collectedAt: string,
): CollectedSportsWatchCandidate | null =>
  buildRssCandidate(athlete, item, articleHtml, collectedAt, BC_BULLE_RSS_SOURCE);

export const collectRssSportsWatchCandidates = async (
  athlete: SportsWatchAthleteSnapshot,
  source: RssSportsWatchSourceConfig,
  options: {
    lookbackDays?: number;
    dependencies?: Partial<CollectorDependencies>;
  } = {},
): Promise<BcBulleCollectionResult> => {
  const dependencies: CollectorDependencies = {
    fetch: options.dependencies?.fetch ?? fetch,
    now: options.dependencies?.now ?? (() => new Date()),
  };
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const collectedAtDate = dependencies.now();
  const collectedAt = collectedAtDate.toISOString();
  const cutoff = collectedAtDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
  const feed = await fetchBoundedText(source.feedUrl, dependencies, source);
  const items = Array.from(feed.matchAll(/<item\b[\s\S]*?<\/item>/gi))
    .slice(0, MAX_FEED_ITEMS)
    .map((match) => {
      const articleUrl = safeSourceArticleUrl(readXmlTag(match[0], "link"), source);
      const publicationDate = toIsoTimestamp(readXmlTag(match[0], "pubDate"));
      return {
        title: readXmlTag(match[0], "title"),
        articleUrl,
        publicationDate,
      };
    });

  const recentItems = items.filter((item) =>
    item.articleUrl
    && item.publicationDate
    && new Date(item.publicationDate).getTime() >= cutoff
    && new Date(item.publicationDate).getTime() <= collectedAtDate.getTime());
  const candidates: CollectedSportsWatchCandidate[] = [];
  for (const item of recentItems) {
    if (!item.articleUrl || !item.publicationDate) continue;
    const articleHtml = await fetchBoundedText(item.articleUrl, dependencies, source);
    const candidate = buildRssCandidate(
      athlete,
      { title: item.title, articleUrl: item.articleUrl, publicationDate: item.publicationDate },
      articleHtml,
      collectedAt,
      source,
    );
    if (candidate) candidates.push(candidate);
  }

  return {
    candidates,
    scannedCount: items.length,
    recentCount: recentItems.length,
  };
};

export const collectBcBulleCandidates = async (
  athlete: SportsWatchAthleteSnapshot,
  options: {
    lookbackDays?: number;
    dependencies?: Partial<CollectorDependencies>;
  } = {},
): Promise<BcBulleCollectionResult> => {
  const dependencies: CollectorDependencies = {
    fetch: options.dependencies?.fetch ?? fetch,
    now: options.dependencies?.now ?? (() => new Date()),
  };
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const collectedAtDate = dependencies.now();
  const collectedAt = collectedAtDate.toISOString();
  const fixtureMode = localFixtureMode();
  if (fixtureMode === "empty") {
    return { candidates: [], scannedCount: 0, recentCount: 0 };
  }
  if (fixtureMode === "recent") {
    const publicationDate = new Date(collectedAtDate.getTime() - 24 * 60 * 60 * 1000);
    publicationDate.setUTCHours(0, 0, 0, 0);
    const eventDate = new Date(collectedAtDate.getTime() - 2 * 24 * 60 * 60 * 1000);
    const articleUrl = "https://bcbulle.ch/fixture-locale-fictive/";
    const articleHtml = `
      <article>
        <p>Fixture locale explicitement fictive, sans valeur sportive réelle.</p>
        <p>Le ${eventDate.getUTCDate()} ${fixtureMonths[eventDate.getUTCMonth()]} ${eventDate.getUTCFullYear()},
        ${athlete.name} obtient explicitement la 2ème place en simple catégorie test.</p>
      </article>
    `;
    const candidate = buildCandidate(
      athlete,
      {
        title: "[FIXTURE FICTIVE] Résultat BC Bulle de validation locale",
        articleUrl,
        publicationDate: publicationDate.toISOString(),
      },
      articleHtml,
      collectedAt,
    );
    return {
      candidates: candidate ? [candidate] : [],
      scannedCount: 1,
      recentCount: 1,
    };
  }
  return collectRssSportsWatchCandidates(athlete, BC_BULLE_RSS_SOURCE, {
    lookbackDays,
    dependencies,
  });
};

export const sportsWatchCollectorTestUtils = {
  buildCandidate,
  buildRssCandidate,
  extractEventDates,
  toPlainText,
};
