// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteServiceCreativeAssignmentPanel } from "@/components/creatives/AthleteServiceCreativeAssignmentPanel";

const requestId = "11111111-1111-4111-8111-111111111111";
const creativeAId = "22222222-2222-4222-8222-222222222222";
const creativeBId = "33333333-3333-4333-8333-333333333333";

const initialPayload = {
  creatives: [
    { id: creativeAId, displayName: "Alice Photo", creativeType: "photographer", area: "Vaud" },
    { id: creativeBId, displayName: "Bruno Vidéo", creativeType: "videographer", area: "Genève" },
  ],
  assignments: [{
    requestId,
    athleteId: "athlete-1",
    productName: "Session photo",
    creative: { id: creativeAId, displayName: "Alice Photo", creativeType: "photographer", area: "Vaud" },
    history: [{
      id: "event-1",
      action: "assigned",
      previousCreative: null,
      creative: { id: creativeAId, displayName: "Alice Photo", creativeType: "photographer", area: "Vaud" },
      authoredByClerkUserId: "admin-1",
      createdAt: "2026-10-11T12:00:00.000Z",
    }],
  }],
};

const response = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), {
  status: 200,
  headers: { "content-type": "application/json" },
}));

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("44444444-4444-4444-8444-444444444444") });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("AthleteServiceCreativeAssignmentPanel", () => {
  it("renders safe visual options, current assignment and traceable history", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => response(initialPayload)));
    await act(async () => root.render(
      <AthleteServiceCreativeAssignmentPanel requestId={requestId} editable />,
    ));
    await flush();

    expect(container.textContent).toContain("Créatif actuel : Alice Photo — Photographe — Vaud");
    expect(container.textContent).toContain("Historique (1)");
    expect(container.textContent).toContain("Admin admin-1");
    const options = [...container.querySelectorAll("option")].map((option) => option.textContent);
    expect(options).toEqual([
      "Aucun créatif affecté",
      "Alice Photo — Photographe — Vaud",
      "Bruno Vidéo — Vidéaste — Genève",
    ]);
    expect(container.textContent).not.toContain("email");
    expect(container.querySelector("[aria-live='polite']")).toBeTruthy();
  });

  it("confirms replacement and blocks duplicate submissions from double clicks", async () => {
    let resolvePatch: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response(initialPayload))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePatch = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(
      <AthleteServiceCreativeAssignmentPanel requestId={requestId} editable />,
    ));
    await flush();

    const select = container.querySelector("select")!;
    await act(async () => {
      select.value = creativeBId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const button = [...container.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.includes("Enregistrer l’affectation"))!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      requestId,
      creativeProfileId: creativeBId,
      idempotencyKey: "44444444-4444-4444-8444-444444444444",
    });

    await act(async () => {
      resolvePatch!(new Response(JSON.stringify({
        assignment: {
          ...initialPayload.assignments[0],
          creative: initialPayload.creatives[1],
          history: [],
        },
      }), { status: 200, headers: { "content-type": "application/json" } }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Affectation enregistrée.");
  });

  it("confirms removal and sends the explicit null assignment", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response(initialPayload))
      .mockImplementationOnce(() => response({
        assignment: {
          ...initialPayload.assignments[0],
          creative: null,
          history: [],
        },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(
      <AthleteServiceCreativeAssignmentPanel requestId={requestId} editable />,
    ));
    await flush();

    const select = container.querySelector("select")!;
    await act(async () => {
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const button = [...container.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.includes("Enregistrer l’affectation"))!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirm).toHaveBeenCalledWith("Confirmer le retrait du créatif affecté ?");
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body)).creativeProfileId).toBeNull();
    expect(container.textContent).toContain("Affectation retirée.");
  });
});
