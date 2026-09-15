// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClubAdminSection } from "@/components/settings/ClubAdminSection";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as unknown as Response;

const club = {
  workspaceId: "club-a",
  name: "Club A",
  status: "active",
  createdAt: "2026-09-15T08:00:00.000Z",
  updatedAt: "2026-09-15T08:00:00.000Z",
  teamCount: 2,
};

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ClubAdminSection />);
  });
};

const setInput = async (name: string, value: string) => {
  const input = container.querySelector(`input[name="${name}"]`) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  await act(async () => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const submit = async () => {
  await act(async () => {
    container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    await act(async () => { root.unmount(); });
  }
  container?.remove();
  vi.unstubAllGlobals();
});

describe("Club Admin settings section", () => {
  it("loads and lists provisioned clubs", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ clubs: [club] }));

    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/clubs", {
      credentials: "include",
      cache: "no-store",
    });
    expect(container.querySelector('[data-club-id="club-a"]')?.textContent).toContain("Club A");
    expect(container.querySelector('[data-club-id="club-a"]')?.textContent).toContain("2 équipes");
  });

  it("prefills Elfic Fribourg as editable form values", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ clubs: [] }));

    await mount();

    expect((container.querySelector('input[name="id"]') as HTMLInputElement).value).toBe("elfic-fribourg");
    expect((container.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("Elfic Fribourg");
    await setInput("name", "Club modifié");
    expect((container.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("Club modifié");
  });

  it("posts only the four Club fields and displays success", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ clubs: [] }))
      .mockResolvedValueOnce(jsonResponse({ club: { ...club, workspaceId: "elfic-fribourg", name: "Elfic Fribourg", teamCount: 1 } }, 201));
    await mount();

    await submit();

    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/clubs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "elfic-fribourg",
        name: "Elfic Fribourg",
        teamName: "Équipe première",
        season: "2026-2027",
      }),
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Elfic Fribourg a été provisionné.");
    expect(container.querySelector('[data-club-id="elfic-fribourg"]')).not.toBeNull();
  });

  it("displays a distinct conflict state", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ clubs: [] }))
      .mockResolvedValueOnce(jsonResponse({ code: "conflict", error: "Ce club existe déjà." }, 409));
    await mount();

    await submit();

    const alert = container.querySelector('[role="alert"][data-state="conflict"]');
    expect(alert?.textContent).toBe("Ce club existe déjà.");
  });

  it("shows loading and GET errors", async () => {
    let resolveLoad: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { resolveLoad = resolve; }));
    await mount();

    expect(container.querySelector('[role="status"]')?.textContent).toBe("Chargement des clubs…");

    await act(async () => {
      resolveLoad?.(jsonResponse({ error: "Accès refusé." }, 403));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Accès refusé.");
  });

  it("shows client validation and network errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ clubs: [] })).mockRejectedValueOnce(new Error("offline"));
    await mount();

    await setInput("season", " ");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Tous les champs sont obligatoires.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await setInput("season", "2026-2027");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Vérifiez votre connexion.");
  });
});