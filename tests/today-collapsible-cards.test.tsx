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
    excerpt: `${competition} — ${eventCode} (${discipline})${round ? ` — ${round}` : ""}. Équipe 1 officielle : Antoine Majeux et ${partner}. Équipe 2 officielle : ${opponents}. Équipe d’Antoine Majeux : Antoine Majeux et ${partner}. Partenaire d’Antoine Majeux : ${partner}. Adversaires : ${opponents}. Équipe gagnante explicite : ${winningTeam}. Scores dans l’ordre officiel des équipes : ${score}. Scores du point de vue de l’équipe d’Antoine Majeux : ${score}.`,
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
    ["Simon Enkerli et Roman Trepp", "7-15, 4-15"],
    ["Alexandre Gilliéron et Cyril Hohl", "9-15, 11-15"],
    ["Benjamin Cupillard et Rémy Perroset", "7-15, 8-15"],
  ].map(([opponents, score], index) => makeCandidate(
    `double-${index}`,
    "Double Hommes 1",
    "double",
    "Maël Fellay",
    opponents,
    opponents,
    score,
    `Ronde ${index + 1}`,
    11,
  ));
  const mixed = [
    ["Maude Brosy et Claude Meuwly", "Antoine Majeux et Joy Théraulaz", "15-12, 15-9"],
    ["Anaïs Noser et Olivier Amantini", "Antoine Majeux et Joy Théraulaz", "15-13, 15-12"],
    ["Audrey Perroset et Maxime Morel", "Audrey Perroset et Maxime Morel", "15-9, 13-15, 12-15"],
    ["Nathalie Magne et Frédéric Magne", "Nathalie Magne et Frédéric Magne", "15-11, 9-15, 12-15"],
  ].map(([opponents, winner, score], index) => makeCandidate(
    `mixte-${index}`,
    "Mixte 2",
    "mixte",
    "Joy Théraulaz",
    opponents,
    winner,
    score,
    null,
    20,
  ));
  return [...doubles, ...mixed];
};

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
    ["mobile", 375],
    ["desktop", 1280],
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
    expect(container.textContent).toContain(
      "Double · 3 matches collectés · 0 victoires · 3 défaites",
    );
    expect(container.textContent).toContain(
      "Mixte · 4 matches collectés · 2 victoires · 2 défaites",
    );
    expect(container.textContent).toContain("Épreuve : Double Hommes 1");
    expect(container.textContent).toContain("Épreuve : Mixte 2");
    expect(container.textContent).toContain("Partenaire : Joy Théraulaz");
    expect(container.textContent).toContain("Score : 15-11, 9-15, 12-15");
    const mixedArticles = Array.from(container.querySelectorAll("article"))
      .filter((article) => Array.from(article.querySelectorAll(":scope > p"))
        .some((paragraph) => paragraph.textContent === "Épreuve : Mixte 2"));
    expect(mixedArticles).toHaveLength(4);
    expect(mixedArticles.every((article) =>
      !article.querySelector("strong")?.textContent?.includes("Ronde"))).toBe(true);
    expect(container.querySelectorAll('a[href*="draw=11"]')).toHaveLength(3);
    expect(container.querySelectorAll('a[href*="draw=20"]')).toHaveLength(4);
    expect(container.querySelectorAll("button").length).toBeGreaterThan(0);
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
