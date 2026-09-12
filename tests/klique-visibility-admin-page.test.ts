// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import KliqueVisibilityAdminPage from "@/app/analytics/visibilite/page";

const publicationId = "11111111-1111-4111-8111-111111111111";
const distributedPublicationId = "22222222-2222-4222-8222-222222222222";
const externalPublicationId = "33333333-3333-4333-8333-333333333333";
const unclassifiedPublicationId = "44444444-4444-4444-8444-444444444444";

const overview = {
  trackingSettings: {
    workspaceId: "workspace-a",
    trackingStartDate: "2026-09-01",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  },
  publications: [
    {
      id: publicationId,
      workspaceId: "workspace-a",
      format: "photo",
      network: "instagram",
      publishedAt: "2026-09-02",
      link: "https://instagram.com/p/example",
      title: "Galerie de rentrée",
      editorialCategory: "photo_gallery",
      audienceTracking: { status: "in_progress", theoreticalClosingDate: "2026-10-02" },
      origin: "klique_owned",
      publisherName: "KLIQUE",
      externalPostId: "example",
      athleteIds: ["athlete-1"],
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
    },
    {
      id: distributedPublicationId,
      workspaceId: "workspace-a",
      format: "reel",
      network: "tiktok",
      publishedAt: "2026-09-03",
      link: null,
      title: "Dans les coulisses",
      editorialCategory: "behind_the_scenes",
      audienceTracking: { status: "closed", theoreticalClosingDate: "2026-10-03" },
      origin: "klique_distributed",
      publisherName: "Partenaire",
      externalPostId: "distributed",
      athleteIds: ["athlete-1"],
      createdAt: "2026-09-03T10:00:00.000Z",
      updatedAt: "2026-09-03T10:00:00.000Z",
    },
    {
      id: externalPublicationId,
      workspaceId: "workspace-a",
      format: "article",
      network: "youtube",
      publishedAt: "2026-09-04",
      link: null,
      title: "Interview de saison",
      editorialCategory: "interview",
      audienceTracking: { status: "in_progress", theoreticalClosingDate: "2026-10-04" },
      origin: "external_coverage",
      publisherName: "Média externe",
      externalPostId: "external",
      athleteIds: ["athlete-1"],
      createdAt: "2026-09-04T10:00:00.000Z",
      updatedAt: "2026-09-04T10:00:00.000Z",
    },
    {
      id: unclassifiedPublicationId,
      workspaceId: "workspace-a",
      format: "photo",
      network: "instagram",
      publishedAt: "2026-09-05",
      link: null,
      title: null,
      editorialCategory: "legacy_unclassified",
      audienceTracking: { status: "closed", theoreticalClosingDate: "2026-10-05" },
      origin: "legacy_unclassified",
      publisherName: null,
      externalPostId: null,
      athleteIds: ["athlete-1"],
      createdAt: "2026-09-05T10:00:00.000Z",
      updatedAt: "2026-09-05T10:00:00.000Z",
    },
  ],
  historyEntries: [],
  totals: {
    totalPublications: 1,
    totalHistorical: 0,
    combinedTotal: 1,
    perAthlete: { "athlete-1": { publications: 1, historical: 0, combined: 1 } },
  },
  metricSnapshots: [
    {
      id: "metric-old",
      workspaceId: "workspace-a",
      publicationId,
      observedAt: "2026-09-10T10:00:00.000Z",
      views: 900,
      reach: 800,
      impressions: 1000,
      source: "manual",
      createdByClerkUserId: "admin-1",
      createdAt: "2026-09-10T10:01:00.000Z",
    },
    {
      id: "metric-latest",
      workspaceId: "workspace-a",
      publicationId,
      observedAt: "2026-09-12T10:00:00.000Z",
      views: 1200,
      reach: 950,
      impressions: 1500,
      source: "manual",
      createdByClerkUserId: "admin-1",
      createdAt: "2026-09-12T10:01:00.000Z",
    },
    {
      id: "metric-distributed",
      workspaceId: "workspace-a",
      publicationId: distributedPublicationId,
      observedAt: "2026-09-12T10:00:00.000Z",
      views: 700,
      reach: 600,
      impressions: 800,
      source: "manual",
      createdByClerkUserId: "admin-1",
      createdAt: "2026-09-12T10:01:00.000Z",
    },
    {
      id: "metric-external",
      workspaceId: "workspace-a",
      publicationId: externalPublicationId,
      observedAt: "2026-09-12T10:00:00.000Z",
      views: 500,
      reach: 400,
      impressions: 600,
      source: "manual",
      createdByClerkUserId: "admin-1",
      createdAt: "2026-09-12T10:01:00.000Z",
    },
    {
      id: "metric-unclassified",
      workspaceId: "workspace-a",
      publicationId: unclassifiedPublicationId,
      observedAt: "2026-09-12T10:00:00.000Z",
      views: 999,
      reach: 900,
      impressions: 1100,
      source: "manual",
      createdByClerkUserId: "admin-1",
      createdAt: "2026-09-12T10:01:00.000Z",
    },
  ],
  audienceSummary: {
    totalDetailedContents: 4,
    contentsWithSnapshot: 4,
    coverageRate: 100,
    totalViews: 3399,
    averageViewsPerMeasuredContent: 849.75,
    totalReach: 2850,
    totalImpressions: 4000,
    mostViewedContent: { publicationId, views: 1200 },
    byNetwork: [
      { network: "instagram", totalContents: 2, contentsWithSnapshot: 2, coverageRate: 100, totalViews: 2199, averageViewsPerMeasuredContent: 1099.5, totalReach: 1850, totalImpressions: 2600 },
      { network: "tiktok", totalContents: 1, contentsWithSnapshot: 1, coverageRate: 100, totalViews: 700, averageViewsPerMeasuredContent: 700, totalReach: 600, totalImpressions: 800 },
      { network: "youtube", totalContents: 1, contentsWithSnapshot: 1, coverageRate: 100, totalViews: 500, averageViewsPerMeasuredContent: 500, totalReach: 400, totalImpressions: 600 },
    ],
    byOrigin: [
      { origin: "klique_owned", totalContents: 1, contentsWithSnapshot: 1, coverageRate: 100, totalViews: 1200, averageViewsPerMeasuredContent: 1200, totalReach: 950, totalImpressions: 1500 },
      { origin: "klique_distributed", totalContents: 1, contentsWithSnapshot: 1, coverageRate: 100, totalViews: 700, averageViewsPerMeasuredContent: 700, totalReach: 600, totalImpressions: 800 },
      { origin: "external_coverage", totalContents: 1, contentsWithSnapshot: 1, coverageRate: 100, totalViews: 500, averageViewsPerMeasuredContent: 500, totalReach: 400, totalImpressions: 600 },
      { origin: "legacy_unclassified", totalContents: 1, contentsWithSnapshot: 1, coverageRate: 100, totalViews: 999, averageViewsPerMeasuredContent: 999, totalReach: 900, totalImpressions: 1100 },
    ],
  },
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root | null = null;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  await act(async () => {
    created.render(createElement(KliqueVisibilityAdminPage));
  });
};

const findButton = (label: string) =>
  [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);

const click = async (element: Element | undefined) => {
  expect(element).toBeDefined();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const setFieldValue = async (element: HTMLInputElement | HTMLSelectElement, value: string) => {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const labelledInput = (label: string) => {
  const field = [...container.querySelectorAll("label")].find(
    (node) => node.querySelector("span")?.textContent?.trim() === label,
  );
  return field?.querySelector("input") as HTMLInputElement;
};

const labelledSelect = (label: string) => {
  const field = [...container.querySelectorAll("label")].find(
    (node) => node.querySelector("span")?.textContent?.trim() === label,
  );
  return field?.querySelector("select") as HTMLSelectElement;
};

const kpiValue = (label: string) => {
  const item = [...container.querySelectorAll(".crm-person-kpi-item")].find(
    (node) => node.querySelector("small")?.textContent?.trim() === label,
  );
  return item?.querySelector("strong")?.textContent?.trim();
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/athletes") {
      return jsonResponse({ athletes: [{ key: "athlete-1", name: "Athlète Test" }] });
    }
    if (url === "/api/admin/klique-visibility" && init?.method === "POST") {
      return jsonResponse({ metricSnapshot: overview.metricSnapshots[1] });
    }
    return jsonResponse(overview);
  });
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

describe("KLIQUE Visibility Admin page audiences", () => {
  it("renders audience KPIs and only the latest metric for each publication", async () => {
    await mount();

    expect(kpiValue("Vues cumulées")).toMatch(/3.?399/);
    expect(kpiValue("Moyenne par contenu renseigné")).toBe("850");
    expect(kpiValue("Contenus mesurés / détaillés")).toBe("4 / 4");
    expect(kpiValue("Suivi des audiences")).toBe("4 publications sur 4 renseignées — 100 %");

    const row = container.querySelector(`[data-publication-id="${publicationId}"]`);
    expect(row?.textContent).toContain("Dernier relevé");
    expect(row?.textContent).toContain("Galerie de rentrée");
    expect(row?.textContent).toContain("Catégorie éditoriale : Galerie photo");
    expect(row?.textContent).toContain("Audience en cours");
    expect(row?.textContent).toContain("clôture théorique le 02.10.2026");
    expect(row?.textContent).toMatch(/1.?200 vues/);
    expect([...row!.querySelectorAll("button")].some((button) => button.textContent === "Ajouter un relevé")).toBe(true);
    expect(row?.textContent).not.toMatch(/900 vues/);
    expect(container.textContent).toContain("Ajouter une publication");
    expect(container.textContent).toContain("Saisir l’historique");

    const legacyRow = container.querySelector(`[data-publication-id="${unclassifiedPublicationId}"]`);
    expect(legacyRow?.textContent).toContain("Sans intitulé");
    expect(legacyRow?.textContent).toContain("Catégorie éditoriale : À classifier");

    const closedRow = container.querySelector(`[data-publication-id="${distributedPublicationId}"]`);
    expect(closedRow?.textContent).toContain("Suivi bouclé");
    expect([...closedRow!.querySelectorAll("button")].some((button) => button.textContent === "Ajouter un relevé")).toBe(true);
  });

  it("requires editorial fields and sends them when creating and updating a publication", async () => {
    await mount();

    const category = labelledSelect("Catégorie éditoriale");
    expect([...category.options].map((option) => option.value)).toEqual([
      "",
      "athlete_welcome",
      "photo_gallery",
      "athlete_of_month",
      "interview",
      "portrait",
      "performance",
      "media_day",
      "news",
      "partner_expert",
      "behind_the_scenes",
      "event",
      "other",
    ]);

    const submit = findButton("Ajouter la publication") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const title = labelledInput("Titre de la publication");
    expect(title.placeholder).toBe("Ex. Bienvenue chez KLIQUE – Armand Angha");
    await setFieldValue(title, "  Portrait de rentrée  ");
    await setFieldValue(category, "portrait");
    await setFieldValue(labelledInput("Date de publication"), "2026-09-06");
    await click(container.querySelector('input[type="checkbox"]') ?? undefined);
    expect(submit.disabled).toBe(false);
    await click(submit);

    const createCall = fetchMock.mock.calls.find(([, init]) => {
      if ((init as RequestInit | undefined)?.method !== "POST") return false;
      return JSON.parse(String((init as RequestInit).body)).action === "create_publication";
    });
    expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toMatchObject({
      action: "create_publication",
      publication: {
        title: "Portrait de rentrée",
        editorialCategory: "portrait",
      },
    });

    await click(findButton("Modifier"));
    expect(labelledInput("Titre de la publication").value).toBe("Galerie de rentrée");
    expect(labelledSelect("Catégorie éditoriale").value).toBe("photo_gallery");
    await setFieldValue(labelledInput("Titre de la publication"), "Galerie mise à jour");
    await setFieldValue(labelledSelect("Catégorie éditoriale"), "event");
    await click(findButton("Enregistrer les modifications"));

    const updateCall = fetchMock.mock.calls.find(([, init]) => {
      if ((init as RequestInit | undefined)?.method !== "PATCH") return false;
      return JSON.parse(String((init as RequestInit).body)).action === "update_publication";
    });
    expect(JSON.parse(String((updateCall?.[1] as RequestInit).body))).toMatchObject({
      action: "update_publication",
      publicationId,
      publication: {
        title: "Galerie mise à jour",
        editorialCategory: "event",
      },
    });
  });

  it("renders commercial impact without legacy-unclassified audience", async () => {
    await mount();

    expect(kpiValue("Audience des contenus KLIQUE")).toMatch(/1.?900 vues/);
    expect(kpiValue("Visibilité totale recensée")).toMatch(/2.?400 vues/);
    expect(kpiValue("Audience de la couverture externe")).toBe("500 vues");
    expect(kpiValue("Publications non classées")).toBe("1");

    const impactSection = [...container.querySelectorAll("section")].find(
      (section) => section.querySelector("h2")?.textContent?.trim() === "Impact KLIQUE",
    );
    expect(impactSection?.textContent).toMatch(/Instagram : 1.?200 vues/);
    expect(impactSection?.textContent).toContain("TikTok : 700 vues");
    expect(impactSection?.textContent).toContain("YouTube : 500 vues");
    expect(impactSection?.textContent).not.toMatch(/Instagram : 2.?199 vues/);
    expect(impactSection?.textContent).toContain("Les chiffres commerciaux excluent les publications non classées.");
    expect(impactSection?.textContent).toContain("depuis le début du suivi détaillé");
  });

  it("posts a manual metric payload and reloads the overview after success", async () => {
    await mount();
    await click(findButton("Ajouter un relevé"));

    const observedAt = "2026-09-12T14:30";
    await setFieldValue(labelledInput("Date du relevé"), observedAt);
    await setFieldValue(labelledInput("Vues"), "1800");
    await setFieldValue(labelledInput("Portée (facultative)"), "1400");
    await setFieldValue(labelledInput("Impressions (facultatives)"), "2100");
    await click(findButton("Enregistrer le relevé"));

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCall?.[0]).toBe("/api/admin/klique-visibility");
    expect(JSON.parse(String((postCall?.[1] as RequestInit).body))).toEqual({
      action: "metric_snapshot",
      publicationId,
      observedAt: new Date(observedAt).toISOString(),
      views: 1800,
      reach: 1400,
      impressions: 2100,
    });

    const overviewReads = fetchMock.mock.calls.filter(
      ([url, init]) => url === "/api/admin/klique-visibility" && !(init as RequestInit | undefined)?.method,
    );
    expect(overviewReads).toHaveLength(2);
  });

  it("requires views and sends omitted reach and impressions as null", async () => {
    await mount();
    await click(findButton("Ajouter un relevé"));

    const submit = findButton("Enregistrer le relevé") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const observedAt = "2026-09-12T16:00";
    await setFieldValue(labelledInput("Date du relevé"), observedAt);
    expect(submit.disabled).toBe(true);
    await setFieldValue(labelledInput("Vues"), "0");
    expect(submit.disabled).toBe(false);
    await click(submit);

    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((postCall?.[1] as RequestInit).body))).toMatchObject({
      action: "metric_snapshot",
      publicationId,
      views: 0,
      reach: null,
      impressions: null,
    });
  });

  it("prefills and updates the publication content origin, then reloads the overview", async () => {
    await mount();

    const row = container.querySelector(`[data-publication-id="${publicationId}"]`);
    expect(row?.textContent).toContain("Origine du contenu : Publié par KLIQUE");
    await click(findButton("Modifier l’origine"));

    const origin = labelledSelect("Origine");
    const publisherName = labelledInput("Nom du diffuseur (facultatif)");
    const externalPostId = labelledInput("Identifiant externe (facultatif)");
    expect([...origin.options].map((option) => option.textContent)).toEqual([
      "Non classé",
      "Publié par KLIQUE",
      "Contenu KLIQUE diffusé par un tiers",
      "Couverture externe",
    ]);
    expect(origin.value).toBe("klique_owned");
    expect(publisherName.value).toBe("KLIQUE");
    expect(externalPostId.value).toBe("example");

    await setFieldValue(origin, "klique_distributed");
    await setFieldValue(publisherName, "  Média partenaire  ");
    await setFieldValue(externalPostId, "  external-42  ");
    await click(findButton("Enregistrer l’origine"));

    const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
    expect(patchCall?.[0]).toBe("/api/admin/klique-visibility");
    expect(JSON.parse(String((patchCall?.[1] as RequestInit).body))).toEqual({
      action: "classification",
      publicationId,
      origin: "klique_distributed",
      publisherName: "Média partenaire",
      externalPostId: "external-42",
    });

    const overviewReads = fetchMock.mock.calls.filter(
      ([url, init]) => url === "/api/admin/klique-visibility" && !(init as RequestInit | undefined)?.method,
    );
    expect(overviewReads).toHaveLength(2);
  });
});