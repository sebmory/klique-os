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
  materials: selected.map((item, index) => ({
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
});
