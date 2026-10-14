// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import { ModuleGuideForRoute } from "@/components/app-shell/ModuleGuide";
import {
  adminModuleGuideRoutes,
  resolveModuleGuide,
} from "@/components/app-shell/module-guide-config";

const expectedAdminRoutes = [
  "/today",
  "/calendar",
  "/analytics/visibilite",
  "/crm/personnes",
  "/crm/creatifs",
  "/ecosysteme",
  "/crm/demandes",
  "/production",
  "/missions",
  "/media",
  "/media-days",
  "/media-desk",
  "/shooting/assistant",
  "/contents",
  "/contents/story-studio/brand-kits",
  "/hub",
  "/settings",
  "/settings/notifications",
];

const existingLinkedRoutes = new Set([
  "/today",
  "/calendar",
  "/analytics/visibilite",
  "/crm/personnes",
  "/crm/creatifs",
  "/ecosysteme",
  "/crm/demandes",
  "/production",
  "/missions",
  "/media",
  "/media-days",
  "/media-desk",
  "/media/athletes",
  "/shooting/assistant",
  "/contents",
  "/contents/create",
  "/contents/story-studio/brand-kits",
  "/hub",
  "/settings",
  "/settings/athlete-subscriptions",
  "/settings/notifications",
]);

let container: HTMLElement;
let root: Root;

const mount = async (route: string, role: string) => {
  await act(async () => {
    root.render(createElement(ModuleGuideForRoute, { route, role }));
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("ModuleGuide", () => {
  it("covers every requested Admin landing with concise links to existing routes", () => {
    expect(adminModuleGuideRoutes).toEqual(expectedAdminRoutes);

    for (const route of expectedAdminRoutes) {
      const guide = resolveModuleGuide(route, "admin");
      expect(guide, route).not.toBeNull();
      expect(guide?.name.length).toBeGreaterThan(0);
      expect(guide?.purpose.length).toBeGreaterThan(0);
      expect(guide?.start.length).toBeGreaterThan(0);
      expect(guide?.actions.length).toBeGreaterThanOrEqual(3);
      expect(guide?.actions.length).toBeLessThanOrEqual(5);
      for (const action of guide?.actions ?? []) {
        expect(existingLinkedRoutes.has(action.href.split("?")[0] ?? action.href), action.href).toBe(true);
      }
    }
  });

  it("renders structured guidance and keeps the usage steps collapsed initially", async () => {
    await mount("/crm/personnes", "admin");

    expect(container.querySelector("h2")?.textContent).toBe("Athlètes");
    expect(container.querySelector("h3")?.textContent).toContain("Par où commencer");
    expect(container.textContent).toContain("Regroupe les fiches Athlètes");

    const toggle = container.querySelector<HTMLButtonElement>(".module-guide-toggle");
    const chevron = container.querySelector<SVGElement>(".module-guide-toggle-icon");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-controls")).toBeTruthy();
    expect(chevron).not.toBeNull();
    expect(chevron?.classList.contains("is-open")).toBe(false);
    expect(container.querySelector(".module-guide-actions")).toBeNull();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(chevron?.classList.contains("is-open")).toBe(true);
    expect(container.querySelectorAll(".module-guide-actions li")).toHaveLength(3);
    expect(container.querySelector('a[href="/crm/demandes"]')).not.toBeNull();
  });

  it("shows only media-authorized guidance on shared routes", async () => {
    await mount("/contents", "media");
    expect(container.textContent).toContain("Contenus média");

    const toggle = container.querySelector<HTMLButtonElement>(".module-guide-toggle");
    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const hrefs = Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/contents", "/media-desk", "/media/athletes"]));
    expect(hrefs).not.toContain("/contents/story-studio/brand-kits");
    expect(hrefs).not.toContain("/crm/demandes");
    expect(hrefs).not.toContain("/settings");

    const mediaDeskGuide = resolveModuleGuide("/media-desk", "media");
    expect(mediaDeskGuide?.name).toBe("Media Desk");
    expect(mediaDeskGuide?.actions.map((action) => action.href)).toEqual([
      "/media-desk",
      "/media/athletes",
      "/contents",
    ]);
  });

  it("does not expose an Admin guide to external or unknown roles", async () => {
    for (const role of ["athlete", "partner_expert", "creative", "unknown"]) {
      await mount("/today", role);
      expect(container.querySelector(".module-guide")).toBeNull();
    }
    expect(resolveModuleGuide("/media-desk", "athlete")).toBeNull();
  });

  it("is wired once in the authenticated shell before existing page content", () => {
    const appShellSource = readFileSync("components/AppShell.tsx", "utf8");
    const mainIndex = appShellSource.indexOf('<main className="klique-main-content">');
    const guideIndex = appShellSource.indexOf("<ModuleGuideForRoute", mainIndex);
    const authenticatedChildrenIndex = appShellSource.indexOf("{children}", guideIndex);

    expect(appShellSource).toContain("<ModuleGuideForRoute route={pathname} role={userAccess.role} />");
    expect(mainIndex).toBeGreaterThan(-1);
    expect(guideIndex).toBeGreaterThan(mainIndex);
    expect(guideIndex).toBeLessThan(authenticatedChildrenIndex);
  });
});
