// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/app-shell/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: () => createElement("div"),
}));

import { Sidebar } from "@/components/app-shell/Sidebar";

let container: HTMLElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(Sidebar, {
      pathname: "/media/athletes",
      collapsed: false,
      onToggleCollapsed: vi.fn(),
      mobileOpen: false,
      onCloseMobile: vi.fn(),
      userRole: "media",
      userIsMedia: true,
      userName: "Reporter Média",
    }));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("media sidebar navigation", () => {
  it("keeps existing destinations and adds the athlete directory", () => {
    const hrefs = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));

    expect(hrefs).toContain("/media-desk");
    expect(hrefs).toContain("/media/athletes");
    expect(hrefs).toContain("/contents");
    expect(hrefs).not.toContain("/crm");
    expect(container.querySelector('a[href="/media/athletes"]')?.textContent).toContain("Athlètes");
    expect(container.querySelector('a[href="/media/athletes"]')?.className).toContain("is-active");
  });
});