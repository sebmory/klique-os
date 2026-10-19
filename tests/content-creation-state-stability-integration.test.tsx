// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: {
    id: "user-initial",
    fullName: "Media Initial",
    firstName: "Media",
    lastName: "Initial",
    primaryEmailAddress: { emailAddress: "media@example.com" },
    emailAddresses: [{ emailAddress: "media@example.com" }],
  } as Record<string, unknown>,
  router: { replace: vi.fn() },
  runContentsBackfill: vi.fn(async () => undefined),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: mocks.user }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/contents/create",
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/app-shell/Header", () => ({
  Header: () => <header data-testid="app-header" />,
}));

vi.mock("@/components/app-shell/Sidebar", () => ({
  Sidebar: () => <aside data-testid="app-sidebar" />,
}));

vi.mock("@/components/app-shell/ModuleGuide", () => ({
  ModuleGuideForRoute: () => null,
}));

vi.mock("@/services/content-backfill", () => ({
  runContentsBackfill: mocks.runContentsBackfill,
}));

import { AppShell } from "@/components/AppShell";
import { CreationAssistantScreen } from "@/components/contents/CreationAssistantScreen";
import { createInitialAssistantDraft } from "@/services/content-creation-assistant";
import type { ContentCreationContext } from "@/services/contents-hub";

const WORKFLOW_STORAGE_KEY = "klique.contents.creation-assistant.workflow.v2";

const context: ContentCreationContext = {
  mode: "contextual",
  subjectId: "athlete-1",
  subjectName: "Mila Martin",
  subjectType: "athlete",
  objective: "interview",
};

const contextKey = JSON.stringify({
  mode: "contextual",
  subjectId: "athlete-1",
  subjectName: "Mila Martin",
  subjectType: "athlete",
  objective: "interview",
  presetId: "",
});

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("editorial assistant state stability", () => {
  let container: HTMLElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  let releaseCreditResponses: () => void;
  let creditResponseGate: Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/contents/create");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const draft = createInitialAssistantDraft(context);
    draft.objective.subtypeId = "portrait";
    draft.parameters.toneId = "journalistic";
    draft.parameters.questionCountId = "5";
    draft.parameters.formatId = "written";
    draft.parameters.audienceId = "general";
    draft.parameters.useContextIntelligence = true;
    draft.parameters.contextEnableExternalNews = false;

    window.sessionStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify({
      version: 2,
      contextKey,
      draft,
      stepIndex: 3,
      contextState: {
        loading: false,
        errorMessage: null,
        items: [],
        reports: [],
        hasCollected: false,
      },
    }));

    creditResponseGate = new Promise<void>((resolve) => {
      releaseCreditResponses = resolve;
    });

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";

      if (url === "/api/clerk/access") {
        return response({
          userAccess: {
            role: "admin",
            status: "active",
            workspaceId: "workspace-1",
          },
          permissions: {},
          clerkUser: { id: String(mocks.user.id), email: "media@example.com" },
        });
      }
      if (url === "/api/ai-credits/balance") {
        await creditResponseGate;
        return response({ ok: true, balance: 9, period: { id: "period-1" } });
      }
      if (url === "/api/media-subscriptions") {
        return response({ ok: false }, 500);
      }
      if (url === "/api/context/collect" && method === "POST") {
        return response({
          ok: true,
          collectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          expiresAt: "2026-10-19T11:30:00.000Z",
          items: [{
            id: "item-1",
            connectorId: "crm",
            category: "profile",
            title: "Profil public",
            summary: "Fait collecte conserve",
            factualStatement: "Fait collecte conserve",
            statementType: "fact",
            sourceType: "internal",
            sourceName: "Projection editoriale Athlete",
            retrievedAt: "2026-10-19T11:00:00.000Z",
            confidence: "medium",
            verificationStatus: "reported",
            isSelected: true,
            isEditable: true,
            metadata: {},
          }],
          reports: [{ connectorId: "crm", status: "completed", itemCount: 1 }],
          summary: {
            totalItemsFound: 1,
            selectedItemsCount: 1,
            externalSourcesCount: 0,
            researchedAt: "2026-10-19T11:00:00.000Z",
            dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
            warnings: [],
          },
        });
      }
      if (url === "/api/athletes") {
        return response({
          source: "google-sheets",
          athletes: [{ key: "athlete-1", name: "Mila Martin", sport: "Football", club: "FC Lausanne" }],
        });
      }
      if (url === "/api/notifications") {
        return response({ ok: false }, 500);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    releaseCreditResponses();
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const renderApp = async () => {
    await act(async () => {
      root.render(
        <StrictMode>
          <AppShell>
            <CreationAssistantScreen context={{ ...context }} />
          </AppShell>
        </StrictMode>,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("preserves the collected context across late global updates and resets only explicitly", async () => {
    await renderApp();

    await vi.waitFor(() => {
      expect(container.textContent).toContain("Collectez, relisez et selectionnez");
    });
    const collectButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Rechercher le contexte"));

    await act(async () => {
      collectButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Fait collecte conserve");
    const itemEditor = Array.from(container.querySelectorAll("textarea"))
      .find((textarea) => textarea.value === "Fait collecte conserve");
    expect(itemEditor).toBeDefined();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      valueSetter?.call(itemEditor, "Fait collecte modifie");
      itemEditor!.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    mocks.user = {
      ...mocks.user,
      id: "user-hydrated",
      fullName: "Media Hydrate",
    };
    await act(async () => {
      releaseCreditResponses();
      await fetch("/api/athletes");
      await fetch("/api/notifications");
      root.render(
        <StrictMode>
          <AppShell>
            <CreationAssistantScreen context={{ ...context }} />
          </AppShell>
        </StrictMode>,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Fait collecte modifie");
    expect(container.textContent).toContain("Collectez, relisez et selectionnez");

    const persisted = JSON.parse(window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY) ?? "{}") as {
      stepIndex?: number;
      contextState?: {
        collectionId?: string;
        reports?: unknown[];
        items?: Array<{ id: string; isSelected: boolean; editedSummary?: string }>;
      };
    };
    expect(persisted.stepIndex).toBe(3);
    expect(persisted.contextState?.collectionId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(persisted.contextState?.reports).toHaveLength(1);
    expect(persisted.contextState?.items).toEqual([
      expect.objectContaining({ id: "item-1", isSelected: true, editedSummary: "Fait collecte modifie" }),
    ]);

    expect(fetchMock.mock.calls.filter(([input, init]) =>
      String(input) === "/api/context/collect" && (init as RequestInit | undefined)?.method === "POST"))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/content/generate"))
      .toHaveLength(0);

    await act(async () => {
      root.render(
        <StrictMode>
          <AppShell key="late-parent-replacement">
            <CreationAssistantScreen context={{ ...context }} />
          </AppShell>
        </StrictMode>,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(container.textContent).toContain("Fait collecte modifie");
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/context/collect"))
      .toHaveLength(1);

    const restartButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Recommencer"));
    await act(async () => {
      restartButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Sur quel sujet souhaitez-vous creer un contenu");
    expect(container.textContent).not.toContain("Fait collecte modifie");
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/context/collect"))
      .toHaveLength(1);
  });
});
