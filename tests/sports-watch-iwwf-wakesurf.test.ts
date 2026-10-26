import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  collectIwwfWakesurfCandidates,
  verifyIwwfProfile,
} from "@/lib/sports-watch/iwwf-wakesurf-collector";

const PROFILE_URL = "https://ems.iwwf.sport/Athletes/Profile/SUI982014944";
const profileHtml = readFileSync(
  new URL("./fixtures/iwwf-giuliano-profile.html", import.meta.url),
  "utf8",
);
const athlete = {
  id: "giuliano-muret",
  name: "Giuliano Muret",
  sport: "Wakesurf",
  club: "Aloha Wake à Estavayer-le-Lac",
};
const profile = {
  profileUrl: PROFILE_URL,
  athleteId: "SUI982014944",
  name: "MURET Giuliano",
  birthYear: 2015,
};

const dependencies = (
  html: string,
  now = "2026-10-26T10:00:00.000Z",
) => ({
  fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html, {
    status: 200,
    headers: { "content-type": "text/html" },
  })),
  now: () => new Date(now),
});

describe("IWWF wakesurf sports watch collector", () => {
  it("verifies the stable profile owner identity despite the official surname-first order", async () => {
    await expect(verifyIwwfProfile(athlete, {
      profileUrl: PROFILE_URL,
      dependencies: dependencies(profileHtml),
    })).resolves.toMatchObject({
      athlete,
      officialIdentity: {
        profileUrl: PROFILE_URL,
        athleteId: "SUI982014944",
        name: "MURET Giuliano",
        birthYear: 2015,
      },
    });

    await expect(verifyIwwfProfile(athlete, {
      profileUrl: "https://ems.iwwf.sport/Athletes/Profile/SUI000000000",
      dependencies: dependencies(profileHtml),
    })).rejects.toThrow("ne concorde pas avec l’URL");
  });

  it("keeps the explicit August result as an old fixture without returning it as recent", async () => {
    const result = await collectIwwfWakesurfCandidates(athlete, {
      profile,
      dependencies: dependencies(profileHtml),
    });

    expect(result).toEqual({
      candidates: [],
      scannedCount: 2,
      recentCount: 0,
    });
  });

  it("separates qualifications and final while preserving only explicit scores and ranking", async () => {
    const recentHtml = profileHtml.replace("15 Aug 2026", "20 Oct 2026");
    const result = await collectIwwfWakesurfCandidates(athlete, {
      profile,
      dependencies: dependencies(recentHtml),
    });

    expect(result).toMatchObject({ scannedCount: 2, recentCount: 2 });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.title)).toEqual([
      "Swiss National Championships - Aloha Wake — Under 18 M Skim",
      "Swiss National Championships - Aloha Wake — Under 18 M Skim",
    ]);
    expect(result.candidates[0]).toMatchObject({
      sourceKey: "iwwf-wakesurf",
      sourceUrl: PROFILE_URL,
      articleUrl: "https://ems.iwwf.sport/Competitions/Details/2e958517-8cf0-4236-9206-8a145d75deb2",
      eventDateFrom: "2026-10-20",
      eventDateTo: "2026-10-20",
      resultKind: "individual_result",
      attributionStatus: "matched",
    });
    expect(result.candidates[0].excerpt).toContain("Tour : Qualifications.");
    expect(result.candidates[0].excerpt).toContain("Score explicite : 39,17.");
    expect(result.candidates[0].excerpt).toContain("Classement explicitement indiqué : 2.");
    expect(result.candidates[1].excerpt).toContain("Tour : Final.");
    expect(result.candidates[1].excerpt).toContain("Score explicite : 36,67.");
    expect(result.candidates[0].logicalKey).not.toBe(result.candidates[1].logicalKey);
  });

  it("reports unexpected or refused source responses instead of claiming no result", async () => {
    await expect(collectIwwfWakesurfCandidates(athlete, {
      profile,
      dependencies: dependencies("<html><body>maintenance</body></html>"),
    })).rejects.toThrow("bloc d’identité officiel est absent");

    await expect(collectIwwfWakesurfCandidates(athlete, {
      profile,
      dependencies: {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("Forbidden", { status: 403 })),
        now: () => new Date("2026-10-26T10:00:00.000Z"),
      },
    })).rejects.toThrow("HTTP 403");
  });
});
