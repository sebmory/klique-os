// @vitest-environment jsdom
import { act } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTodayCockpit } from "@/components/app-shell/AdminTodayCockpit";
import { adminNavigationGroups } from "@/components/app-shell/data";
import {
  athleteRequestStatusPresentation,
  creativeApplicationStatusPresentation,
  creativeMissionQueueStatusPresentation,
  creativeMissionResponseStatusPresentation,
  partnerIntroductionModerationStatusPresentation,
  partnerIntroductionStatusPresentation,
  sportsWatchStatusPresentation,
} from "@/lib/status-presentation";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("cockpit Admin Aujourd’hui", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("rend exactement trois zones compactes, masque les zéros et expose les totaux Sports Watch", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/actions")) {
        return jsonResponse({
          items: [
            { id: "creative-applications", label: "Candidatures créatives", count: 0, href: "/crm/creatifs" },
            {
              id: "athlete-requests",
              label: "Demandes Athlètes",
              count: 1,
              priority: "haute",
              oldestAt: null,
              ageLabel: null,
              href: "/crm/demandes",
            },
            {
              id: "sports-watch",
              label: "Sports Watch",
              count: 5,
              actionCount: 5,
              priority: "haute",
              oldestAt: "2026-11-01T10:00:00.000Z",
              ageLabel: "Depuis 9 jours",
              href: "/sports-watch",
              details: [
                { label: "À examiner", count: 2 },
                { label: "À exploiter", count: 3 },
              ],
            },
          ],
          errors: [],
        });
      }
      return jsonResponse({ items: [] });
    }));

    await act(async () => {
      root.render(<AdminTodayCockpit />);
      await flush();
    });

    expect(container.querySelectorAll("main > section")).toHaveLength(3);
    expect(container.textContent).toContain("À traiter maintenant");
    expect(container.textContent).toContain("Prochaines échéances");
    expect(container.textContent).toContain("Accès rapides");
    expect(container.textContent).not.toContain("Candidatures créatives");
    expect(container.textContent).toContain("À examiner 2");
    expect(container.textContent).toContain("À exploiter 3");
    expect(container.textContent).toContain("Priorité haute");
    expect(container.textContent).toContain("Depuis 9 jours");
    expect(container.textContent).toContain("Aucune ancienneté disponible");
    expect(container.textContent).toContain("Voir les éléments");
    expect(container.querySelectorAll(".today-action-link")).toHaveLength(2);
    expect(container.querySelectorAll(".today-action-priority")).toHaveLength(2);
    expect(container.textContent).toContain("6 actions");
    expect(container.textContent).not.toMatch(/binding|reconciliation|dismissed|source key|version/i);
  });

  it("isole une zone en erreur et permet de la relancer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [], errors: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<AdminTodayCockpit />);
      await flush();
    });
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(container.textContent).toContain("Prochaines échéances");

    const retry = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Réessayer");
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("déclare la navigation et un dictionnaire complet", () => {
    expect(adminNavigationGroups.flatMap((group) => group.items)
      .some((item) => item.href === "/sports-watch")).toBe(true);
    for (const dictionary of [
      athleteRequestStatusPresentation,
      creativeMissionQueueStatusPresentation,
      creativeMissionResponseStatusPresentation,
      creativeApplicationStatusPresentation,
      partnerIntroductionStatusPresentation,
      partnerIntroductionModerationStatusPresentation,
      sportsWatchStatusPresentation,
    ]) {
      expect(Object.keys(dictionary).length).toBeGreaterThan(0);
      expect(Object.values(dictionary).every((item) =>
        item.label && item.tone && item.description && item.nextAction)).toBe(true);
    }
  });

  it("propose exactement les huit accès rapides demandés avec une description", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/actions")
        ? jsonResponse({ items: [], errors: [] })
        : jsonResponse({ items: [] })));
    await act(async () => {
      root.render(<AdminTodayCockpit />);
      await flush();
    });
    const links = Array.from(container.querySelectorAll(".today-quick-links a"));
    expect(links.map((link) => ({
      label: link.querySelector("strong")?.textContent,
      href: link.getAttribute("href"),
    }))).toEqual([
      { label: "Athlètes", href: "/crm/personnes" },
      { label: "Créatifs", href: "/crm/creatifs" },
      { label: "Partenaires & experts", href: "/ecosysteme" },
      { label: "Médias", href: "/media" },
      { label: "Missions", href: "/missions" },
      { label: "Sports Watch", href: "/sports-watch" },
      { label: "Création de contenu", href: "/contents" },
      { label: "Production", href: "/production" },
    ]);
    expect(links.every((link) => Boolean(link.querySelector("span")?.textContent))).toBe(true);
  });

  it("prévoit une grille mobile 390 px sans débordement et ne remonte plus l’ancien tableau", () => {
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
    const todayPage = readFileSync(path.join(process.cwd(), "app", "today", "page.tsx"), "utf8");
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toMatch(/\.today-action-grid\s*\{\s*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/html,\s*body\s*\{[\s\S]*?overflow-x:\s*hidden;/);
    expect(css).toMatch(/\.admin-today\s*\{[\s\S]*?width:\s*min\(1120px,\s*100%\)/);
    expect(todayPage).not.toContain("WorkspaceLanding");
  });
});
