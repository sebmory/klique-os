// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PartnerCommunityPage from "@/app/partner/community/page";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const response = (payload: Record<string, unknown>, ok = true) => ({
  ok,
  json: async () => payload,
});

const click = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label));
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(PartnerCommunityPage));
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("PartnerCommunityPage", () => {
  it("shows a loading state for every tab while its GET is pending", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    await mount();

    expect(container.textContent).toContain("Chargement des actualités…");
    await click("Opportunités");
    expect(container.textContent).toContain("Chargement des opportunités…");
    await click("Avantages");
    expect(container.textContent).toContain("Chargement des avantages…");
    await click("Ressources");
    expect(container.textContent).toContain("Chargement des ressources…");
  });

  it("loads and displays all four read-only projections", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/partner/community") return response({ publications: [{ id: "news-1", title: "Nouveau programme", content: "Une actualité publique", createdAt: "2026-09-16", authorDisplayName: "KLIQUE", authorSpecialty: "Communauté" }] });
      if (url === "/api/partner/opportunities") return response({ opportunities: [{ id: "opportunity-1", title: "Projet photo", type: "Collaboration", organization: "KLIQUE", location: "Lausanne", date: "2026-10-10", description: "Une collaboration ouverte", status: "Ouverte", requirements: "Portfolio", practicalInfo: "Une journée" }] });
      if (url === "/api/partner/benefits") return response({ benefits: [{ id: "benefit-1", name: "Studio Alpha", category: "Santé", memberOffer: "20% membres", benefitDetails: "Sur présentation du pass", description: "Récupération", logoUrl: "", website: "https://alpha.example.com" }] });
      if (url === "/api/partner/resources") return response({ resources: [{ id: "resource-1", title: "Guide récupération", category: "Santé", author: "KLIQUE", type: "Guide", description: "Conseils pratiques", content: "", url: null, coverImageUrl: null, date: "2026-09-16" }] });
      return response({}, false);
    });
    await mount();

    expect(container.textContent).toContain("Nouveau programme");
    await click("Opportunités");
    expect(container.textContent).toContain("Projet photo");
    await click("Avantages");
    expect(container.textContent).toContain("20% membres");
    await click("Ressources");
    expect(container.textContent).toContain("Guide récupération");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/partner/community",
      "/api/partner/opportunities",
      "/api/partner/benefits",
      "/api/partner/resources",
    ]);
    expect(fetchMock.mock.calls.every(([, options]) => options?.method === undefined)).toBe(true);
    expect(container.textContent).not.toMatch(/Réagir|Commenter|Intéressé|Créer|Modifier|Supprimer/);
  });

  it("shows an empty state for every tab", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/community")) return response({ publications: [] });
      if (url.endsWith("/opportunities")) return response({ opportunities: [] });
      if (url.endsWith("/benefits")) return response({ benefits: [] });
      return response({ resources: [] });
    });
    await mount();

    expect(container.textContent).toContain("Aucune actualité");
    await click("Opportunités");
    expect(container.textContent).toContain("Aucune opportunité");
    await click("Avantages");
    expect(container.textContent).toContain("Aucun avantage");
    await click("Ressources");
    expect(container.textContent).toContain("Aucune ressource");
  });

  it("shows an isolated error and retry action for every tab", async () => {
    fetchMock.mockResolvedValue(response({}, false));
    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("actualités");
    await click("Opportunités");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("opportunités");
    await click("Avantages");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("avantages");
    await click("Ressources");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ressources");
  });

  it("loads resource content from the dedicated detail GET", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/partner/community") return response({ publications: [] });
      if (url === "/api/partner/opportunities") return response({ opportunities: [] });
      if (url === "/api/partner/benefits") return response({ benefits: [] });
      if (url === "/api/partner/resources") return response({ resources: [{ id: "resource-1", title: "Guide récupération", category: "Santé", author: "KLIQUE", type: "Guide", description: "Conseils pratiques", content: "", url: null, coverImageUrl: null, date: "2026-09-16" }] });
      if (url === "/api/partner/resources/resource-1") return response({ resource: { id: "resource-1", title: "Guide récupération", category: "Santé", author: "KLIQUE", type: "Guide", description: "Conseils pratiques", content: "Contenu éditorial complet", url: null, coverImageUrl: null, date: "2026-09-16" } });
      return response({}, false);
    });
    await mount();
    await click("Ressources");
    await click("Consulter");

    expect(fetchMock).toHaveBeenCalledWith("/api/partner/resources/resource-1", {
      credentials: "include",
      cache: "no-store",
    });
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Contenu éditorial complet");
  });
});