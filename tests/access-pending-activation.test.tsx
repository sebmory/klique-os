// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock, useAuthMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: useAuthMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

import AccessPendingPage from "@/app/access-pending/page";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("access pending activation", () => {
  it("activates once and redirects a partner to the partner portal", async () => {
    let resolveAccess: ((value: unknown) => void) | undefined;
    fetchMock.mockReturnValue(new Promise((resolve) => {
      resolveAccess = resolve;
    }));

    await act(async () => root.render(createElement(AccessPendingPage)));
    expect(container.textContent).toContain("Activation de votre accès");
    resolveAccess?.({
      ok: true,
      json: async () => ({
        userAccess: {
          role: "partner_expert",
          status: "active",
          workspaceId: "workspace-server",
          partnerId: "9ca2699c-5cc1-52a6-bbb5-7d6b6c2e97a4",
        },
      }),
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/clerk/access", {
      credentials: "include",
      cache: "no-store",
    });
    expect(replaceMock).toHaveBeenCalledOnce();
    expect(replaceMock).toHaveBeenCalledWith("/partner");
  });

  it("keeps the waiting page without retrying when no access can be activated", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ userAccess: null, creativeAccess: null }),
    });

    await act(async () => root.render(createElement(AccessPendingPage)));
    await flush();
    await act(async () => root.render(createElement(AccessPendingPage)));
    await flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Accès KLIQUE en attente");
  });
});
