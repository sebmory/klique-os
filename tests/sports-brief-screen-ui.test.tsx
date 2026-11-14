// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SportsBriefScreen } from "@/components/contents/SportsBriefScreen";
import type { SportsWatchBriefCandidate } from "@/types/sports-watch";

const candidate: SportsWatchBriefCandidate = {
  id: "00000000-0000-4000-8000-000000000042",
  athleteId: "athlete-fictif",
  athleteName: "Athlète Fictif",
  sourceName: "Source officielle fictive",
  articleUrl: "https://example.test/match-fictif",
  title: "Club Fictif 82-74 Rival Fictif",
  excerpt: "Résultat individuel vérifié : 82-74.",
  resultKind: "individual_result",
  publicationDate: "2026-11-10T08:00:00.000Z",
  eventDateFrom: "2026-11-09",
  eventDateTo: "2026-11-09",
  collectedAt: "2026-11-10T09:00:00.000Z",
  verificationStatus: "verified",
  adminStatus: "validated",
  provesIndividualParticipation: true,
  verifiedStatistics: [{ label: "Points", value: "18" }],
  materials: [{
    id: "sports-watch-00000000-0000-4000-8000-000000000042-1",
    kind: "note",
    text: "Résultat individuel vérifié : 82-74, 18 points.",
    provenance: "Source officielle fictive · Vérification factuelle : vérifiée",
    sourceDate: "2026-11-09",
    sourceType: "external",
    verificationStatus: "verified",
    statementType: "fact",
    category: "result",
    sourceUrl: "https://example.test/match-fictif",
  }],
};

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SportsBriefScreen", () => {
  it("rehydrates the explicit candidate server-side and renders facts and editor", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        context: { selectedCandidateId: candidate.id, candidates: [candidate] },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<SportsBriefScreen initialCandidateId={candidate.id} />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/sports-watch/brief-context?candidateId=${candidate.id}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(container.querySelector(".sports-brief-workspace")).not.toBeNull();
    expect(container.textContent).toContain("Faits et source");
    expect(container.textContent).toContain("À vérifier — exclu de la génération".replace("À vérifier — exclu de la génération", "Fait vérifié"));
    expect(container.textContent).toContain("Performance individuelle");
  });

  it("shows the eligible news picker without an explicit candidate", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        context: { selectedCandidateId: null, candidates: [candidate] },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<SportsBriefScreen />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/sports-watch/brief-context",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(container.textContent).toContain("Choisir une actualité éligible");
    expect(container.querySelector(".sports-brief-candidate")).not.toBeNull();
  });
});
