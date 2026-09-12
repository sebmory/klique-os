// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AthleteVisibilityPage from "@/app/athlete/visibilite/page";

const measuredPublicationId = "11111111-1111-4111-8111-111111111111";
const pendingPublicationId = "22222222-2222-4222-8222-222222222222";

const payload = {
  publications: [
    {
      id: measuredPublicationId,
      format: "photo",
      network: "instagram",
      publishedAt: "2026-09-02",
      link: "https://instagram.com/p/measured",
      title: "Galerie de rentrée",
      editorialCategory: "photo_gallery",
      audienceTracking: { status: "in_progress", theoreticalClosingDate: "2026-10-02" },
    },
    {
      id: pendingPublicationId,
      format: "reel",
      network: "tiktok",
      publishedAt: "2026-09-05",
      link: null,
      title: null,
      editorialCategory: "legacy_unclassified",
      audienceTracking: { status: "closed", theoreticalClosingDate: "2026-10-05" },
    },
  ],
  totals: { totalTracked: 2, totalHistorical: 5, combinedTotal: 7 },
  formatBreakdown: [
    { format: "photo", tracked: 1, historical: 5, combined: 6 },
    { format: "reel", tracked: 1, historical: 0, combined: 1 },
  ],
  audienceSummary: {
    totalDetailedContents: 2,
    contentsWithSnapshot: 1,
    coverageRate: 50,
    totalViews: 1250,
    averageViewsPerMeasuredContent: 1250,
    totalReach: 900,
    totalImpressions: 1500,
    mostViewedContent: { publicationId: measuredPublicationId, views: 1250 },
    byNetwork: [],
    byOrigin: [],
  },
  latestMetrics: [{
    publicationId: measuredPublicationId,
    observedAt: "2026-09-12T10:00:00.000Z",
    views: 1250,
    reach: 900,
    impressions: 1500,
  }],
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root | null = null;

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  await act(async () => {
    created.render(createElement(AthleteVisibilityPage));
  });
};

const metricValue = (label: string) => {
  const item = [...container.querySelectorAll("div")].find(
    (node) => node.querySelector(":scope > small")?.textContent?.trim() === label,
  );
  return item?.querySelector(":scope > strong")?.textContent?.trim();
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(jsonResponse(payload));
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => {
      current.unmount();
    });
    container.remove();
    root = null;
  }
  vi.unstubAllGlobals();
});

describe("KLIQUE Visibility Athlete page audiences", () => {
  it("renders audience KPIs while preserving existing counters and format breakdown", async () => {
    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/athlete/klique-visibility", {
      credentials: "include",
      cache: "no-store",
    });
    expect(metricValue("Vues cumulées")).toMatch(/1.?250/);
    expect(metricValue("Moyenne par contenu mesuré")).toMatch(/1.?250/);
    expect(metricValue("Contenus mesurés")).toBe("1");
    expect(metricValue("Suivi des audiences")).toBe("1 publication sur 2 renseignée — 50 %");

    expect(metricValue("Suivi détaillé")).toBe("2");
    expect(metricValue("Historique")).toBe("5");
    expect(metricValue("Total combiné")).toBe("7");
    expect(container.textContent).toContain("Suivi détaillé : 1 · Historique : 5");
  });

  it("shows the latest views per publication and the explicit empty audience state", async () => {
    await mount();

    const measured = container.querySelector(`[data-publication-id="${measuredPublicationId}"]`);
    const pending = container.querySelector(`[data-publication-id="${pendingPublicationId}"]`);
    expect(measured?.textContent).toContain("Galerie de rentrée");
    expect(measured?.textContent).toContain("Galerie photo");
    expect(measured?.textContent).toContain("Audience en cours");
    expect(measured?.textContent).toContain("clôture théorique le 02 octobre 2026");
    expect(measured?.textContent).toContain("Instagram");
    expect(measured?.textContent).toContain("Photo");
    expect(measured?.querySelector("a")?.getAttribute("href")).toBe("https://instagram.com/p/measured");
    expect(measured?.textContent).toMatch(/1.?250 vues/);
    expect(measured?.textContent).toContain("Relevé du");
    expect(pending?.textContent).toContain("Publication non classée");
    expect(pending?.textContent).toContain("Suivi bouclé");
    expect(pending?.textContent).toContain("TikTok");
    expect(pending?.textContent).toContain("Reel");
    expect(pending?.textContent).toContain("Audience pas encore renseignée");
  });

  it("explains that audience figures cover only measured content", async () => {
    await mount();

    expect(container.textContent).toContain(
      "Les chiffres d’audience concernent uniquement les contenus pour lesquels un relevé a déjà été enregistré.",
    );
    expect(container.textContent).toContain(
      "Les audiences sont généralement suivies pendant les 30 premiers jours suivant la publication. Elles peuvent être actualisées ultérieurement lorsqu’un contenu continue de progresser.",
    );
    expect(container.textContent).not.toContain("pas les vues ni la portée sur les réseaux sociaux");
  });
});