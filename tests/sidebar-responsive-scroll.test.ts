// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) =>
    createElement("a", { href, ...props }, children as never),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/components/app-shell/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: () => createElement("div", { className: "workspace-switcher" }, "Workspace"),
}));

import { Sidebar } from "@/components/app-shell/Sidebar";

const css = readFileSync("app/globals.css", "utf8");

const rule = (selector: string): string => {
  const index = css.indexOf(`\n${selector} {`);
  if (index === -1) return "";
  const start = css.indexOf("{", index);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
};

let container: HTMLElement;
let root: Root | null = null;

const mount = async (props: Partial<Parameters<typeof Sidebar>[0]> = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  const created = createRoot(container);
  root = created;
  await act(async () => {
    created.render(
      createElement(Sidebar, {
        pathname: "/today",
        collapsed: false,
        onToggleCollapsed: vi.fn(),
        mobileOpen: false,
        onCloseMobile: vi.fn(),
        userRole: "admin",
        ...props,
      }),
    );
  });
};

beforeEach(() => {
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
});

describe("Sidebar responsive scrolling", () => {
  it("wraps the grouped Admin navigation in the scrollable area of the desktop sidebar", async () => {
    await mount();

    const sidebar = container.querySelector("aside.klique-sidebar") as HTMLElement;
    const scroll = sidebar.querySelector(":scope > .sidebar-scroll") as HTMLElement;

    expect(scroll).not.toBeNull();
    expect(scroll.querySelectorAll("nav.sidebar-nav-block")).toHaveLength(1);
    expect(scroll.textContent).toContain("Pilotage");
    expect(scroll.textContent).toContain("Tableau de bord");
    expect(scroll.textContent).not.toContain("Integrations");
    expect(scroll.textContent).not.toContain("Projets");
  });

  it("keeps the logo, the workspace switcher and the profile outside the scrollable area", async () => {
    await mount();

    const sidebar = container.querySelector("aside.klique-sidebar") as HTMLElement;
    const scroll = sidebar.querySelector(".sidebar-scroll") as HTMLElement;

    expect(sidebar.querySelector(":scope > .sidebar-top-row")).not.toBeNull();
    expect(sidebar.querySelector(":scope > .workspace-switcher")).not.toBeNull();
    expect(sidebar.querySelector(":scope > .header-dropdown .sidebar-profile")).not.toBeNull();
    expect(scroll.querySelector(".sidebar-profile")).toBeNull();
    expect(scroll.querySelector(".klique-logo")).toBeNull();
  });

  it("wraps the mobile drawer navigation in the same scrollable area", async () => {
    await mount({ mobileOpen: true });

    const drawer = container.querySelector("aside.mobile-sidebar-drawer") as HTMLElement;
    const scroll = drawer.querySelector(":scope > .sidebar-scroll") as HTMLElement;

    expect(scroll).not.toBeNull();
    expect(scroll.querySelectorAll("nav.sidebar-nav-block")).toHaveLength(1);
    expect(scroll.textContent).toContain("Pilotage");
    expect(scroll.textContent).toContain("Tableau de bord");
    expect(drawer.querySelector(":scope > header .klique-logo")).not.toBeNull();
  });

  it("opens the active Admin group and selects only the matching CRM route", async () => {
    await mount({ pathname: "/crm/demandes" });

    const desktop = container.querySelector("aside.klique-sidebar") as HTMLElement;
    const relations = Array.from(desktop.querySelectorAll<HTMLButtonElement>(".sidebar-group-trigger"))
      .find((button) => button.textContent?.includes("Relations"));
    const activeLinks = desktop.querySelectorAll("a.sidebar-link.is-active");

    expect(relations?.getAttribute("aria-expanded")).toBe("true");
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]?.getAttribute("href")).toBe("/crm/demandes");
  });

  it("exposes every target Admin route through accessible group buttons", async () => {
    await mount();
    const desktop = container.querySelector("aside.klique-sidebar") as HTMLElement;
    const closedTriggers = Array.from(desktop.querySelectorAll<HTMLButtonElement>(".sidebar-group-trigger"))
      .filter((button) => button.getAttribute("aria-expanded") === "false");

    for (const trigger of closedTriggers) {
      await act(async () => {
        trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }

    const hrefs = Array.from(desktop.querySelectorAll("a")).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining([
      "/today",
      "/analytics/visibilite",
      "/crm/personnes",
      "/crm/creatifs",
      "/ecosysteme",
      "/crm/demandes",
      "/production",
      "/media",
      "/media-days",
      "/media-desk",
      "/shooting/assistant",
      "/contents",
      "/contents/story-studio/brand-kits",
      "/hub",
      "/settings",
      "/settings/notifications",
    ]));
    expect(hrefs).not.toEqual(expect.arrayContaining(["/projects", "/calendar", "/integrations", "/ai-studio"]));
  });

  it("shows the personal creative space only for an Admin with creative access", async () => {
    await mount({ userIsCreative: true });
    const personalSpace = Array.from(
      container.querySelectorAll<HTMLButtonElement>("aside.klique-sidebar .sidebar-group-trigger"),
    ).find((button) => button.textContent?.includes("Espace personnel"));

    expect(personalSpace).toBeDefined();
    expect(personalSpace?.classList.contains("is-active")).toBe(false);
    expect(personalSpace?.classList.contains("is-open")).toBe(false);

    await act(async () => {
      personalSpace?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(personalSpace?.classList.contains("is-open")).toBe(true);

    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;

    await mount({ userIsCreative: false });
    expect(container.textContent).not.toContain("Espace personnel");
  });

  it("keeps the active marker inside the rounded group trigger", () => {
    expect(rule(".sidebar-group-trigger")).toContain("overflow: hidden");
    expect(rule(".sidebar-group-trigger.is-active::before")).toContain("top: 10px");
    expect(rule(".sidebar-group-trigger.is-active::before")).toContain("bottom: 10px");
    expect(rule(".sidebar-group-trigger:focus-visible")).toContain("box-shadow: inset 0 0 0 2px #ffd54a");
    expect(rule(".sidebar-group-trigger:focus-visible")).not.toContain("outline-offset");
  });

  it("uses the Admin dashboard for the logo and the loaded Clerk identity", async () => {
    await mount({ userName: "Alex Martin" });

    const desktop = container.querySelector("aside.klique-sidebar") as HTMLElement;
    expect(desktop.querySelector(".klique-logo")?.getAttribute("href")).toBe("/today");
    expect(desktop.textContent).toContain("Alex Martin");
    expect(desktop.textContent).toContain("AM");
    expect(desktop.textContent).not.toContain("Sebastien Mory");
  });

  it("expands a collapsed desktop group through its keyboard-compatible button", async () => {
    const onToggleCollapsed = vi.fn();
    await mount({ collapsed: true, onToggleCollapsed });
    const relations = Array.from(
      container.querySelectorAll<HTMLButtonElement>("aside.klique-sidebar .sidebar-group-trigger"),
    ).find((button) => button.getAttribute("title") === "Relations");

    await act(async () => {
      relations?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(relations?.tagName).toBe("BUTTON");
    expect(onToggleCollapsed).toHaveBeenCalledOnce();
  });

  it("shows the personal contact requests entry only in partner navigation", async () => {
    await mount({ userRole: "partner_expert", userIsPartner: true });

    const link = Array.from(container.querySelectorAll("a"))
      .find((candidate) => candidate.textContent?.includes("Mes mises en relation"));
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/partner/contact-requests");
  });

  it("shows benefit reservations only in partner navigation", async () => {
    await mount({ userRole: "partner_expert", userIsPartner: true, pathname: "/partner/benefit-reservations" });

    const link = Array.from(container.querySelectorAll("a"))
      .find((candidate) => candidate.textContent?.includes("Réservations d’avantages"));
    expect(link?.getAttribute("href")).toBe("/partner/benefit-reservations");
    expect(link?.className).toContain("is-active");
  });

  it("preserves the athlete navigation without Admin groups", async () => {
    await mount({ userRole: "athlete", userIsAthlete: true, pathname: "/athlete/profile" });

    const desktop = container.querySelector("aside.klique-sidebar") as HTMLElement;
    expect(desktop.querySelector('a[href="/athlete/profile"]')?.className).toContain("is-active");
    expect(desktop.querySelector(".sidebar-nav-groups")).toBeNull();
    expect(desktop.querySelector('a[href="/crm/personnes"]')).toBeNull();
  });

  it("preserves the creative-only navigation without Admin groups", async () => {
    await mount({ userRole: "creative", userIsCreative: true, pathname: "/creative" });

    const desktop = container.querySelector("aside.klique-sidebar") as HTMLElement;
    expect(desktop.querySelector('a.sidebar-link[href="/creative"]')?.className).toContain("is-active");
    expect(desktop.querySelector(".sidebar-nav-groups")).toBeNull();
    expect(desktop.querySelector('a[href="/today"]')).toBeNull();
  });

  it("limits the panels to the visible viewport height", () => {
    expect(rule(".klique-sidebar")).toContain("height: 100dvh");
    expect(rule(".klique-sidebar")).toContain("max-height: 100dvh");
    expect(rule(".klique-sidebar")).toContain("overflow: hidden");
    expect(rule(".mobile-sidebar-drawer")).toContain("max-height: 100dvh");
    expect(rule(".mobile-sidebar-layer")).toContain("height: 100dvh");
  });

  it("makes the navigation area scrollable with touch support", () => {
    const scrollRule = rule(".sidebar-scroll");

    expect(scrollRule).toContain("flex: 1 1 auto");
    expect(scrollRule).toContain("min-height: 0");
    expect(scrollRule).toContain("overflow-y: auto");
    expect(scrollRule).toContain("overscroll-behavior: contain");
    expect(scrollRule).toContain("-webkit-overflow-scrolling: touch");
    expect(scrollRule).toContain("touch-action: pan-y");
  });

  it("never blocks the scroll from a parent container", () => {
    expect(rule(".mobile-sidebar-layer")).not.toContain("overflow: hidden");
    expect(rule(".klique-app")).not.toContain("overflow: hidden");
    expect(css).toContain("overflow-x: hidden");
    expect(rule("html,\nbody")).not.toContain("overflow: hidden");
  });
});
