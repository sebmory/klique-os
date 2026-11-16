// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAuthenticatedContentStorageRole } from "@/services/content-storage-access";

const mocks = vi.hoisted(() => ({
  runContentsBackfill: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("step=summary"),
}));

vi.mock("@/services/content-backfill", () => ({
  runContentsBackfill: mocks.runContentsBackfill,
}));

import { CreationAssistantScreen } from "@/components/contents/CreationAssistantScreen";
import {
  ContentCreationAssistantService,
  createInitialAssistantDraft,
} from "@/services/content-creation-assistant";
import type { ContentCreationContext } from "@/services/contents-hub";

const WORKFLOW_STORAGE_KEY = "klique.contents.creation-assistant.workflow.v2";
const context: ContentCreationContext = {
  mode: "contextual",
  subjectId: "athlete-legacy",
  subjectName: "Mila Martin",
  subjectType: "athlete",
  objective: "interview",
};
const contextKey = JSON.stringify({
  ...context,
  presetId: "",
});

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("legacy interview draft without a position", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    setAuthenticatedContentStorageRole("admin");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/contents/create?step=summary");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/ai-credits/balance") return response({ ok: false }, 403);
      if (url === "/api/media-subscriptions") return response({ ok: false }, 404);
      if (url === "/api/athletes") return response({ source: "fixture", athletes: [] });
      throw new Error(`Unexpected request: ${url}`);
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    setAuthenticatedContentStorageRole(null);
    vi.unstubAllGlobals();
  });

  it("prepares and renders an interview with an empty position when the legacy field is missing", async () => {
    const draft = createInitialAssistantDraft(context);
    draft.subject = {
      type: "person",
      source: "crm",
      id: "athlete-legacy",
      displayName: " Mila Martin ",
      description: " Joueuse de badminton ",
      sport: " Badminton ",
      clubOrOrganization: " BC Fribourg ",
      disciplineOrPosition: "Simple dames",
      photoAvailable: false,
    };
    draft.objective.subtypeId = "portrait";
    draft.parameters.interviewAngleId = "portrait-trigger";
    delete (draft.subject as { disciplineOrPosition?: string | null }).disciplineOrPosition;

    const payload = ContentCreationAssistantService.preparePayload({
      context,
      draft,
    });

    expect(payload?.subject).toEqual({
      type: "person",
      source: "crm",
      id: "athlete-legacy",
      displayName: "Mila Martin",
      description: "Joueuse de badminton",
      sport: "Badminton",
      clubOrOrganization: "BC Fribourg",
      disciplineOrPosition: "",
      photoUrl: undefined,
      photoAvailable: false,
    });

    window.sessionStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify({
      version: 2,
      contextKey,
      draft,
      stepIndex: 0,
      contextState: {
        loading: false,
        errorMessage: null,
        items: [],
        reports: [],
        hasCollected: false,
      },
    }));

    await act(async () => {
      root.render(<CreationAssistantScreen context={context} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Préparez votre interview sur un seul écran.");
    expect(container.textContent).not.toContain("Le réseau est momentanément indisponible");
  });
});
