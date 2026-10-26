import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  KENPOKAN_FEED_URL,
  collectKenpokanCandidates,
  kenpokanCollectorTestUtils,
} from "@/lib/sports-watch/kenpokan-collector";
import { sportsWatchCollectorTestUtils } from "@/lib/sports-watch/bcbulle-collector";

const feed = readFileSync(
  new URL("./fixtures/kenpokan-feed.xml", import.meta.url),
  "utf8",
);
const historicalArticle = readFileSync(
  new URL("./fixtures/kenpokan-international-cup-2026.html", import.meta.url),
  "utf8",
);
const athlete = {
  id: "timothee-fuchs",
  name: "Timothée Fuchs",
  sport: "Kempo",
  club: "Kenpokandojo",
};

describe("Kenpokan sports watch collector", () => {
  it("keeps the September article as a historical fixture without surfacing archives", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(feed, { status: 200 }),
    );
    const result = await collectKenpokanCandidates(athlete, {
      dependencies: {
        fetch: fetchMock,
        now: () => new Date("2026-10-26T10:00:00.000Z"),
      },
    });

    expect(result).toEqual({ candidates: [], scannedCount: 1, recentCount: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      KENPOKAN_FEED_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ "User-Agent": expect.stringContaining("KLIQUE-OS") }),
      }),
    );
  });

  it("keeps exact sourced context and does not turn a disqualification into a ranking", async () => {
    const recentFeed = feed.replace(
      "Tue, 15 Sep 2026 13:16:17 +0000",
      "Tue, 20 Oct 2026 13:16:17 +0000",
    );
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(recentFeed, { status: 200 }))
      .mockResolvedValueOnce(new Response(historicalArticle, { status: 200 }));
    const result = await collectKenpokanCandidates(athlete, {
      dependencies: {
        fetch: fetchMock,
        now: () => new Date("2026-10-26T10:00:00.000Z"),
      },
    });

    expect(result).toMatchObject({ scannedCount: 1, recentCount: 1 });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceKey: "kenpokan",
      sourceName: "Kenpokan Dojo",
      sourceUrl: KENPOKAN_FEED_URL,
      articleUrl: "https://kenpokan-dojo.ch/international-kempo-cup-2026-albufeira/",
      publicationDate: "2026-10-20T13:16:17.000Z",
      eventDateFrom: "2026-09-12",
      eventDateTo: "2026-09-13",
      resultKind: "news_excerpt",
      attributionStatus: "matched",
    });
    expect(result.candidates[0].excerpt).toContain(
      "Les SturmWargs du Kenpokan Dojo étaient présents avec Timothée Fuchs et Jalen Awais.",
    );
    expect(result.candidates[0].excerpt).not.toMatch(/\b(?:1|2|3)(?:er|e|ème)\s+place\b/i);
  });

  it("structures only a result explicitly attributed to the selected athlete", async () => {
    const item = {
      title: "Résultat explicite",
      articleUrl: "https://kenpokan-dojo.ch/resultat-explicite/",
      publicationDate: "2026-10-20T13:16:17.000Z",
    };
    const candidate = sportsWatchCollectorTestUtils.buildRssCandidate(
      athlete,
      item,
      "<article><p>Kenpokan Dojo : Timothée Fuchs obtient explicitement la 2ème place en Kempo K.O.</p></article>",
      "2026-10-26T10:00:00.000Z",
      kenpokanCollectorTestUtils.source,
    );

    expect(candidate).toMatchObject({
      resultKind: "individual_result",
      attributionStatus: "matched",
    });
    expect(candidate?.excerpt).toBe(
      "Kenpokan Dojo : Timothée Fuchs obtient explicitement la 2ème place en Kempo K.O.",
    );
  });

  it("marks missing dojo concordance as ambiguous and keeps network errors distinct", async () => {
    const candidate = sportsWatchCollectorTestUtils.buildRssCandidate(
      { ...athlete, club: "Club inconnu" },
      {
        title: "Résultat",
        articleUrl: "https://kenpokan-dojo.ch/resultat/",
        publicationDate: "2026-10-20T13:16:17.000Z",
      },
      "<article><p>Timothée Fuchs participe à une compétition de kempo.</p></article>",
      "2026-10-26T10:00:00.000Z",
      kenpokanCollectorTestUtils.source,
    );
    expect(candidate?.attributionStatus).toBe("ambiguous");

    await expect(collectKenpokanCandidates(athlete, {
      dependencies: {
        fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("network down")),
        now: () => new Date("2026-10-26T10:00:00.000Z"),
      },
    })).rejects.toThrow("techniquement inaccessible");
  });
});
