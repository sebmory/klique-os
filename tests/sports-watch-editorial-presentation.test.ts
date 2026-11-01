import { describe, expect, it } from "vitest";
import { buildSportsWatchEditorialPresentation } from "@/lib/sports-watch/editorial-presentation";
import type { SportsWatchCandidate } from "@/types/sports-watch";

const candidate = (
  overrides: Partial<SportsWatchCandidate> = {},
): SportsWatchCandidate => ({
  id: "11111111-1111-4111-8111-111111111111",
  athleteId: "mila-benjak",
  athleteName: "Mila Benjak",
  sourceName: "Source test",
  sourceUrl: "https://example.com",
  articleUrl: "https://example.com/result",
  title: "Résultat de Mila Benjak",
  excerpt: "Fait explicite non structuré.",
  resultKind: "individual_result",
  publicationDate: null,
  eventDateFrom: "2026-10-25",
  eventDateTo: "2026-10-25",
  collectedAt: "2026-10-26T10:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: ["Fixture explicite."],
  verificationStatus: "unverified",
  adminStatus: "pending",
  supersedesCandidateId: null,
  version: 1,
  ...overrides,
});

describe("sports watch editorial presentation", () => {
  it("separates official individual performance from the team result without inventing minutes", () => {
    const presentation = buildSportsWatchEditorialPresentation(candidate({
      sourceName: "Swiss Basketball — source officielle",
      title: "Elfic Fribourg Génération 63–51 BC Arlesheim — Benjak Mila",
      excerpt: [
        "Source : Swiss Basketball — source officielle.",
        "Compétition : NLB Women · 2026-2027.",
        "Équipe : Elfic Fribourg Génération.",
        "Match : Elfic Fribourg Génération 63–51 BC Arlesheim.",
        "Date : 2026-10-25.",
        "Présence nominative : Benjak Mila, identifiant joueur 71375, numéro 7.",
        "Titularisation : non.",
        "Participation établie par une donnée individuelle explicite.",
        "Statistiques individuelles explicitement présentes : PTS 16.",
        "Minutes et autres statistiques absentes : aucune valeur n’est déduite.",
      ].join(" "),
    }));

    expect(presentation).toMatchObject({
      headline: "16 points",
      supportingLine: "avec Elfic Fribourg Génération",
      collectiveLine: "Victoire 63–51 face à BC Arlesheim",
      contextLabel: "NLB Women",
      secondaryStats: [],
      participationNote: null,
      outcome: "victory",
    });
  });

  it("keeps the BeBasket performance sober and formats explicit playing time", () => {
    const presentation = buildSportsWatchEditorialPresentation(candidate({
      sourceName: "BeBasket — source tierce",
      title: "BCF Elfic Fribourg vs Nyon Basket Feminin — Mila Benjak",
      excerpt: [
        "Source : BeBasket — source tierce.",
        "Statut factuel : non vérifié ; aucune corroboration officielle.",
        "Match : BCF Elfic Fribourg vs Nyon Basket Feminin (71-64).",
        "Date : 2026-10-25.",
        "Participation explicitement documentée pour Mila Benjak.",
        "Statistiques explicitement présentes : MIN 2:16 · PTS 1 · LF 1/2.",
      ].join(" "),
      attributionEvidence: [
        "Rattachement Admin : équipe BCF Elfic Fribourg, joueuse Mila Benjak.",
      ],
    }));

    expect(presentation).toMatchObject({
      headline: "1 point",
      supportingLine: "avec BCF Elfic Fribourg",
      collectiveLine: "Victoire 71–64 face à Nyon Basket Feminin",
      secondaryStats: [{ label: "Temps de jeu", value: "2 min 16 s" }],
      outcome: "victory",
    });
  });

  it("preserves explicit zero values", () => {
    const presentation = buildSportsWatchEditorialPresentation(candidate({
      sourceName: "BeBasket — source tierce",
      excerpt: [
        "Source : BeBasket — source tierce.",
        "Statut factuel : non vérifié ; aucune corroboration officielle.",
        "Match : BCF Elfic Fribourg vs Nyon Basket Feminin (71-64).",
        "Date : 2026-10-25.",
        "Participation explicitement documentée pour Mila Benjak.",
        "Statistiques explicitement présentes : PTS 0 · REB 0.",
      ].join(" "),
      attributionEvidence: [
        "Rattachement Admin : équipe BCF Elfic Fribourg, joueuse Mila Benjak.",
      ],
    }));

    expect(presentation.headline).toBe("0 points");
    expect(presentation.secondaryStats).toContainEqual({ label: "Rebonds", value: "0" });
  });

  it("states that presence does not establish participation", () => {
    const presentation = buildSportsWatchEditorialPresentation(candidate({
      sourceName: "Swiss Basketball — source officielle",
      resultKind: "participation",
      excerpt: [
        "Source : Swiss Basketball — source officielle.",
        "Compétition : NLB Women · 2026-2027.",
        "Équipe : Elfic Fribourg Génération.",
        "Match : Elfic Fribourg Génération 63–51 BC Arlesheim.",
        "Date : 2026-10-25.",
        "Présence nominative : Benjak Mila, identifiant joueur 71375.",
        "Titularisation : non renseignée.",
        "Participation non établie par la seule présence sur la feuille.",
        "Aucune statistique individuelle chiffrée explicite n’est présente.",
        "Minutes et autres statistiques absentes : aucune valeur n’est déduite.",
      ].join(" "),
    }));

    expect(presentation.headline).toBe("Présence sur la feuille");
    expect(presentation.participationNote).toBe(
      "Présence nominative, sans participation individuelle établie",
    );
  });

  it("does not imply individual participation from a collective result alone", () => {
    const presentation = buildSportsWatchEditorialPresentation(candidate({
      resultKind: "collective_result",
    }));

    expect(presentation.headline).toBe("Résultat collectif");
    expect(presentation.participationNote).toBe(
      "Participation individuelle non établie par ce résultat collectif",
    );
  });

  it("keeps a non-structured candidate factual and unclassified", () => {
    const presentation = buildSportsWatchEditorialPresentation(candidate({
      title: "Résultat officiel à examiner",
      excerpt: "Format inconnu.",
    }));

    expect(presentation).toMatchObject({
      headline: "Résultat officiel à examiner",
      collectiveLine: null,
      contextLabel: null,
      secondaryStats: [],
      outcome: "neutral",
    });
  });
});
