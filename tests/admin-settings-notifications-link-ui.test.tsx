// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/settings/MediaInviteSection", () => ({
  MediaInviteSection: () => createElement("div", { "data-testid": "media-invite" }),
}));

vi.mock("@/components/settings/MediaCreditsSection", () => ({
  MediaCreditsSection: () => createElement("div", { "data-testid": "media-credits" }),
}));

vi.mock("@/components/settings/ClubAdminSection", () => ({
  ClubAdminSection: () => createElement("div", { "data-testid": "club-admin" }),
}));

import SettingsPage from "@/app/settings/page";

let container: HTMLElement;
let root: Root;

beforeEach(async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SettingsPage />);
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe("Admin settings navigation", () => {
  it("renders Club provisioning in settings", () => {
    expect(container.querySelector('[data-testid="club-admin"]')).not.toBeNull();
  });

  it("links to Athlete subscription management", () => {
    const link = container.querySelector('a[href="/settings/athlete-subscriptions"]');

    expect(link?.textContent).toContain("Abonnements Athlètes");
  });

  it("links clearly to the notifications and announcements page", () => {
    const link = container.querySelector('a[href="/settings/notifications"]');

    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Notifications et annonces");
    expect(link?.textContent).toContain(
      "Envoyer des annonces aux Athlètes, Médias et Partenaires/Experts.",
    );
  });
});