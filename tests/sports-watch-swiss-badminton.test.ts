import { describe, expect, it, vi } from "vitest";
import {
  SWISS_BADMINTON_PLAYER_ID,
  SWISS_BADMINTON_PROFILE_URL,
  collectSwissBadmintonCandidates,
} from "@/lib/sports-watch/swiss-badminton-collector";

const athlete = {
  id: "antoine-majeux",
  name: "Antoine Majeux",
  sport: "Badminton",
  club: "BC Bulle",
};

const profileUuid = "E4A0E261-0D72-4F64-AA20-CF9AAB291A68";
const tournamentId = "B2E4D29A-5E0D-4935-B2B3-3A5DD226E8C4";

type FixtureMember = { name: string; id: string };

const matchHtml = ({
  date = "25.10.2026",
  stage = "Ronde van 16",
  teams = [
    [{ name: "Matteo Marmillod", id: "118994" }],
    [{ name: "Antoine Majeux", id: SWISS_BADMINTON_PLAYER_ID }],
  ] as [FixtureMember[], FixtureMember[]],
  winnerTeamIndex = 1,
  scores = [["15", "13"], ["9", "15"], ["15", "17"]],
  includeH2h = true,
}: {
  date?: string;
  stage?: string;
  teams?: [FixtureMember[], FixtureMember[]];
  winnerTeamIndex?: 0 | 1;
  scores?: string[][];
  includeH2h?: boolean;
} = {}) => `
  <div class="match">
    <div class="match__header">
      <ul class="match__header-title"><li><span class="nav-link__value">${stage}</span></li></ul>
    </div>
    <div class="match__body">
      <div class="match__row-wrapper">
        ${teams.map((team, teamIndex) => `
          <div class="match__row ${winnerTeamIndex === teamIndex ? "has-won" : ""}">
            ${team.map((player, playerIndex) =>
              `<a href="/sport/player.aspx?id=${tournamentId}&amp;player=${teamIndex + 1}${playerIndex + 1}">${player.name}</a>`)
              .join("")}
          </div>
        `).join("")}
      </div>
      <div class="match__result">
        ${scores.map(([first, second]) =>
          `<ul class="points"><li>${first}</li><li>${second}</li></ul>`).join("")}
      </div>
      ${includeH2h ? `
        <a href="/head-2-head?OrganizationCode=official&amp;${
          teams.flatMap((team, teamIndex) =>
            team.map((player, playerIndex) =>
              `T${teamIndex + 1}P${playerIndex + 1}MemberID=${player.id}`)).join("&amp;")
        }">H2H</a>
      ` : ""}
    </div>
    <div class="match__footer"><span>${date}</span></div>
  </div>
`;

const eventHtml = (
  code: string,
  draw: number,
  match: string,
  explicitRanking = "",
) => `
  <h4 class="module-divider"><span>Konkurrenz: ${code}</span></h4>
  <h5><a href="/sport/draw.aspx?id=${tournamentId}&amp;draw=${draw}">${code}</a></h5>
  ${match}
  <p>${explicitRanking}</p>
`;

const tournamentHtml = (events: string, title = "Neuch'Cup 2026") => `
  <h4 class="media__title media__title--medium">
    <a href="/sport/tournament?id=${tournamentId}" title="${title}">${title}</a>
  </h4>
  ${events}
`;

const profileHtml = (tournaments: string) => `
  <html>
    <body data-profile="${profileUuid}">
      <h2>Antoine Majeux (${SWISS_BADMINTON_PLAYER_ID})</h2>
      <a href="/association/group/bc-bulle">BC Bulle</a>
      <h3>Turniere</h3>
      ${tournaments}
    </body>
  </html>
`;

const collect = (html: string, now = "2026-10-26T10:00:00.000Z") =>
  collectSwissBadmintonCandidates(athlete, {
    dependencies: {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html, {
        status: 200,
        headers: { "content-type": "text/html" },
      })),
      now: () => new Date(now),
    },
  });

describe("Swiss Badminton sports watch collector", () => {
  it("orients a simple score from Antoine's certain second position", async () => {
    const html = profileHtml(tournamentHtml(eventHtml(
      "SM1",
      1,
      matchHtml(),
      "Classement final : 7e",
    )));
    const result = await collect(html);

    expect(result).toMatchObject({ scannedCount: 1, recentCount: 1 });
    expect(result.candidates[0]).toMatchObject({
      sourceKey: "swiss-badminton",
      sourceUrl: SWISS_BADMINTON_PROFILE_URL,
      articleUrl: `https://sb.tournamentsoftware.com/sport/draw.aspx?id=${tournamentId}&draw=1`,
      title: "Neuch'Cup 2026 — SM1",
      eventDateFrom: "2026-10-25",
      resultKind: "individual_result",
      attributionStatus: "matched",
    });
    expect(result.candidates[0].excerpt).toContain(
      "Ordre officiel : Matteo Marmillod puis Antoine Majeux.",
    );
    expect(result.candidates[0].excerpt).toContain("Vainqueur explicite : Antoine Majeux.");
    expect(result.candidates[0].excerpt).toContain(
      "Scores dans l’ordre officiel : 15-13, 9-15, 15-17.",
    );
    expect(result.candidates[0].excerpt).toContain(
      "Score du point de vue d’Antoine Majeux : 13-15, 15-9, 17-15.",
    );
    expect(result.candidates[0].excerpt).toContain(
      "Classement final explicitement indiqué : 7e.",
    );
  });

  it("keeps partner, opponents, winning team and team-oriented scores for doubles", async () => {
    const doubles = matchHtml({
      date: "24.10.2026",
      teams: [
        [
          { name: "Daniel Günter", id: "97725" },
          { name: "Ethan Roth", id: "202288" },
        ],
        [
          { name: "Antoine Majeux", id: SWISS_BADMINTON_PLAYER_ID },
          { name: "Max Pasquier", id: "202582" },
        ],
      ],
      winnerTeamIndex: 1,
      scores: [["15", "9"], ["8", "15"], ["8", "15"]],
    });
    const result = await collect(profileHtml(tournamentHtml(eventHtml("DM2", 9, doubles))));

    expect(result.candidates[0].resultKind).toBe("collective_result");
    expect(result.candidates[0].excerpt).toContain(
      "Équipe d’Antoine Majeux : Antoine Majeux et Max Pasquier.",
    );
    expect(result.candidates[0].excerpt).toContain("Partenaire d’Antoine Majeux : Max Pasquier.");
    expect(result.candidates[0].excerpt).toContain("Adversaires : Daniel Günter et Ethan Roth.");
    expect(result.candidates[0].excerpt).toContain(
      "Équipe gagnante explicite : Antoine Majeux et Max Pasquier.",
    );
    expect(result.candidates[0].excerpt).toContain(
      "Scores du point de vue de l’équipe d’Antoine Majeux : 9-15, 15-8, 15-8.",
    );
    expect(result.candidates[0].excerpt).not.toContain("Vainqueur explicite : Antoine Majeux.");
  });

  it("keeps both teams and the explicit winning team for mixed doubles", async () => {
    const mixed = matchHtml({
      date: "24.10.2026",
      stage: "Kwartfinale",
      teams: [
        [
          { name: "Antoine Majeux", id: SWISS_BADMINTON_PLAYER_ID },
          { name: "Anja Stehlin", id: "205947" },
        ],
        [
          { name: "Alan Sterchi", id: "113621" },
          { name: "Katarzyna Wojtowicz", id: "106506" },
        ],
      ],
      winnerTeamIndex: 1,
      scores: [["12", "15"], ["10", "15"]],
    });
    const result = await collect(profileHtml(tournamentHtml(eventHtml("DX1", 4, mixed))));

    expect(result.candidates[0].excerpt).toContain("DX1 (mixte)");
    expect(result.candidates[0].excerpt).toContain("Partenaire d’Antoine Majeux : Anja Stehlin.");
    expect(result.candidates[0].excerpt).toContain(
      "Adversaires : Alan Sterchi et Katarzyna Wojtowicz.",
    );
    expect(result.candidates[0].excerpt).toContain(
      "Équipe gagnante explicite : Alan Sterchi et Katarzyna Wojtowicz.",
    );
    expect(result.candidates[0].excerpt).not.toContain("Classement final");
  });

  it("uses the match date for the 30-day window", async () => {
    const oldMatch = matchHtml({ date: "01.08.2026" });
    const result = await collect(profileHtml(tournamentHtml(eventHtml("SM1", 1, oldMatch))));

    expect(result).toEqual({ candidates: [], scannedCount: 1, recentCount: 0 });
  });

  it("deduplicates the same official match discovered twice", async () => {
    const tournament = tournamentHtml(eventHtml("SM1", 1, matchHtml()));
    const result = await collect(profileHtml(`${tournament}${tournament}`));

    expect(result.scannedCount).toBe(2);
    expect(result.recentCount).toBe(1);
    expect(result.candidates).toHaveLength(1);
  });

  it("reports contradictory versions of the same discovered match", async () => {
    const first = tournamentHtml(eventHtml("SM1", 1, matchHtml()));
    const changed = tournamentHtml(eventHtml("SM1", 1, matchHtml({
      scores: [["15", "13"], ["9", "15"], ["14", "17"]],
    })));

    await expect(collect(profileHtml(`${first}${changed}`))).rejects.toThrow(
      "le même match officiel présente des données contradictoires",
    );
  });

  it("reports incomplete or ambiguous team identities", async () => {
    const incomplete = matchHtml({ includeH2h: false });
    await expect(collect(profileHtml(tournamentHtml(eventHtml("DM2", 9, incomplete)))))
      .rejects.toThrow("HTML incomplet");

    const duplicateOfficialId = matchHtml({
      teams: [
        [{ name: "Antoine Majeux", id: SWISS_BADMINTON_PLAYER_ID }],
        [{ name: "Antoine Majeux", id: SWISS_BADMINTON_PLAYER_ID }],
      ],
    });
    await expect(collect(profileHtml(tournamentHtml(eventHtml("SM1", 1, duplicateOfficialId)))))
      .rejects.toThrow("ambigu");
  });

  it("reports an HTTP refusal instead of returning no result", async () => {
    await expect(collectSwissBadmintonCandidates(athlete, {
      dependencies: {
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("Forbidden", { status: 403 })),
        now: () => new Date("2026-10-26T10:00:00.000Z"),
      },
    })).rejects.toMatchObject({ httpStatus: 403 });
  });

  it("rejects a CRM athlete that does not match the configured official pilot", async () => {
    await expect(collectSwissBadmintonCandidates(
      { ...athlete, name: "Autre athlète" },
      {
        dependencies: {
          fetch: vi.fn<typeof fetch>(),
          now: () => new Date("2026-10-26T10:00:00.000Z"),
        },
      },
    )).rejects.toThrow("l’athlète CRM sélectionné ne concorde pas");
  });
});
