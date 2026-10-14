// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/app-shell/icons", () => ({
  Search: () => createElement("span", null, "Search"),
}));

import { GlobalSearch } from "@/components/app-shell/GlobalSearch";
import { openNotificationsEvent } from "@/components/app-shell/data";

let container: HTMLElement;
let root: Root;

const mount = async (userRole?: string) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(GlobalSearch, { userRole }));
  });
  await act(async () => {
    container.querySelector('button[aria-label="Ouvrir la recherche globale"]')?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("GlobalSearch role filtering", () => {
  it("shows only authorized partner destinations and commands", async () => {
    await mount("partner_expert");

    const content = container.textContent ?? "";
    expect(content).toContain("Accueil Partenaire");
    expect(content).toContain("Communauté");
    expect(content).toContain("Annuaire des athlètes");
    expect(content).toContain("Fiches Athlètes publiques");
    expect(content).toContain("Mes mises en relation");
    expect(content).toContain("Réservations d’avantages");
    expect(content).toContain("Notifications");
    expect(content).toContain("Mon espace / profil");
    expect(content).not.toContain("Creer une personne");
    expect(content).not.toContain("Creer un projet");
    expect(content).not.toContain("Portraits Premium Avril");
    expect(content).not.toContain("Elfic Fribourg");
    expect(content).not.toMatch(/\bHUB\b|\bHub\b/);

    const hrefs = Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/partner/community");
    expect(hrefs).toContain("/partner/benefit-reservations");
    expect(hrefs.every((href) => href === "/partner" || href === "/partner/community" || href === "/partner/athletes" || href === "/partner/contact-requests" || href === "/partner/benefit-reservations")).toBe(true);
  });

  it("shows the Admin catalog only to Admins", async () => {
    await mount("admin");

    const hrefs = Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/crm/personnes");
    expect(hrefs).toContain("/production");
    expect(hrefs).toContain("/settings");
    expect(hrefs).not.toContain("/athlete");
    expect(hrefs).not.toContain("/media/athletes");
    expect(hrefs).not.toContain("/creative");
  });

  it.each([
    ["athlete", ["/athlete", "/athlete/profile", "/athlete/services", "/athlete/community"]],
    ["media", ["/media-desk", "/media/athletes", "/contents"]],
    ["creative", ["/creative"]],
  ] as const)("limits the %s catalog to its own destinations", async (userRole, allowedHrefs) => {
    await mount(userRole);

    const hrefs = Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining([...allowedHrefs]));
    expect(hrefs.every((href) => href !== null && allowedHrefs.includes(href as never))).toBe(true);
    expect(hrefs).not.toContain("/crm/personnes");
    expect(hrefs).not.toContain("/settings");
  });

  it("does not expose commands to an unknown role", async () => {
    await mount("unknown");
    expect(container.querySelectorAll(".command-results a")).toHaveLength(0);
    expect(container.textContent).toContain("Aucun resultat");
  });

  it("dispatches the local notifications command without navigating", async () => {
    const eventListener = vi.fn();
    window.addEventListener(openNotificationsEvent, eventListener);
    await mount("partner_expert");

    const notificationsButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Notifications"));
    await act(async () => {
      notificationsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(eventListener).toHaveBeenCalledOnce();
    expect(routerPushMock).not.toHaveBeenCalled();
    window.removeEventListener(openNotificationsEvent, eventListener);
  });
});