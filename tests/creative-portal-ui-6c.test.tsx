// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreativePortalPage from "@/app/creative/page";
import { CreativeMissionResponsePanel } from "@/components/creatives/CreativeMissionResponsePanel";

const mission = {
  reference: "KLIQUE-A1B2C3D4",
  title: "Couverture du match",
  discipline: "Football",
  missionType: "photo",
  missionContext: "match",
  missionDate: "2026-10-25",
  startTime: "14:30",
  endTime: "17:00",
  locationName: "Stade de la Tuilière",
  locationDetails: "Porte B",
  brief: "Créer une sélection dynamique.",
  deliverables: "30 photos retouchées",
  deliveryDueDate: "2026-10-27",
  compensationType: "paid_mandate",
  compensationAmountChfCents: 25000,
  expenseDetails: "Train remboursé",
  missionStatus: "ready" as const,
  response: {
    state: "pending" as const,
    note: null,
    respondedAt: null,
    history: [],
  },
};

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
}));

let container: HTMLElement;
let root: Root;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "33333333-3333-4333-8333-333333333333"),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("creative portal 6C UI", () => {
  it("shows all operational mission fields and submits an acceptance once", async () => {
    let resolvePost!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => json({ missions: [mission] }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePost = resolve; }))
      .mockImplementationOnce(() => json({
        missions: [{
          ...mission,
          response: {
            state: "accepted",
            note: "Disponible.",
            respondedAt: "2026-10-12T08:00:00.000Z",
            history: [],
          },
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<CreativePortalPage />));
    await flush();

    expect(container.textContent).toContain("KLIQUE-A1B2C3D4");
    expect(container.textContent).toContain("25.10.2026 · 14:30–17:00");
    expect(container.textContent).toContain("30 photos retouchées");
    expect(container.textContent).toContain("CHF");
    const accept = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Accepter la mission")!;
    await act(async () => accept.click());
    const textarea = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
      ?.set?.call(textarea, "Disponible.");
    await act(async () => textarea.dispatchEvent(new Event("input", { bubbles: true })));
    const confirm = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Confirmer ma réponse")!;
    await act(async () => {
      confirm.click();
      confirm.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      reference: mission.reference,
      action: "accepted",
      note: "Disponible.",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
    });
    await act(async () => {
      resolvePost(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Acceptée");
  });

  it("renders Admin response state and append-only history", async () => {
    await act(async () => root.render(
      <CreativeMissionResponsePanel response={{
        state: "assignment_changed",
        note: "Déjà engagé.",
        respondedAt: "2026-10-12T08:00:00.000Z",
        history: [{
          action: "refused",
          note: "Déjà engagé.",
          authoredBy: "creative",
          createdAt: "2026-10-12T08:00:00.000Z",
        }],
      }} />,
    ));

    expect(container.textContent).toContain("Affectation modifiée depuis la réponse");
    expect(container.textContent).toContain("Historique des réponses (1)");
    expect(container.textContent).toContain("Mission refusée");
  });
});
