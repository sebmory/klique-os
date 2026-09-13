// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { headerMock, replaceMock, routerMock } = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    headerMock: vi.fn(),
    replaceMock: replace,
    routerMock: { replace },
  };
});

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { id: "user-1", fullName: "KLIQUE User" } }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => routerMock,
}));

vi.mock("@/components/app-shell/Header", () => ({
  Header: (props: Record<string, unknown>) => {
    headerMock(props);
    return createElement("div", { "data-notifications-enabled": String(props.notificationsEnabled) });
  },
}));

vi.mock("@/components/app-shell/Sidebar", () => ({
  Sidebar: () => createElement("aside"),
}));

import { AppShell } from "@/components/AppShell";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => payload }) as unknown as Response;

const mountForRole = async (role: "admin" | "athlete" | "media" | "partner_expert") => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/partners") {
      return jsonResponse({ partners: [{ type: "partenaire" }] });
    }
    return jsonResponse({
      clerkUser: { id: "user-1" },
      userAccess: {
        role,
        status: "active",
        workspaceId: "workspace-1",
        athleteId: role === "athlete" ? "athlete-1" : null,
        partnerId: role === "partner_expert" ? "partner-1" : null,
      },
      permissions: { isAthlete: role === "athlete", isActive: true },
    });
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AppShell, null, createElement("main", null, "Content") as ReactNode));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("AppShell notifications", () => {
  it.each(["admin", "athlete", "media", "partner_expert"] as const)(
    "enables the notifications bell for an active %s role",
    async (role) => {
      await mountForRole(role);

      expect(container.querySelector('[data-notifications-enabled="true"]')).not.toBeNull();
      expect(headerMock).toHaveBeenLastCalledWith(expect.objectContaining({
        notificationsEnabled: true,
        isAdmin: role === "admin",
        isAthlete: role === "athlete",
      }));
    },
  );
});