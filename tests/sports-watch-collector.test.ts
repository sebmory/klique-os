import { describe, expect, it, vi } from "vitest";
import {
  BC_BULLE_FEED_URL,
  collectBcBulleCandidates,
  sportsWatchCollectorTestUtils,
} from "@/lib/sports-watch/bcbulle-collector";

const athlete = {
  id: "antoine-majeux",
  name: "Antoine Majeux",
  sport: "Badminton",
  club: "BC Bulle",
};

const articleUrl = "https://bcbulle.ch/resultats-seen-turnier/";
const article = `
  <article>
    <p>Le week-end du 08 au 09 février 2025 s’est tenu Seen-Turnier.</p>
    <ul><li><strong>Antoine Majeux</strong> pour sa 2ème place en simple messieurs catégorie 3</li></ul>
  </article>
`;

const feed = (publishedAt: string) => `
  <rss><channel><item>
    <title>Résultats : Seen-Turnier</title>
    <link>${articleUrl}</link>
    <pubDate>${publishedAt}</pubDate>
  </item></channel></rss>
`;

describe("BC Bulle sports watch collector", () => {
  it("does not silently surface an old result outside the 30-day window", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(feed("Wed, 12 Feb 2025 15:26:03 +0000"), { status: 200 }),
    );

    const result = await collectBcBulleCandidates(athlete, {
      dependencies: {
        fetch: fetchMock,
        now: () => new Date("2026-10-26T10:00:00.000Z"),
      },
    });

    expect(result).toEqual({ candidates: [], scannedCount: 1, recentCount: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      BC_BULLE_FEED_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining("KLIQUE-OS") }),
      }),
    );
  });

  it("extracts only the explicit result and marks missing CRM concordance as ambiguous", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(feed("Tue, 20 Oct 2026 15:26:03 +0000"), { status: 200 }))
      .mockResolvedValueOnce(new Response(article, { status: 200 }));

    const result = await collectBcBulleCandidates(
      { ...athlete, sport: "Tennis", club: "Club inconnu" },
      {
        dependencies: {
          fetch: fetchMock,
          now: () => new Date("2026-10-26T10:00:00.000Z"),
        },
      },
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      articleUrl,
      resultKind: "individual_result",
      eventDateFrom: "2025-02-08",
      eventDateTo: "2025-02-09",
      attributionStatus: "ambiguous",
    });
    expect(result.candidates[0].excerpt).toContain("Antoine Majeux");
    expect(result.candidates[0].excerpt).toContain("2ème place");
    expect(result.candidates[0].attributionEvidence).not.toContain("Le sport CRM concorde avec le badminton.");
  });

  it("keeps exact duplicates stable and changes the content hash for a modified result", () => {
    const item = {
      title: "Résultats : Seen-Turnier",
      articleUrl,
      publicationDate: "2026-10-20T15:26:03.000Z",
    };
    const first = sportsWatchCollectorTestUtils.buildCandidate(
      athlete,
      item,
      article,
      "2026-10-26T10:00:00.000Z",
    );
    const duplicate = sportsWatchCollectorTestUtils.buildCandidate(
      athlete,
      item,
      article,
      "2026-10-26T11:00:00.000Z",
    );
    const modified = sportsWatchCollectorTestUtils.buildCandidate(
      athlete,
      item,
      article.replace("2ème place", "1ère place"),
      "2026-10-26T12:00:00.000Z",
    );

    expect(first).not.toBeNull();
    expect(duplicate?.logicalKey).toBe(first?.logicalKey);
    expect(duplicate?.contentHash).toBe(first?.contentHash);
    expect(modified?.logicalKey).toBe(first?.logicalKey);
    expect(modified?.contentHash).not.toBe(first?.contentHash);
  });
});
