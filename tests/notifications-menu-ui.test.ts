// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { routerPushMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/components/app-shell/icons", () => ({
  Bell: () => createElement("span", null, "Bell"),
}));

import { NotificationsMenu } from "@/components/app-shell/NotificationsMenu";
import { openNotificationsEvent } from "@/components/app-shell/data";

const personalNotification = {
  id: "notification-1",
  title: "Votre demande a ete acceptee",
  body: "Le creneau du matin est confirme.",
  actionHref: "/athlete/opportunities/opportunity-1",
  readAt: null,
  createdAt: "2026-09-13T10:00:00.000Z",
};

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as unknown as Response;

const installFetchMock = (unreadCount = 1) => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/notifications" && init?.method === "PATCH") {
      return jsonResponse({ ok: true, notification: { ...personalNotification, readAt: "2026-09-13T10:05:00.000Z" } });
    }
    if (url === "/api/notifications") {
      return jsonResponse({ ok: true, notifications: [personalNotification], unreadCount });
    }
    if (url === "/api/contact-requests") {
      return jsonResponse({
        contactRequests: [{ id: "contact-1", athleteId: "athlete-1", subject: "Besoin de support", status: "open", createdAt: "2026-09-12T09:00:00.000Z" }],
      });
    }
    if (url === "/api/partners") {
      return jsonResponse({ partners: [{ sourceRow: 2, moderationStatus: "pending" }] });
    }
    if (url === "/api/athletes") {
      return jsonResponse({ athletes: [{ key: "athlete-1", name: "Mila Benjak" }] });
    }
    if (url === "/api/hub-opportunity-slots") {
      return jsonResponse({
        slots: [{ id: "slot-1", startsAt: "2026-09-20T08:00:00.000Z" }],
        requests: [{ id: "request-1", slotId: "slot-1", opportunityId: "opportunity-1", status: "confirmed", athleteSeenAt: null }],
      });
    }
    if (url === "/api/hub-opportunities") {
      return jsonResponse({ opportunities: [{ id: "opportunity-1", title: "Shooting Lausanne" }] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
};

const mount = async (props: { enabled?: boolean; isAdmin?: boolean; isAthlete?: boolean } = { enabled: true }) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(NotificationsMenu, props));
  });
};

const click = async (element: Element | null) => {
  expect(element).not.toBeNull();
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
};

const openMenu = async () => {
  await click(container.querySelector('button[aria-label="Notifications"]'));
};

beforeEach(() => {
  vi.clearAllMocks();
  installFetchMock();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("NotificationsMenu", () => {
  it("opens from the global search command", async () => {
    await mount();

    await act(async () => {
      window.dispatchEvent(new Event(openNotificationsEvent));
    });

    expect(container.querySelector('[role="menu"][aria-label="Mes notifications"]')).not.toBeNull();
  });

  it("loads and displays personal notifications with unread state, date, title and body", async () => {
    await mount();
    await openMenu();

    expect(fetchMock).toHaveBeenCalledWith("/api/notifications", { credentials: "include", cache: "no-store" });
    expect(container.querySelector('.notification-requests-list li.is-unread')).not.toBeNull();
    expect(container.textContent).toContain("Votre demande a ete acceptee");
    expect(container.textContent).toContain("Le creneau du matin est confirme.");
    expect(container.textContent).toContain("13/09/2026");
    expect(container.querySelector(".notification-count-badge")?.textContent).toBe("1");
  });

  it("caps the personal unread badge at 9+", async () => {
    installFetchMock(12);
    await mount();

    expect(container.querySelector(".notification-count-badge")?.textContent).toBe("9+");
  });

  it("marks a personal notification read before navigating to its internal action", async () => {
    const events: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/notifications" && init?.method === "PATCH") {
        events.push("patch");
        return jsonResponse({ ok: true });
      }
      return jsonResponse({ ok: true, notifications: [personalNotification], unreadCount: 1 });
    });
    routerPushMock.mockImplementation(() => events.push("navigate"));
    await mount();
    await openMenu();

    await click(container.querySelector(`a[href="${personalNotification.actionHref}"]`));

    const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
    expect(patchCall?.[0]).toBe("/api/notifications");
    expect(JSON.parse(String((patchCall?.[1] as RequestInit).body))).toEqual({ notificationId: "notification-1" });
    expect(events).toEqual(["patch", "navigate"]);
    expect(routerPushMock).toHaveBeenCalledWith(personalNotification.actionHref);
  });

  it("keeps the legacy Admin alerts below the personal list", async () => {
    await mount({ enabled: true, isAdmin: true });
    await openMenu();

    const content = container.textContent ?? "";
    expect(content).toContain("Demandes KLIQUE");
    expect(content).toContain("Mila Benjak");
    expect(content).toContain("1 partenaire à valider");
    expect(content.indexOf("Votre demande a ete acceptee")).toBeLessThan(content.indexOf("Demandes KLIQUE"));
  });

  it("keeps the legacy Athlete decisions below the personal list", async () => {
    await mount({ enabled: true, isAthlete: true });
    await openMenu();

    const content = container.textContent ?? "";
    expect(content).toContain("Mes demandes");
    expect(content).toContain("Shooting Lausanne");
    expect(content.indexOf("Votre demande a ete acceptee")).toBeLessThan(content.indexOf("Mes demandes"));
  });

  it("does not render or fetch when notifications are disabled", async () => {
    await mount({ enabled: false });

    expect(container.querySelector('button[aria-label="Notifications"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});