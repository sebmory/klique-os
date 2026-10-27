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
});
