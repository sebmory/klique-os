// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteSessionRequests } from "@/components/athlete/AthleteSessionRequests";
import { SessionRequestsAdminCockpit } from "@/components/app-shell/SessionRequestsAdminCockpit";
import { CreativeAvailabilityManager } from "@/components/creatives/CreativeAvailabilityManager";

let container: HTMLElement;
let root: Root;

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "11111111-1111-4111-8111-111111111111"),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("creative availability and session request UI", () => {
  it("renders the Athlete mobile-first request choice without Creative identities", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ requests: [] })));
    await act(async () => root.render(<AthleteSessionRequests />));
    await flush();
    const open = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Nouvelle demande")!;
    await act(async () => open.click());

    expect(container.textContent).toContain("Match ou compétition");
    expect(container.textContent).toContain("Media Day");
    expect(container.textContent).toContain("ne réserve aucun créatif");
    expect(container.textContent).not.toContain("Créatif Test");
    expect(container.querySelector('input[type="date"]')).not.toBeNull();
  });

  it("renders the Creative owner form, timezone and non-booking notice", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({
      rules: [],
      occurrences: [],
      conflicts: [],
    })));
    await act(async () => root.render(<CreativeAvailabilityManager />));
    await flush();

    expect(container.textContent).toContain("Mon calendrier");
    expect(container.textContent).toContain("Disponibilités des créatifs");
    expect(container.textContent).toContain("Europe/Zurich");
    expect(container.textContent).toContain("ni une réservation");
    expect(container.textContent).toContain("Match / compétition");
    expect(container.textContent).toContain("Media Day");
  });

  it("renders the Admin counter, filters and empty queue", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({
      requests: [],
      creatives: [],
      availability: { occurrences: [], conflicts: [] },
    })));
    await act(async () => root.render(<SessionRequestsAdminCockpit />));
    await flush();

    expect(container.textContent).toContain("Séances à examiner");
    expect(container.textContent).toContain("Statut");
    expect(container.textContent).toContain("Région");
    expect(container.textContent).toContain("Athlète");
    expect(container.textContent).toContain("Aucune demande");
  });
});
