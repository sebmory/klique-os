import { describe, expect, it } from "vitest";
import {
  buildSportsWatchAthleteGroups,
  buildSportsWatchCandidateViews,
  buildSportsWatchTournamentGroups,
  sportsWatchPresentationTestUtils,
} from "@/lib/sports-watch/presentation";
import type { SportsWatchCandidate } from "@/types/sports-watch";

const tournamentId = "B2E4D29A-5E0D-4935-B2B3-3A5DD226E8C4";

const candidate = (
  id: string,
  title: string,
  excerpt: string,
  draw: number,
  date: string,
  overrides: Partial<SportsWatchCandidate> = {},
): SportsWatchCandidate => ({
  id,
  athleteId: "antoine-majeux",
  athleteName: "Antoine Majeux",
  sourceName: "Swiss Badminton / Tournamentsoftware",
  sourceUrl: "https://sb.tournamentsoftware.com/player-profile/official",
  articleUrl: `https://sb.tournamentsoftware.com/sport/draw.aspx?id=${tournamentId}&draw=${draw}`,
  title,
  excerpt,
  resultKind: title.endsWith("SM1") ? "individual_result" : "collective_result",
  publicationDate: null,
  eventDateFrom: date,
  eventDateTo: date,
  collectedAt: "2026-10-26T10:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: ["Identifiant officiel 206063."],
  verificationStatus: "unverified",
  adminStatus: "pending",
  supersedesCandidateId: null,
  version: 1,
  ...overrides,
});

const simpleExcerpt = (
  round: string,
  opponent: string,
  winner: string,
  score: string,
) => `Neuch'Cup 2026 — SM1 (simple) — ${round}. Ordre officiel : Antoine Majeux puis ${opponent}. Vainqueur explicite : ${winner}. Scores dans l’ordre officiel : ${score}. Score du point de vue d’Antoine Majeux : ${score}.`;

const teamExcerpt = (
  eventCode: "DM2" | "DX1",
  discipline: "double" | "mixte",
  round: string,
  partner: string,
  opponents: string,
  winningTeam: string,
  score: string,
) => `Neuch'Cup 2026 — ${eventCode} (${discipline}) — ${round}. Équipe 1 officielle : Antoine Majeux et ${partner}. Équipe 2 officielle : ${opponents}. Équipe d’Antoine Majeux : Antoine Majeux et ${partner}. Partenaire d’Antoine Majeux : ${partner}. Adversaires : ${opponents}. Équipe gagnante explicite : ${winningTeam}. Scores dans l’ordre officiel des équipes : ${score}. Scores du point de vue de l’équipe d’Antoine Majeux : ${score}.`;

const twelveMatches = (): SportsWatchCandidate[] => {
  const rows: SportsWatchCandidate[] = [];
  const simpleWinners = ["Antoine Majeux", "Pranav Khot", "Benjamin Cupillard", "Antoine Majeux"];
  ["Ronde van 16", "Kwartfinale", "5e/8e plaats", "7e/8e plaats"].forEach((round, index) => {
    rows.push(candidate(
      `simple-${index}`,
      "Neuch'Cup 2026 — SM1",
      simpleExcerpt(round, `Adversaire ${index + 1}`, simpleWinners[index], "15-12, 15-10"),
      1,
      "2026-10-25",
    ));
  });
  const doubleWinners = [
    "Antoine Majeux et Max Pasquier",
    "Antoine Majeux et Max Pasquier",
    "Antoine Majeux et Max Pasquier",
    "Jonathan Muller et Antoine Tran",
  ];
  ["Ronde van 16", "Kwartfinale", "Halve finale", "Finale"].forEach((round, index) => {
    rows.push(candidate(
      `double-${index}`,
      "Neuch'Cup 2026 — DM2",
      teamExcerpt(
        "DM2",
        "double",
        round,
        "Max Pasquier",
        `Adversaire ${index + 1}A et Adversaire ${index + 1}B`,
        doubleWinners[index],
        "15-9, 15-8",
      ),
      9,
      "2026-10-24",
    ));
  });
  const mixedWinners = [
    "Antoine Majeux et Anja Stehlin",
    "Alan Sterchi et Katarzyna Wojtowicz",
    "Rémi Bloch et Colombine Verzat",
    "Antoine Majeux et Anja Stehlin",
  ];
  ["Ronde van 16", "Kwartfinale", "5e/8e plaats", "7e/8e plaats"].forEach((round, index) => {
    rows.push(candidate(
      `mixed-${index}`,
      "Neuch'Cup 2026 — DX1",
      teamExcerpt(
        "DX1",
        "mixte",
        round,
        "Anja Stehlin",
        `Adversaire ${index + 1}A et Adversaire ${index + 1}B`,
        mixedWinners[index],
        "15-10, 15-12",
      ),
      4,
      "2026-10-24",
    ));
  });
  return rows;
};

describe("sports watch tournament presentation", () => {
  it("groups 12 matches by athlete and tournament edition with faithful summaries", () => {
    const groups = buildSportsWatchTournamentGroups(twelveMatches());

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      athleteName: "Antoine Majeux",
      competitionName: "Neuch'Cup 2026",
      eventDateFrom: "2026-10-24",
      eventDateTo: "2026-10-25",
      matchCount: 12,
      unstructuredCount: 0,
    });
    expect(groups[0].disciplines).toEqual([
      expect.objectContaining({ discipline: "simple", collectedCount: 4, victories: 2, defeats: 2 }),
      expect.objectContaining({ discipline: "double", collectedCount: 4, victories: 3, defeats: 1 }),
      expect.objectContaining({ discipline: "mixte", collectedCount: 4, victories: 2, defeats: 2 }),
    ]);
    expect(groups[0].disciplines.flatMap((group) => group.matches)).toHaveLength(12);
  });

  it("does not merge two tournament editions sharing the same name", () => {
    const first = twelveMatches()[0];
    const second = {
      ...first,
      id: "other-edition",
      articleUrl: first.articleUrl.replace(tournamentId, "OTHER-EDITION-ID"),
    };

    expect(buildSportsWatchTournamentGroups([first, second])).toHaveLength(2);
  });

  it("groups by stable athlete ID and counts only latest pending and validated versions", () => {
    const original = candidate(
      "original",
      "Résultat A",
      "Détail A.",
      1,
      "2026-10-24",
      { adminStatus: "exploited" },
    );
    const successor = candidate(
      "successor",
      "Résultat A",
      "Détail A modifié.",
      1,
      "2026-10-25",
      { supersedesCandidateId: original.id },
    );
    const validated = candidate(
      "validated",
      "Résultat B",
      "Détail B.",
      2,
      "2026-10-23",
      { adminStatus: "validated" },
    );
    const namesake = candidate(
      "namesake",
      "Résultat C",
      "Détail C.",
      3,
      "2026-10-26",
      { athleteId: "other-athlete", athleteName: "Antoine Majeux" },
    );
    const candidates = [original, successor, validated, namesake];
    const views = buildSportsWatchCandidateViews(candidates);
    const currentGroups = buildSportsWatchAthleteGroups(views.current, candidates);

    expect(currentGroups).toHaveLength(2);
    expect(currentGroups.map((group) => group.athleteId)).toEqual([
      "other-athlete",
      "antoine-majeux",
    ]);
    expect(currentGroups.find((group) => group.athleteId === "antoine-majeux")).toMatchObject({
      pendingCount: 1,
      exploitableCount: 1,
    });
    expect(views.history.map((item) => item.id)).toContain("original");
    expect(views.current.map((item) => item.id)).not.toContain("original");
  });

  it("keeps every version actionable but excludes superseded versions from summaries", () => {
    const original = twelveMatches()[0];
    const successor = {
      ...original,
      id: "simple-successor",
      supersedesCandidateId: original.id,
      excerpt: original.excerpt.replace("15-12, 15-10", "15-11, 15-9"),
    };
    const legacy = candidate(
      "legacy",
      "Ancien résultat",
      "Extrait historique non structuré conservé tel quel.",
      1,
      "2026-10-25",
    );
    const group = buildSportsWatchTournamentGroups([original, successor, legacy])[0];

    expect(group.matchCount).toBe(1);
    expect(group.disciplines[0].matches).toHaveLength(2);
    expect(group.disciplines[0].matches.find((match) => match.candidate.id === original.id))
      .toMatchObject({ countedInSummary: false });
    expect(group.unstructuredCandidates).toEqual([
      expect.objectContaining({ candidate: expect.objectContaining({ id: "legacy" }) }),
    ]);
    expect(group.unstructuredCount).toBe(1);
  });

  it("distinguishes forfeits, retirements and unknown scores", () => {
    const rows = [
      candidate(
        "forfeit",
        "Neuch'Cup 2026 — SM1",
        simpleExcerpt("Finale", "Adversaire A", "Antoine Majeux", "WO"),
        1,
        "2026-10-25",
      ),
      candidate(
        "retirement",
        "Neuch'Cup 2026 — SM1",
        simpleExcerpt("Finale", "Adversaire B", "Adversaire B", "RET"),
        1,
        "2026-10-25",
      ),
      candidate(
        "unknown",
        "Neuch'Cup 2026 — SM1",
        simpleExcerpt("Tour suisse", "Adversaire C", "Antoine Majeux", "score indisponible"),
        1,
        "2026-10-25",
      ),
    ];
    const discipline = buildSportsWatchTournamentGroups(rows)[0].disciplines[0];

    expect(discipline).toMatchObject({
      collectedCount: 3,
      victories: 0,
      defeats: 0,
      forfeits: 1,
      retirements: 1,
      unknown: 1,
    });
    expect(discipline.matches.map((match) => match.outcomeLabel)).toEqual([
      "Victoire par forfait",
      "Défaite sur abandon",
      "Résultat non standard",
    ]);
    expect(sportsWatchPresentationTestUtils.translateRound("Tour suisse")).toBe("Tour suisse");
  });

  it("groups explicit IWWF rounds as compact sourced results without inventing match data", () => {
    const base = candidate(
      "iwwf-qualifications",
      "Swiss National Championships - Aloha Wake — Under 18 M Skim",
      "Swiss National Championships - Aloha Wake — 26SUI009. Discipline : Wakesurf. Catégorie : Under 18 M Skim. Tour : Qualifications. Score explicite : 39,17. Classement explicitement indiqué : 2.",
      1,
      "2026-10-20",
      {
        athleteId: "giuliano-muret",
        athleteName: "Giuliano Muret",
        sourceName: "IWWF Event Management System",
        sourceUrl: "https://ems.iwwf.sport/Athletes/Profile/SUI982014944",
        articleUrl: "https://ems.iwwf.sport/Competitions/Details/2e958517-8cf0-4236-9206-8a145d75deb2",
      },
    );
    const final = {
      ...base,
      id: "iwwf-final",
      excerpt: base.excerpt
        .replace("Qualifications", "Final")
        .replace("39,17", "36,67"),
    };

    expect(buildSportsWatchTournamentGroups([base, final])).toEqual([
      expect.objectContaining({
        athleteName: "Giuliano Muret",
        competitionName: "Swiss National Championships - Aloha Wake — Under 18 M Skim",
        matchCount: 0,
        unstructuredCount: 2,
        disciplines: [],
        unstructuredCandidates: [
          expect.objectContaining({ candidate: expect.objectContaining({ id: "iwwf-qualifications" }) }),
          expect.objectContaining({ candidate: expect.objectContaining({ id: "iwwf-final" }) }),
        ],
      }),
    ]);
  });
});
