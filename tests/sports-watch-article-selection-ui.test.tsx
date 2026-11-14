// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SportsWatchAdminCard } from "@/components/app-shell/SportsWatchAdminCard";
import type {
  SportsWatchArticlePrefill,
  SportsWatchCandidate,
} from "@/types/sports-watch";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const candidate = (
  id: string,
  athleteId: string,
  athleteName: string,
  adminStatus: SportsWatchCandidate["adminStatus"] = "validated",
): SportsWatchCandidate => ({
  id,
  athleteId,
  athleteName,
  sourceName: "Source test",
  sourceUrl: "https://source.example",
  articleUrl: `https://source.example/results/${id}`,
  title: `Résultat de ${athleteName}`,
  excerpt: `Compétition test. Athlète : ${athleteName}.`,
  resultKind: "individual_result",
  publicationDate: "2026-10-20T10:00:00.000Z",
  eventDateFrom: "2026-10-19",
  eventDateTo: "2026-10-19",
  collectedAt: "2026-10-21T10:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: ["Fixture explicite."],
  verificationStatus: "unverified",
  adminStatus,
  supersedesCandidateId: null,
  version: 1,
});

const candidates = [
  candidate("00000000-0000-4000-8000-000000000001", "athlete-a", "Athlète A"),
  candidate("00000000-0000-4000-8000-000000000002", "athlete-b", "Athlète B"),
  candidate(
    "00000000-0000-4000-8000-000000000003",
    "athlete-a",
    "Athlète A",
    "exploited",
  ),
];

const prefill = (
  selected: SportsWatchCandidate[],
  potentialDuplicates: SportsWatchArticlePrefill["potentialDuplicates"] = [],
): SportsWatchArticlePrefill => ({
  candidateId: selected[0].id,
  candidateIds: selected.map((item) => item.id),
  athleteId: new Set(selected.map((item) => item.athleteId)).size === 1
    ? selected[0].athleteId
    : null,
  athleteIds: [...new Set(selected.map((item) => item.athleteId))],
  verificationStatus: "unverified",
  materials: selected.map((item) => ({
    id: `sports-watch-${item.id}-1`,
    kind: "note",
    text: item.excerpt,
    provenance: item.sourceName,
    sourceDate: "2026-10-19",
  })),
  potentialDuplicates,
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("sports watch Article selection UI", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    router.push.mockReset();
    window.sessionStorage.clear();
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

  it.each([390, 1440])(
    "selects only eligible results and uses collective context at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ prefill: prefill(candidates.slice(0, 2)) }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            workspaceId: "workspace-a",
            candidates,
            swissBindings: [],
            iwwfBindings: [],
            safvBindings: [],
            beBasketBindings: [],
            swissBasketballBindings: [],
          }),
        };
      }));

      await act(async () => {
        root.render(<SportsWatchAdminCard athletes={[
          { key: "athlete-a", athleteId: "athlete-a", name: "Athlète A", sport: "Tennis", club: "Club A", status: "Actif" },
          { key: "athlete-b", athleteId: "athlete-b", name: "Athlète B", sport: "Basketball", club: "Club B", status: "Actif" },
        ]} />);
        await flush();
      });

      const checkboxes = Array.from(
        container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      );
      expect(checkboxes).toHaveLength(2);
      await act(async () => {
        checkboxes[0].click();
        checkboxes[1].click();
        await flush();
      });
      expect(container.textContent).toContain("2 résultats sélectionnés");

      const prepareButton = Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Préparer un article")!;
      await act(async () => {
        prepareButton.click();
        await flush();
      });

      expect(router.push).toHaveBeenCalledOnce();
      const target = router.push.mock.calls[0][0] as string;
      expect(target).toContain("contextType=other");
      expect(target).toContain("Bilan+de+2+athl%C3%A8tes");
      expect(target).not.toContain("subjectId=");
      expect(target).toContain("sportsWatchCandidateIds=");

      router.push.mockReset();
      const interviewButton = Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Préparer une interview")!;
      await act(async () => {
        interviewButton.click();
        await flush();
      });
      expect(router.push).toHaveBeenCalledOnce();
      const interviewTarget = router.push.mock.calls[0][0] as string;
      expect(interviewTarget).toContain("objective=interview");
      expect(interviewTarget).toContain("subjectId=athlete-a");
      expect(interviewTarget).toContain(`sportsWatchCandidateId=${candidates[0].id}`);
    },
  );

  it("shows duplicate sources and requires explicit distinct-event confirmation", async () => {
    const duplicate = {
      id: `${candidates[0].id}:${candidates[1].id}`,
      reason: "Même score et équipes concordantes.",
      candidates: candidates.slice(0, 2).map((item, index) => ({
        id: item.id,
        athleteName: item.athleteName,
        sourceName: index === 0 ? "BeBasket" : "Swiss Basketball",
        articleUrl: item.articleUrl,
        title: item.title,
        eventDateFrom: item.eventDateFrom,
      })),
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const confirmed = String(input).includes("confirmDistinct=true");
        return {
          ok: confirmed,
          status: confirmed ? 200 : 409,
          json: async () => ({
            prefill: prefill(candidates.slice(0, 2), [duplicate]),
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          workspaceId: "workspace-a",
          candidates: candidates.slice(0, 2),
          swissBindings: [],
          iwwfBindings: [],
          safvBindings: [],
          beBasketBindings: [],
          swissBasketballBindings: [],
        }),
      };
    }));

    await act(async () => {
      root.render(<SportsWatchAdminCard athletes={[]} />);
      await flush();
    });
    const checkboxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    await act(async () => {
      checkboxes.forEach((checkbox) => checkbox.click());
      await flush();
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Préparer un article")!
        .click();
      await flush();
    });
    expect(container.textContent).toContain("Doublons potentiels à vérifier");
    expect(container.textContent).toContain("BeBasket");
    expect(container.textContent).toContain("Swiss Basketball");
    expect(router.push).not.toHaveBeenCalled();

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirmer des événements distincts")!
        .click();
      await flush();
    });
    expect(router.push).toHaveBeenCalledOnce();
    expect(router.push.mock.calls[0][0]).toContain("sportsWatchDistinctConfirmed=true");
  });

  it.each([390, 1440])(
    "dismisses, updates counters and restores a result without reloading at %ipx",
    async (width) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      const mutableCandidate = candidate(
        "00000000-0000-4000-8000-000000000010",
        "athlete-a",
        "Athlète A",
      );
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body)) as {
            status: SportsWatchCandidate["adminStatus"];
          };
          mutableCandidate.adminStatus = body.status;
          mutableCandidate.version += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({ candidate: { ...mutableCandidate } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            workspaceId: "workspace-a",
            candidates: [mutableCandidate],
            swissBindings: [],
            iwwfBindings: [],
            safvBindings: [],
            beBasketBindings: [],
            swissBasketballBindings: [],
          }),
        };
      });
      vi.stubGlobal("fetch", fetchMock);

      await act(async () => {
        root.render(<SportsWatchAdminCard athletes={[]} />);
        await flush();
      });
      expect(container.textContent).toContain("À exploiter (1)");

      const dismissButton = Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Ne pas exploiter")!;
      await act(async () => {
        dismissButton.click();
        dismissButton.click();
        await Promise.resolve();
        expect(container.textContent).toContain("À exploiter (0)");
        await flush();
      });
      expect(container.textContent).toContain("Historique (1)");
      expect(container.textContent).toContain("Actualité classée comme non exploitée.");
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === "Historique (1)")!
          .click();
        await flush();
      });
      expect(container.textContent).toContain("Non exploitée");
      expect(container.textContent).toContain("Restaurer dans À exploiter");

      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === "Annuler")!
          .click();
        await flush();
      });
      expect(container.textContent).toContain("À exploiter (1)");
      expect(container.textContent).toContain("Historique (0)");
      expect(container.textContent).toContain("Actualité restaurée dans À exploiter.");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it("keeps validated news accessible with more than 50 pending and paginates groups independently", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const pending = Array.from({ length: 40 }, (_, index) =>
      candidate(
        `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        "athlete-a",
        "Athlète A",
        "pending",
      ));
    const validated = Array.from({ length: 6 }, (_, index) =>
      candidate(
        `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        "athlete-b",
        "Athlète B",
      ));
    const history = [
      candidate("30000000-0000-4000-8000-000000000001", "athlete-a", "Athlète A", "exploited"),
      candidate("30000000-0000-4000-8000-000000000002", "athlete-b", "Athlète B", "dismissed"),
    ];
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("group=pending")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            page: {
              group: "pending",
              items: pending.slice(20),
              nextCursor: null,
              hasMore: false,
              limit: 20,
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          workspaceId: "workspace-a",
          candidateDashboard: {
            pages: {
              pending: {
                group: "pending",
                items: pending.slice(0, 20),
                nextCursor: "pending-page-2",
                hasMore: true,
                limit: 20,
              },
              validated: {
                group: "validated",
                items: validated,
                nextCursor: null,
                hasMore: false,
                limit: 20,
              },
              history: {
                group: "history",
                items: history,
                nextCursor: null,
                hasMore: false,
                limit: 20,
              },
            },
            totals: {
              pending: 54,
              validated: 6,
              exploited: 1,
              rejected: 0,
              dismissed: 1,
              superseded: 0,
              supersededPending: 0,
              supersededValidated: 0,
            },
            athleteTotals: [
              { athleteId: "athlete-a", athleteName: "Athlète A", pending: 54, validated: 0 },
              { athleteId: "athlete-b", athleteName: "Athlète B", pending: 0, validated: 6 },
            ],
          },
          swissBindings: [],
          iwwfBindings: [],
          safvBindings: [],
          beBasketBindings: [],
          swissBasketballBindings: [],
        }),
      };
    }));

    await act(async () => {
      root.render(<SportsWatchAdminCard athletes={[]} />);
      await flush();
    });

    expect(container.textContent).toContain("À exploiter (60)");
    expect(container.textContent).toContain("Historique (2)");
    expect(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).toHaveLength(6);
    expect(container.textContent).toContain("Charger plus · 20/54 actualités à vérifier");
    expect(container.textContent).toContain("6/6 actualités à exploiter");
    const loadPending = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("20/54 actualités à vérifier"))!;

    await act(async () => {
      loadPending.click();
      await flush();
    });

    expect(requestedUrls.some((url) =>
      url.includes("group=pending")
      && url.includes("cursor=pending-page-2"))).toBe(true);
    expect(requestedUrls.some((url) => url.includes("group=validated"))).toBe(false);
    expect(container.textContent).toContain("40/54 actualités à vérifier");
    expect(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).toHaveLength(6);
  });
});
