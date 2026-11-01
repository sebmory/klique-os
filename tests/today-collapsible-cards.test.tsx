// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteNewsReportsAdminCard } from "@/components/app-shell/AthleteNewsReportsAdminCard";
import { PartnerIntroductionsAdminCockpit } from "@/components/app-shell/PartnerIntroductionsAdminCockpit";
import { SportsWatchAdminCard } from "@/components/app-shell/SportsWatchAdminCard";
import { TodayCollapsibleCard } from "@/components/app-shell/TodayCollapsibleCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const clickButton = async (container: HTMLElement, label: string) => {
  const button = Array.from(container.querySelectorAll("button"))
    .find((item) => item.textContent?.includes(label));
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
  });
};

const fribourgCandidates = () => {
  const competition =
    "Championnats fribourgeois / Freiburger Badminton Meisterschaften";
  const officialAthleteName = "Antoine MAJEUX";
  const makeCandidate = (
    id: string,
    eventCode: "Double Hommes 1" | "Mixte 2",
    discipline: "double" | "mixte",
    partner: string,
    opponents: string,
    winningTeam: string,
    score: string,
    round: string | null,
    draw: number,
  ) => ({
    id,
    athleteId: "antoine-majeux",
    athleteName: "Antoine Majeux",
    sourceName: "Swiss Badminton / Tournamentsoftware",
    sourceUrl: "https://sb.tournamentsoftware.com/player-profile/official",
    articleUrl: `https://sb.tournamentsoftware.com/sport/draw.aspx?id=4F95D606-A2F3-43CC-9A22-DB82450789D0&draw=${draw}`,
    title: `${competition} — ${eventCode}`,
    excerpt: `${competition} — ${eventCode} (${discipline})${round ? ` — ${round}` : ""}. Équipe 1 officielle : ${officialAthleteName} et ${partner}. Équipe 2 officielle : ${opponents}. Équipe d’${officialAthleteName} : ${officialAthleteName} et ${partner}. Partenaire d’${officialAthleteName} : ${partner}. Adversaires : ${opponents}. Équipe gagnante explicite : ${winningTeam}. Scores dans l’ordre officiel des équipes : ${score}. Scores du point de vue de l’équipe d’${officialAthleteName} : ${score}.`,
    resultKind: "collective_result",
    publicationDate: null,
    eventDateFrom: "2026-10-31",
    eventDateTo: "2026-10-31",
    collectedAt: "2026-11-01T10:00:00.000Z",
    attributionStatus: "matched",
    attributionEvidence: ["Identifiant officiel 206063."],
    verificationStatus: "unverified",
    adminStatus: "pending",
    supersedesCandidateId: null,
    version: 1,
  });
  const doubles = [
    ["Simon ENKERLI et Roman TREPP", "7-15, 4-15"],
    ["Alexandre GILLIÉRON et Cyril HOHL", "9-15, 11-15"],
    ["Benjamin CUPILLARD et Rémy PERROSET", "7-15, 8-15"],
  ].map(([opponents, score], index) => makeCandidate(
    `double-${index}`,
    "Double Hommes 1",
    "double",
    "Maël FELLAY",
    opponents,
    opponents,
    score,
    `Ronde ${index + 1}`,
    11,
  ));
  const mixed = [
    ["Maude BROSY et Claude MEUWLY", "Antoine MAJEUX et Joy THÉRAULAZ", "15-12, 15-9"],
    ["Anaïs NOSER et Olivier AMANTINI", "Antoine MAJEUX et Joy THÉRAULAZ", "15-13, 15-12"],
    ["Audrey PERROSET et Maxime MOREL", "Audrey PERROSET et Maxime MOREL", "15-9, 13-15, 12-15"],
    ["Nathalie MAGNE et Frédéric MAGNE", "Nathalie MAGNE et Frédéric MAGNE", "15-11, 9-15, 12-15"],
  ].map(([opponents, winner, score], index) => makeCandidate(
    `mixte-${index}`,
    "Mixte 2",
    "mixte",
    "Joy THÉRAULAZ",
    opponents,
    winner,
    score,
    null,
    20,
  ));
  return [...doubles, ...mixed];
};

const persistedCandidate = (
  id: string,
  overrides: Partial<ReturnType<typeof fribourgCandidates>[number]>,
) => ({
  id,
  athleteId: "mila-benjak",
  athleteName: "Mila Benjak",
  sourceName: "Source persistée",
  sourceUrl: "https://example.com",
  articleUrl: "https://example.com/result",
  title: "Résultat persistant",
  excerpt: "Résumé persistant.",
  resultKind: "individual_result" as const,
  publicationDate: null,
  eventDateFrom: "2026-10-25",
  eventDateTo: "2026-10-25",
  collectedAt: "2026-11-01T10:00:00.000Z",
  attributionStatus: "matched" as const,
  attributionEvidence: ["Preuve persistée."],
  verificationStatus: "unverified" as const,
  adminStatus: "pending" as const,
  supersedesCandidateId: null,
  version: 1,
  ...overrides,
});

describe("Today collapsible cards", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens pending cards by default and persists the user's collapsed choice", async () => {
    await act(async () => {
      root.render(
        <TodayCollapsibleCard storageKey="fixture" title="Bloc test" attentionCount={2}>
          <p>Contenu</p>
        </TodayCollapsibleCard>,
      );
      await flush();
    });
    const toggle = container.querySelector(".today-card-toggle") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await clickButton(container, "Replier");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem("klique.today.card-open.v1:fixture")).toBe("false");

    await act(async () => {
      root.render(
        <TodayCollapsibleCard storageKey="fixture" title="Bloc test" attentionCount={3}>
          <p>Contenu actualisé</p>
        </TodayCollapsibleCard>,
      );
      await flush();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("separates processed athlete reports into History", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        reports: [
          {
            id: "new",
            athleteId: "athlete-1",
            message: "À examiner",
            eventDate: "2026-10-26",
            externalUrl: null,
            photoHref: null,
            status: "new",
            version: 1,
            createdAt: "2026-10-26T10:00:00.000Z",
            updatedAt: "2026-10-26T10:00:00.000Z",
          },
          {
            id: "processed",
            athleteId: "athlete-1",
            message: "Déjà traité",
            eventDate: "2026-10-25",
            externalUrl: null,
            photoHref: null,
            status: "processed",
            version: 2,
            createdAt: "2026-10-25T10:00:00.000Z",
            updatedAt: "2026-10-26T10:00:00.000Z",
          },
        ],
      }),
    })));
    await act(async () => {
      root.render(<AthleteNewsReportsAdminCard athletes={[{ key: "athlete-1", name: "Mila Benjak" }]} />);
      await flush();
    });

    expect(container.textContent).toContain("À examiner");
    expect(container.textContent).not.toContain("Déjà traité");
    await clickButton(container, "Historique");
    expect(container.textContent).toContain("Déjà traité");
    expect(container.textContent).not.toContain("À examiner");
  });

  it("keeps reported completed introductions in the current view and moves ordinary completed ones to History", async () => {
    const item = (input: Partial<Record<string, unknown>>) => ({
      id: String(input.id),
      partnerPublicName: "Partenaire",
      athletePublicName: "Athlète",
      historical: false,
      reason: String(input.reason),
      status: "accepted",
      moderationStatus: "active",
      createdAt: "2026-10-26T10:00:00.000Z",
      ageDays: 1,
      stale: false,
      reported: false,
      ...input,
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        workflowEnabled: true,
        items: [
          item({ id: "reported", reason: "Acceptée mais signalée", reported: true }),
          item({ id: "done", reason: "Acceptée terminée" }),
          item({ id: "legacy", reason: "Ancienne demande", historical: true, status: "resolved" }),
        ],
      }),
    })));
    await act(async () => {
      root.render(<PartnerIntroductionsAdminCockpit />);
      await flush();
    });

    expect(container.textContent).toContain("Acceptée mais signalée");
    expect(container.textContent).not.toContain("Acceptée terminée");
    expect(container.textContent).not.toContain("Ancienne demande");
    await clickButton(container, "Historique");
    expect(container.textContent).toContain("Acceptée terminée");
    expect(container.textContent).toContain("Ancienne demande");
    expect(container.textContent).not.toContain("Acceptée mais signalée");
  });

  it.each([
    ["mobile", 390],
    ["desktop", 1440],
  ])("renders the seven Fribourg matches responsively on %s", async (_label, width) => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: width,
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        workspaceId: "workspace-fixture",
        candidates: fribourgCandidates(),
        swissBindings: [],
        iwwfBindings: [],
        safvBindings: [],
        beBasketBindings: [],
        swissBasketballBindings: [],
        latestRefresh: null,
      }),
    })));

    await act(async () => {
      root.render(<SportsWatchAdminCard athletes={[]} />);
      window.dispatchEvent(new Event("resize"));
      await flush();
    });

    const groupTitles = Array.from(container.querySelectorAll("h3"))
      .map((heading) => heading.textContent);
    expect(groupTitles).toContain(
      "Championnats fribourgeois / Freiburger Badminton Meisterschaften",
    );
    expect(groupTitles).not.toContain(
      "Championnats fribourgeois / Freiburger Badminton Meisterschaften — Mixte 2",
    );
    expect(container.textContent).toContain("3 matchs collectés · 0 victoires · 3 défaites");
    expect(container.textContent).toContain("4 matchs collectés · 2 victoires · 2 défaites");
    expect(container.textContent).toContain("Double Hommes 1");
    expect(container.textContent).toContain("Mixte 2");
    expect(container.textContent).toContain("avec Joy THÉRAULAZ");
    expect(container.textContent).toContain("15-11, 9-15, 12-15");
    const mixedMatches = Array.from(container.querySelectorAll(".sports-match"))
      .filter((match) => match.textContent?.includes("Mixte 2"));
    expect(mixedMatches).toHaveLength(4);
    expect(mixedMatches.every((match) => !match.textContent?.includes("Ronde"))).toBe(true);
    expect(container.querySelectorAll('a[href*="draw=11"]')).toHaveLength(3);
    expect(container.querySelectorAll('a[href*="draw=20"]')).toHaveLength(4);
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
  });

  it("routes persistent badminton, basketball and manual import formats through the integrated card", async () => {
    const neuchCup = [
      persistedCandidate("55555555-5555-4555-8555-555555555551", {
        athleteId: "antoine-majeux",
        athleteName: "Antoine Majeux",
        sourceName: "Swiss Badminton / Tournamentsoftware",
        sourceUrl: "https://sb.tournamentsoftware.com/player-profile/official",
        articleUrl: "https://sb.tournamentsoftware.com/sport/draw.aspx?id=B2E4D29A-5E0D-4935-B2B3-3A5DD226E8C4&draw=1",
        title: "Neuch'Cup 2026 — SM1",
        excerpt: "Neuch'Cup 2026 — SM1 (simple) — Finale. Ordre officiel : Antoine MAJEUX puis Pranav KHOT. Vainqueur explicite : Antoine MAJEUX. Scores dans l’ordre officiel : 15-12, 15-10. Score du point de vue d’Antoine MAJEUX : 15-12, 15-10.",
      }),
      persistedCandidate("55555555-5555-4555-8555-555555555552", {
        athleteId: "antoine-majeux",
        athleteName: "Antoine Majeux",
        sourceName: "Swiss Badminton / Tournamentsoftware",
        sourceUrl: "https://sb.tournamentsoftware.com/player-profile/official",
        articleUrl: "https://sb.tournamentsoftware.com/sport/draw.aspx?id=B2E4D29A-5E0D-4935-B2B3-3A5DD226E8C4&draw=9",
        title: "Neuch'Cup 2026 — DM2",
        excerpt: "Neuch'Cup 2026 — DM2 (double) — Finale. Équipe 1 officielle : Antoine MAJEUX et Max PASQUIER. Équipe 2 officielle : Jonathan MULLER et Antoine TRAN. Équipe d’Antoine MAJEUX : Antoine MAJEUX et Max PASQUIER. Partenaire d’Antoine MAJEUX : Max PASQUIER. Adversaires : Jonathan MULLER et Antoine TRAN. Équipe gagnante explicite : Jonathan MULLER et Antoine TRAN. Scores dans l’ordre officiel des équipes : 12-15, 10-15. Scores du point de vue de l’équipe d’Antoine MAJEUX : 12-15, 10-15.",
        resultKind: "collective_result",
        eventDateFrom: "2026-10-24",
        eventDateTo: "2026-10-24",
      }),
      persistedCandidate("55555555-5555-4555-8555-555555555553", {
        athleteId: "antoine-majeux",
        athleteName: "Antoine Majeux",
        sourceName: "Swiss Badminton / Tournamentsoftware",
        sourceUrl: "https://sb.tournamentsoftware.com/player-profile/official",
        articleUrl: "https://sb.tournamentsoftware.com/sport/draw.aspx?id=B2E4D29A-5E0D-4935-B2B3-3A5DD226E8C4&draw=4",
        title: "Neuch'Cup 2026 — DX1",
        excerpt: "Neuch'Cup 2026 — DX1 (mixte) — Quart de finale. Équipe 1 officielle : Antoine MAJEUX et Anja STEHLIN. Équipe 2 officielle : Alan STERCHI et Katarzyna WOJTOWICZ. Équipe d’Antoine MAJEUX : Antoine MAJEUX et Anja STEHLIN. Partenaire d’Antoine MAJEUX : Anja STEHLIN. Adversaires : Alan STERCHI et Katarzyna WOJTOWICZ. Équipe gagnante explicite : Alan STERCHI et Katarzyna WOJTOWICZ. Scores dans l’ordre officiel des équipes : 12-15, 10-15. Scores du point de vue de l’équipe d’Antoine MAJEUX : 12-15, 10-15.",
        resultKind: "collective_result",
        eventDateFrom: "2026-10-24",
        eventDateTo: "2026-10-24",
      }),
    ];
    const swissBasketball = persistedCandidate("66666666-6666-4666-8666-666666666661", {
      sourceName: "Swiss Basketball — source officielle",
      title: "Elfic Fribourg Génération 63–51 BC Arlesheim — Benjak Mila",
      excerpt: "Source : Swiss Basketball — source officielle. Compétition : NLB Women · 2026-2027. Équipe : Elfic Fribourg Génération. Match : Elfic Fribourg Génération 63–51 BC Arlesheim. Date : 2026-10-25. Présence nominative : Benjak Mila, identifiant joueur 71375. Titularisation : non. Participation établie par une donnée individuelle explicite. Statistiques individuelles explicitement présentes : PTS 16. Minutes et autres statistiques absentes : aucune valeur n’est déduite.",
    });
    const beBasket = persistedCandidate("66666666-6666-4666-8666-666666666662", {
      sourceName: "BeBasket — source tierce",
      title: "BCF Elfic Fribourg vs Nyon Basket Feminin — Mila Benjak",
      excerpt: "Source : BeBasket — source tierce. Statut factuel : non vérifié ; aucune corroboration officielle. Match : BCF Elfic Fribourg vs Nyon Basket Feminin (71-64). Date : 2026-10-25. Participation explicitement documentée pour Mila Benjak. Statistiques explicitement présentes : MIN 2:16 · PTS 1 · LF 1/2.",
      attributionEvidence: ["Rattachement Admin : équipe BCF Elfic Fribourg, joueuse Mila Benjak."],
    });
    const manualImport = persistedCandidate("66666666-6666-4666-8666-666666666663", {
      sourceName: "Document privé",
      sourceUrl: "/api/admin/sports-watch/imports/11111111-1111-4111-8111-111111111111/file",
      articleUrl: "/api/admin/sports-watch/imports/11111111-1111-4111-8111-111111111111/file",
      title: "Elfic–Nyon · Mila Benjak",
      excerpt: "Participation individuelle explicitement indiquée dans le document importé. Source : Document privé. Date du document : 2026-10-25. Date du match : 2026-10-25.",
      resultKind: "participation",
      adminStatus: "exploited",
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        workspaceId: "workspace-persistent-formats",
        candidates: [
          ...fribourgCandidates(),
          ...neuchCup,
          swissBasketball,
          beBasket,
          manualImport,
        ],
        swissBindings: [],
        iwwfBindings: [],
        safvBindings: [],
        beBasketBindings: [],
        swissBasketballBindings: [],
        latestRefresh: null,
      }),
    })));

    await act(async () => {
      root.render(<SportsWatchAdminCard athletes={[]} />);
      await flush();
    });

    expect(container.querySelectorAll(".sports-match")).toHaveLength(10);
    expect(container.textContent).toContain("3 matchs collectés · 0 victoires · 3 défaites");
    expect(container.textContent).toContain("4 matchs collectés · 2 victoires · 2 défaites");
    expect(container.textContent).toContain("Neuch'Cup 2026");
    expect(container.textContent).toContain("16 points");
    expect(container.textContent).toContain("1 point");
    expect(container.textContent).not.toContain(
      "Participation individuelle non établie par ce résultat collectif",
    );

    await clickButton(container, "Historique");
    expect(container.textContent).toContain("Résultat importé");
    expect(container.textContent).toContain("Elfic–Nyon · Mila Benjak");
    expect(container.textContent).not.toContain("Présence signalée");
    expect(container.textContent).not.toContain("Participation individuelle non établie");
  });

  it("groups sports results by athlete and archives exploited and rejected results", async () => {
    const candidate = (
      id: string,
      title: string,
      adminStatus: "pending" | "validated" | "exploited" | "rejected",
    ) => ({
      id,
      athleteId: "mila-benjak",
      athleteName: "Mila Benjak",
      sourceName: "Fixture",
      sourceUrl: `https://example.com/${id}`,
      articleUrl: `https://example.com/${id}`,
      title,
      excerpt: title,
      resultKind: "participation",
      publicationDate: "2026-10-25T00:00:00.000Z",
      eventDateFrom: "2026-10-25",
      eventDateTo: "2026-10-25",
      collectedAt: "2026-10-27T08:00:00.000Z",
      attributionStatus: "matched",
      attributionEvidence: ["Fixture"],
      verificationStatus: "unverified",
      adminStatus,
      supersedesCandidateId: null,
      version: 1,
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        workspaceId: "workspace-fixture",
        candidates: [
          candidate("11111111-1111-4111-8111-111111111111", "Résultat en attente", "pending"),
          candidate("22222222-2222-4222-8222-222222222222", "Résultat validé à exploiter", "validated"),
          candidate("33333333-3333-4333-8333-333333333333", "Résultat rejeté", "rejected"),
          candidate("44444444-4444-4444-8444-444444444444", "Résultat exploité", "exploited"),
        ],
        swissBindings: [],
        iwwfBindings: [],
        safvBindings: [],
        latestRefresh: {
          id: "55555555-5555-4555-8555-555555555555",
          trigger: "scheduled",
          status: "partial",
          scheduledFor: "2026-11-01",
          startedAt: "2026-11-01T02:00:00.000Z",
          completedAt: "2026-11-01T02:05:00.000Z",
          message: null,
          taskCount: 16,
          completedCount: 16,
          failedCount: 0,
          createdCount: 1,
          tasks: [{
            sourceKey: "swiss-badminton",
            athleteId: "antoine-majeux",
            athleteName: "Antoine Majeux",
            status: "completed",
            createdCount: 1,
            message: "Couverture partielle : 1 rencontre inexploitable écartée. URL : https://sb.tournamentsoftware.com/sport/draw.aspx?id=official&draw=11",
          }],
        },
      }),
    })));
    await act(async () => {
      root.render(<SportsWatchAdminCard athletes={[]} />);
      await flush();
    });

    expect(container.textContent).toContain("Résultat en attente");
    expect(container.textContent).toContain("Résultat validé à exploiter");
    expect(container.textContent).not.toContain("Résultat rejeté");
    expect(container.textContent).not.toContain("Résultat exploité");
    expect(container.textContent).toContain("À vérifier : 1");
    expect(container.textContent).toContain("À exploiter : 1");
    expect(container.textContent).toContain("Dernière exécution automatique · Partielle");
    expect(container.textContent).toContain("16/16 veilles terminées");
    expect(container.textContent).toContain("Couverture partielle");
    const athleteCard = Array.from(container.querySelectorAll("details"))
      .find((item) => item.querySelector(":scope > summary")?.textContent?.includes("Mila Benjak"));
    expect(athleteCard?.open).toBe(false);
    await act(async () => {
      if (athleteCard) {
        athleteCard.open = true;
        athleteCard.dispatchEvent(new Event("toggle", { bubbles: false }));
      }
      await flush();
    });
    expect(window.localStorage.getItem(
      "klique.today.sports-watch.athletes.open.v1:workspace-fixture",
    )).toBe("[\"mila-benjak\"]");

    await clickButton(container, "Historique");
    expect(container.textContent).toContain("Résultat rejeté");
    expect(container.textContent).toContain("Résultat exploité");
    expect(container.textContent).toContain("Remettre à exploiter");
    expect(container.textContent).not.toContain("Résultat validé à exploiter");
  });
});
