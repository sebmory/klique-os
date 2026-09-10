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
  it("wraps both navigation blocks in the scrollable area of the desktop sidebar", async () => {
    await mount();

    const sidebar = container.querySelector("aside.klique-sidebar") as HTMLElement;
    const scroll = sidebar.querySelector(":scope > .sidebar-scroll") as HTMLElement;

    expect(scroll).not.toBeNull();
    expect(scroll.querySelectorAll("nav.sidebar-nav-block")).toHaveLength(2);
    expect(scroll.textContent).toContain("Analytics");
    expect(scroll.textContent).toContain("Integrations");
    expect(scroll.textContent).toContain("Parametres");
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
    expect(scroll.querySelectorAll("nav.sidebar-nav-block")).toHaveLength(2);
    expect(scroll.textContent).toContain("Parametres");
    expect(drawer.querySelector(":scope > header .klique-logo")).not.toBeNull();
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
