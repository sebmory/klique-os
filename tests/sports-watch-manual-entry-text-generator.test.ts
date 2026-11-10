import { describe, expect, it } from "vitest";
import {
  generateSportsWatchManualText,
  type SportsWatchManualTextGenerationInput,
} from "@/lib/sports-watch/manual-entry-text-generator";

const football = (
  overrides: Partial<SportsWatchManualTextGenerationInput["football"]> = {},
): SportsWatchManualTextGenerationInput => ({
  athlete: {
    name: "Matheus Monteiro",
    sport: "Football",
    club: "FC Richemond",
  },
  eventDate: "2026-10-31",
  newsType: "result_match",
  competition: "2e ligue fribourgeoise",
  opponent: "FC Marly",
  score: "3-1",
  football: {
    team: "FC Richemond",
    participationStatus: "unknown",
    minutes: null,
    goals: null,
    assists: null,
    yellowCards: null,
    redCards: null,
    opponent: "FC Marly",
    score: "3-1",
    competition: "2e ligue fribourgeoise",
    footstatsReference: null,
    footstatsPlayerId: null,
    footstatsTeamId: null,
    ...overrides,
  },
  basketball: null,
  statistics: [],
});

const basketball = (
  overrides: Partial<SportsWatchManualTextGenerationInput> = {},
): SportsWatchManualTextGenerationInput => ({
  athlete: {
    name: "Mila Benjak",
    sport: "Basketball",
    club: "Elfic Fribourg",
  },
  eventDate: "2026-11-08",
  newsType: "individual_performance",
  competition: "SBLW",
  opponent: "Hélios",
  score: null,
  football: null,
  basketball: {
    starter: null,
    minutes: 18,
    points: 9,
    rebounds: null,
    assists: null,
    steals: null,
    blocks: null,
  },
  statistics: [],
  ...overrides,
});

describe("sports watch manual entry deterministic text generation", () => {
  it("generates a football victory without inventing participation", () => {
    expect(generateSportsWatchManualText(football())).toEqual({
      title: "Victoire 3–1 du FC Richemond face à FC Marly",
      summary: "L’équipe FC Richemond s’est imposée 3–1 face à FC Marly, le 31 octobre 2026, en 2e ligue fribourgeoise. La participation de Matheus Monteiro n’est pas renseignée.",
    });
  });

  it.each([
    ["1-3", "Défaite 1–3 du FC Richemond", "s’est inclinée 1–3"],
    ["2-2", "Match nul 2–2 du FC Richemond", "a fait match nul 2–2"],
  ])("handles football score %s deterministically", (score, expectedTitle, expectedSummary) => {
    const generated = generateSportsWatchManualText(football({ score }));
    expect(generated?.title).toContain(expectedTitle);
    expect(generated?.summary).toContain(expectedSummary);
  });

  it("does not claim an outcome when the score cannot be parsed", () => {
    const generated = generateSportsWatchManualText(football({ score: "3-1 ap." }));
    expect(generated?.title).not.toMatch(/Victoire|Défaite|Match nul/);
    expect(generated?.summary).not.toMatch(/s’est imposée|s’est inclinée|fait match nul/);
    expect(generated?.summary).toContain("résultat 3-1 ap.");
  });

  it("handles starter, substitute entry and unused substitute separately", () => {
    const starter = generateSportsWatchManualText(football({
      participationStatus: "starter",
      minutes: 90,
    }));
    expect(starter?.title).toBe("Matheus Monteiro titulaire face à FC Marly");
    expect(starter?.summary).toContain("était titulaire");
    expect(starter?.summary).toContain("90 minutes");

    const entered = generateSportsWatchManualText(football({
      participationStatus: "entered",
      minutes: 21,
    }));
    expect(entered?.title).toBe("Matheus Monteiro entre en jeu face à FC Marly");
    expect(entered?.summary).toContain("est entré en jeu");

    const unused = generateSportsWatchManualText(football({
      participationStatus: "unused_substitute",
    }));
    expect(unused?.title).toBe("Matheus Monteiro sur la feuille face à FC Marly");
    expect(unused?.summary).toContain("sans entrer en jeu");
  });

  it("uses singular and plural goals without mentioning explicit zero", () => {
    const scorer = generateSportsWatchManualText(football({
      participationStatus: "starter",
      minutes: 90,
      goals: 1,
    }));
    expect(scorer?.title).toBe(
      "Matheus Monteiro buteur lors de la victoire du FC Richemond",
    );
    expect(scorer?.summary).toContain("a inscrit un but");

    const brace = generateSportsWatchManualText(football({ goals: 2 }));
    expect(brace?.title).toContain("auteur de 2 buts");
    expect(brace?.summary).toContain("a inscrit 2 buts");

    const zero = generateSportsWatchManualText(football({ goals: 0 }));
    expect(zero?.title).not.toContain("buteur");
    expect(zero?.summary).not.toMatch(/0 but/);
  });

  it("uses explicit assists and cards with correct singular and plural forms", () => {
    const generated = generateSportsWatchManualText(football({
      assists: 2,
      yellowCards: 1,
      redCards: 2,
    }));
    expect(generated?.summary).toContain("2 passes décisives");
    expect(generated?.summary).toContain("un carton jaune");
    expect(generated?.summary).toContain("2 cartons rouges");
  });

  it("generates basketball statistics without inferring a record", () => {
    const generated = generateSportsWatchManualText(basketball());
    expect(generated?.title).toBe("Mila Benjak inscrit 9 points face à Hélios");
    expect(generated?.summary).toContain(
      "Mila Benjak a disputé 18 minutes avec Elfic Fribourg face à Hélios, le 8 novembre 2026",
    );
    expect(generated?.summary).toContain("Mila Benjak a inscrit 9 points.");
    expect(generated?.summary).not.toContain("record");
  });

  it("mentions a record only when the type or a statistic makes it explicit", () => {
    expect(generateSportsWatchManualText(basketball())?.summary).not.toContain("record");
    const generated = generateSportsWatchManualText(basketball({
      newsType: "record",
      statistics: [{
        label: "Meilleur temps de jeu",
        value: "18",
        unit: "minutes",
      }],
    }));
    expect(generated?.title).toBe(
      "Mila Benjak établit son meilleur temps de jeu en SBLW",
    );
    expect(generated?.summary).toContain("explicitement renseignée comme un record");
  });

  it("uses a generic explicit fact for another sport", () => {
    const generated = generateSportsWatchManualText({
      athlete: {
        name: "Athlète Combat",
        sport: "Judo",
        club: "Dojo Test",
      },
      eventDate: "2026-11-09",
      newsType: "individual_performance",
      competition: "Tournoi de Fribourg",
      opponent: null,
      score: null,
      football: null,
      basketball: null,
      statistics: [{ label: "Classement", value: "2e", unit: null }],
    });
    expect(generated).toEqual({
      title: "Athlète Combat — Classement : 2e",
      summary: "Athlète Combat a enregistré la performance « Classement : 2e » lors de Tournoi de Fribourg, le 9 novembre 2026.",
    });
  });

  it("omits unknown fields and returns null rather than inventing a fact", () => {
    const input = football({
      team: null,
      opponent: null,
      score: null,
      competition: null,
    });
    input.athlete.club = "";
    input.opponent = null;
    input.score = null;
    input.competition = null;
    expect(generateSportsWatchManualText(input)).toBeNull();
  });
});
