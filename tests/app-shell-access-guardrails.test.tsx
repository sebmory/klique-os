// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState, headerMock, replaceMock, routerMock, sidebarMock } = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    authState: { userId: "user-1" },
    headerMock: vi.fn(),
    replaceMock: replace,
    routerMock: { replace },
    sidebarMock: vi.fn(),
  };
});

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: authState.userId
      ? { id: authState.userId, fullName: "KLIQUE User" }
      : null,
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => routerMock,
}));

vi.mock("@/components/app-shell/Header", () => ({
  Header: () => {
    headerMock();
    return createElement("header", null, "Navigation protégée");
  },
}));

vi.mock("@/components/app-shell/Sidebar", () => ({
  Sidebar: () => {
    sidebarMock();
    return createElement("aside", null, "Menu protégé");
  },
}));

vi.mock("@/components/app-shell/ModuleGuide", () => ({
  ModuleGuideForRoute: () => null,
}));

import { AppShell } from "@/components/AppShell";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const authorizedResponse = {
  ok: true,
  json: async () => ({
    clerkUser: { id: "user-1" },
    userAccess: {
      role: "admin",
      status: "active",
      workspaceId: "workspace-1",
    },
    permissions: { isActive: true },
  }),
} as Response;

const renderShell = async () => {
  await act(async () => {
    root.render(createElement(
      AppShell,
      null,
      createElement("section", null, "Contenu protégé") as ReactNode,
    ));
  });
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.userId = "user-1";
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("AppShell access guardrails", () => {
  it("shows a neutral loading state without protected content or navigation", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));

    await renderShell();

    expect(container.querySelector('[role="status"]')?.textContent).toBe("Chargement…");
    expect(container.textContent).not.toContain("Contenu protégé");
    expect(container.textContent).not.toContain("Navigation protégée");
    expect(container.textContent).not.toContain("Menu protégé");
    expect(headerMock).not.toHaveBeenCalled();
    expect(sidebarMock).not.toHaveBeenCalled();
  });

  it("shows a retryable generic error and resolves access again", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network details must stay private"))
      .mockResolvedValueOnce(authorizedResponse);

    await renderShell();

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("Impossible de charger l’application.");
    expect(container.textContent).not.toContain("network details");
    expect(container.textContent).not.toContain("Contenu protégé");
    expect(headerMock).not.toHaveBeenCalled();

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Réessayer")
        ?.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Contenu protégé");
    expect(headerMock).toHaveBeenCalledTimes(1);
    expect(sidebarMock).toHaveBeenCalledTimes(1);
  });

  it("redirects a valid resolved refusal to access-pending", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        clerkUser: { id: "user-1" },
        userAccess: null,
        creativeAccess: null,
        permissions: {},
      }),
    } as Response);

    await renderShell();

    expect(replaceMock).toHaveBeenCalledWith("/access-pending");
    expect(container.textContent).not.toContain("Contenu protégé");
    expect(headerMock).not.toHaveBeenCalled();
    expect(sidebarMock).not.toHaveBeenCalled();
  });

  it("hides protected content immediately when the Clerk user changes", async () => {
    fetchMock
      .mockResolvedValueOnce(authorizedResponse)
      .mockImplementationOnce(() => new Promise(() => undefined));

    await renderShell();
    expect(container.textContent).toContain("Contenu protégé");

    authState.userId = "user-2";
    await renderShell();

    expect(container.querySelector('[role="status"]')?.textContent).toBe("Chargement…");
    expect(container.textContent).not.toContain("Contenu protégé");
    expect(container.textContent).not.toContain("Navigation protégée");
    expect(container.textContent).not.toContain("Menu protégé");
  });
});
