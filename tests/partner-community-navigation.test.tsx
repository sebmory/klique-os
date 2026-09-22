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
import { buildBreadcrumb } from "@/components/app-shell/Breadcrumb";
import { mainNavigation, partnerCommandEntries } from "@/components/app-shell/data";
import { isPartnerAllowedPage } from "@/proxy";

let container: HTMLElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(Sidebar, {
      pathname: "/partner/community",
      collapsed: false,
      onToggleCollapsed: vi.fn(),
      mobileOpen: false,
      onCloseMobile: vi.fn(),
      userRole: "partner_expert",
      userIsPartner: true,
      userName: "Studio Alpha",
    }));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("partner community navigation", () => {
  it("adds an active Community destination to the Partner sidebar", () => {
    const link = container.querySelector('a[href="/partner/community"]');

    expect(link?.textContent).toContain("Communauté");
    expect(link?.className).toContain("is-active");
    expect(isPartnerAllowedPage("/partner/community")).toBe(true);
  });

  it("adds Community to Partner search and replaces visible Hub labels only", () => {
    expect(partnerCommandEntries).toContainEqual(expect.objectContaining({
      label: "Communauté",
      href: "/partner/community",
    }));
    expect(mainNavigation.find((item) => item.href === "/hub")).toMatchObject({
      id: "hub",
      label: "Communauté",
      href: "/hub",
    });
    expect(buildBreadcrumb("/hub")).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Communauté", href: "/hub" }),
    ]));
  });

  it("labels the Partner benefit reservations breadcrumb", () => {
    expect(buildBreadcrumb("/partner/benefit-reservations")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Réservations d’avantages",
        href: "/partner/benefit-reservations",
      }),
    ]));
  });
});