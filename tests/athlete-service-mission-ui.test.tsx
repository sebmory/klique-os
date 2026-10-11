// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteServiceMissionPanel } from "@/components/creatives/AthleteServiceMissionPanel";

const requestId = "11111111-1111-4111-8111-111111111111";
const mission = {
  id: "22222222-2222-4222-8222-222222222222",
  requestId,
  referenceCode: "KLIQUE-A1B2C3D4",
  title: "Couverture du match",
  brief: "Créer des images dynamiques.",
  sportDiscipline: "Football",
  missionType: "photo" as const,
  missionContext: "match" as const,
  locationName: "Stade de la Tuilière",
  locationDetails: "Porte B",
  missionDate: "2026-10-11",
  startTime: "14:30",
  endTime: "17:00",
  deliveryDueDate: "2026-10-12",
  deliverables: "30 photos retouchées",
  compensationType: "paid_mandate" as const,
  compensationAmountChfCents: 25000,
  expenseDetails: "Train remboursé",
  internalAdminNotes: "Alice Martin - note privée",
  status: "ready" as const,
  createdByClerkUserId: "admin-1",
  updatedByClerkUserId: "admin-1",
  createdAt: "2026-10-11T12:00:00.000Z",
  updatedAt: "2026-10-11T12:00:00.000Z",
};

const initialRecord = {
  requestId,
  athleteId: "athlete-1",
  productName: "Session photo",
  assignedCreativeProfileId: null,
  mission,
  history: [{
    id: "event-1",
    action: "created" as const,
    changedFields: ["title", "status"],
    snapshot: { title: mission.title, status: mission.status },
    authoredByClerkUserId: "admin-1",
    createdAt: "2026-10-11T12:00:00.000Z",
  }],
};

const jsonResponse = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), {
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
let clipboardWrite: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  clipboardWrite = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn().mockReturnValue("33333333-3333-4333-8333-333333333333"),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("AthleteServiceMissionPanel", () => {
  it("renders compact summary, ready-without-creative warning, history and safe clipboard text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => jsonResponse({ records: [initialRecord] })));
    await act(async () => root.render(
      <AthleteServiceMissionPanel requestId={requestId} editable />,
    ));
    await flush();

    expect(container.textContent).toContain("Couverture du match");
    expect(container.textContent).toContain("Prête");
    expect(container.textContent).toContain("11.10.2026");
    expect(container.textContent).toContain("aucun créatif");
    expect(container.textContent).toContain("Historique de la mission (1)");
    const copyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Copier l’annonce WhatsApp"))!;
    await act(async () => {
      copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(clipboardWrite).toHaveBeenCalledOnce();
    const copied = String(clipboardWrite.mock.calls[0][0]);
    expect(copied).toContain("KLIQUE-A1B2C3D4");
    expect(copied).toContain("Date : 11.10.2026");
    expect(copied).not.toContain("10.10.2026");
    expect(copied).not.toContain("Alice Martin");
    expect(copied).not.toContain(requestId);
    expect(container.textContent).toContain("copiée dans le presse-papiers");
  });

  it("blocks duplicate save submissions from double clicks", async () => {
    let resolvePatch: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => jsonResponse({ records: [initialRecord] }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePatch = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(
      <AthleteServiceMissionPanel requestId={requestId} editable />,
    ));
    await flush();

    const modifyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Modifier")!;
    await act(async () => modifyButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(body).toMatchObject({
      action: "save",
      requestId,
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      mission: { compensationAmountChfCents: 25000, status: "ready" },
    });

    await act(async () => {
      resolvePatch!(new Response(JSON.stringify({ record: initialRecord }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Fiche mission enregistrée.");
  });

  it("requires confirmation before cancellation", async () => {
    const cancelledRecord = {
      ...initialRecord,
      mission: { ...mission, status: "cancelled" as const },
    };
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => jsonResponse({ records: [initialRecord] }))
      .mockImplementationOnce(() => jsonResponse({ record: cancelledRecord }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(
      <AthleteServiceMissionPanel requestId={requestId} editable />,
    ));
    await flush();
    const modifyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Modifier")!;
    await act(async () => modifyButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const cancelButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Annuler la mission")!;
    await act(async () => {
      cancelButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(confirm).toHaveBeenCalledWith("Confirmer l’annulation de cette mission ?");
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toMatchObject({
      action: "cancel",
      requestId,
    });
    expect(container.textContent).toContain("Mission annulée.");
  });
});
