import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  BEBASKET_SOURCE_NAME,
  collectBeBasketCandidates,
  verifyBeBasketBinding,
} from "@/lib/sports-watch/bebasket-collector";

const fixture = (name: string) => readFileSync(
  new URL(`./fixtures/sports-watch/${name}`, import.meta.url),
  "utf8",
);

const athlete = {
  id: "mila-benjak",
  name: "Mila Benjak",
  sport: "Basketball",
  club: "BCF Elfic Fribourg",
};

const calendarUrl = "https://www.bebasket.fr/equipe/bcf-elfic-fribourg/calendrier";

const identity = {
  calendarUrl,
  teamSlug: "bcf-elfic-fribourg",
  teamName: "BCF Elfic Fribourg",
  playerName: "Mila Benjak",
};

type RecordedMatch = {
  url: string;
  calendarTitle: string;
  calendarText: string;
  event: {
    name: string;
    startDate: string;
    homeTeam: { name: string; url: string };
    awayTeam: { name: string; url: string };
  };
  mila?: Record<string, unknown>;
};

type RecordedLot = {
  calendarUrl: string;
  matches: RecordedMatch[];
};

const recordedLot = JSON.parse(
  fixture("bebasket-bcf-elfic-2026-10-27.json"),
) as RecordedLot;

const recordedCalendarHtml = (matches: RecordedMatch[]): string => [
  "<!doctype html><html><body>",
  ...matches.map((match) =>
    `<a href="${new URL(match.url).pathname}" title="${match.calendarTitle}">${match.calendarText}</a>`),
  "</body></html>",
].join("");

const recordedMatchHtml = (
  match: RecordedMatch,
  event: RecordedMatch["event"] = match.event,
): string => {
  const player = match.mila
    ? {
        id: "recorded-mila-benjak",
        player: { firstname: "Mila", lastname: "Benjak", slug: "mila-benjak" },
        playerNumber: "14",
        ...match.mila,
      }
    : null;
  const flight = [
    `76:T,${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      ...event,
    })}`,
    `77:${JSON.stringify(player ? [player] : [])}`,
  ].join("\n");
  return `<!doctype html><html><body><script>self.__next_f.push(${JSON.stringify([1, flight])})</script></body></html>`;
};

describe("BeBasket sports watch collector", () => {
  it("verifies a configurable CRM/team/player binding without a hard-coded player", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(fixture("bebasket-calendar.html"), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const verification = await verifyBeBasketBinding(athlete, {
      calendarUrl,
      teamName: "BCF Elfic Fribourg",
      playerName: athlete.name,
      dependencies: {
        fetch: fetchMock,
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(verification.officialIdentity).toEqual(identity);
    expect(verification.evidence).toContain(
      "BeBasket est une source tierce ; ce rattachement ne constitue pas une corroboration officielle.",
    );
  });

  it("distinguishes a missing team sheet, an absent player, and explicit participation", async () => {
    const responses = new Map([
      [calendarUrl, fixture("bebasket-calendar.html")],
      ["https://www.bebasket.fr/match/11111111-1111-4111-8111-111111111111", fixture("bebasket-sheet-absent.html")],
      ["https://www.bebasket.fr/match/22222222-2222-4222-8222-222222222222", fixture("bebasket-player-absent.html")],
      ["https://www.bebasket.fr/match/33333333-3333-4333-8333-333333333333", fixture("bebasket-participation.html")],
    ]);
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const body = responses.get(url);
      return body
        ? new Response(body, { status: 200, headers: { "Content-Type": "text/html" } })
        : new Response("Not found", { status: 404 });
    });

    const result = await collectBeBasketCandidates(athlete, {
      identity,
      dependencies: {
        fetch: fetchMock,
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(result.observations.map((item) => item.status)).toEqual([
      "sheet_absent",
      "player_absent",
      "participation_explicit",
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceKey: "bebasket",
      sourceName: BEBASKET_SOURCE_NAME,
      sourceUrl: calendarUrl,
      articleUrl: "https://www.bebasket.fr/match/33333333-3333-4333-8333-333333333333",
      eventDateFrom: "2026-10-25",
      attributionStatus: "matched",
    });
    expect(result.candidates[0].excerpt).toContain("PTS 1");
    expect(result.candidates[0].excerpt).toContain("LF 1/2");
    expect(result.candidates[0].excerpt).not.toContain("PD 0");
    expect(result.candidates[0].excerpt).toContain("Statut factuel : non vérifié");
  });

  it("keeps deduplication stable and versions a changed explicit value", async () => {
    const calendar = fixture("bebasket-calendar.html")
      .replace(/<a href="\/match\/11111111[\s\S]*?<\/a>/, "")
      .replace(/<a href="\/match\/22222222[\s\S]*?<\/a>/, "");
    const match = fixture("bebasket-participation.html");
    const collect = async (matchHtml: string) => collectBeBasketCandidates(athlete, {
      identity,
      dependencies: {
        fetch: vi.fn<typeof fetch>(async (input) =>
          new Response(String(input) === calendarUrl ? calendar : matchHtml, { status: 200 })),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    const first = (await collect(match)).candidates[0];
    const duplicate = (await collect(match)).candidates[0];
    const changed = (await collect(match.replace("\\\"points\\\":1", "\\\"points\\\":2"))).candidates[0];

    expect(duplicate.logicalKey).toBe(first.logicalKey);
    expect(duplicate.contentHash).toBe(first.contentHash);
    expect(changed.logicalKey).toBe(first.logicalKey);
    expect(changed.contentHash).not.toBe(first.contentHash);
  });

  it("treats an explicit 0:00 as listed without established participation", async () => {
    const calendar = fixture("bebasket-calendar.html")
      .replace(/<a href="\/match\/11111111[\s\S]*?<\/a>/, "")
      .replace(/<a href="\/match\/22222222[\s\S]*?<\/a>/, "");
    const listedOnly = fixture("bebasket-participation.html")
      .replace("\\\"timePlayed\\\":136", "\\\"timePlayed\\\":0")
      .replace("\\\"points\\\":1", "\\\"points\\\":0");
    const result = await collectBeBasketCandidates(athlete, {
      identity,
      dependencies: {
        fetch: vi.fn<typeof fetch>(async (input) =>
          new Response(String(input) === calendarUrl ? calendar : listedOnly, { status: 200 })),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(result.observations).toEqual([
      expect.objectContaining({ status: "player_listed_without_participation" }),
    ]);
    expect(result.candidates).toEqual([]);
  });

  it("collects the recorded 30-day lot once per URL and resolves Hélios VS Basket by stable team slug", async () => {
    const responses = new Map<string, string>([
      [recordedLot.calendarUrl, recordedCalendarHtml(recordedLot.matches)],
      ...recordedLot.matches.map((match) => [match.url, recordedMatchHtml(match)] as const),
    ]);
    const reads = new Map<string, number>();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      reads.set(url, (reads.get(url) ?? 0) + 1);
      const body = responses.get(url);
      return body
        ? new Response(body, { status: 200, headers: { "Content-Type": "text/html" } })
        : new Response("Not found", { status: 404 });
    });

    const result = await collectBeBasketCandidates(athlete, {
      identity,
      dependencies: {
        fetch: fetchMock,
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(result.scannedCount).toBe(11);
    expect(result.recentCount).toBe(8);
    expect(result.candidates).toHaveLength(6);
    expect(result.observations.filter((item) =>
      item.status === "player_listed_without_participation")).toHaveLength(2);
    expect(result.observations).not.toContainEqual(
      expect.objectContaining({ status: "team_ambiguous" }),
    );
    const helios = result.candidates.find((candidate) =>
      candidate.articleUrl.endsWith("01a11769-71f9-7ecc-82fc-4b37e5b91b65"));
    expect(helios?.excerpt).toContain("MIN 11:05");
    expect(helios?.excerpt).toContain("PTS 9");
    expect(helios?.excerpt).toContain("2PTS 3/3");
    expect(helios?.excerpt).toContain("3PTS 1/2");
    expect(helios?.excerpt).toContain("Source : BeBasket — source tierce");
    expect([...reads.entries()]).toEqual(
      expect.arrayContaining([...responses.keys()].map((url) => [url, 1])),
    );
    expect(reads.size).toBe(responses.size);
  });

  it("skips only an ambiguous sheet and exposes its URL in an explicit warning", async () => {
    const match = recordedLot.matches.find((item) =>
      item.url.endsWith("01a11769-71f9-7ecc-82fc-4b37e5b91b65"));
    expect(match).toBeDefined();
    if (!match) throw new Error("Recorded Hélios fixture is missing.");
    const ambiguousEvent = {
      ...match.event,
      awayTeam: {
        name: match.event.awayTeam.name,
        url: "https://www.bebasket.fr/equipe/autre-equipe",
      },
    };
    const responses = new Map([
      [calendarUrl, recordedCalendarHtml([match])],
      [match.url, recordedMatchHtml(match, ambiguousEvent)],
    ]);

    const result = await collectBeBasketCandidates(athlete, {
      identity,
      dependencies: {
        fetch: vi.fn<typeof fetch>(async (input) =>
          new Response(responses.get(String(input)), { status: 200 })),
        now: () => new Date("2026-10-27T10:00:00.000Z"),
      },
    });

    expect(result.candidates).toEqual([]);
    expect(result.observations).toEqual([
      expect.objectContaining({
        matchUrl: match.url,
        status: "team_ambiguous",
        warning: expect.stringContaining(match.url),
      }),
    ]);
  });
});
