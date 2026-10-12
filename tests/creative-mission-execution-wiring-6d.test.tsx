// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativePortalMission } from "@/lib/creative-missions";

const {
  createContentStorageClientMock,
  getCreativeAccessMock,
  databaseState,
} = vi.hoisted(() => ({
  createContentStorageClientMock: vi.fn(),
  getCreativeAccessMock: vi.fn(),
  databaseState: {
    executionStatus: null as null | "in_progress" | "delivered" | "changes_requested",
    deliveryLinks: [] as string[],
    deliveryNote: null as string | null,
    changeRequestNote: null as string | null,
  },
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserCreativeAccessProfile: getCreativeAccessMock,
}));

import { GET, PATCH } from "@/app/api/creative/missions/route";
import CreativePortalPage, {
  CreativeMissionContent,
  categorizeCreativeMission,
} from "@/app/creative/page";

const creativeProfileId = "11111111-1111-4111-8111-111111111111";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";

const portalRow = () => ({
  reference_code: "KLIQUE-A1B2C3D4",
  title: "Couverture du match",
  sport_discipline: "Football",
  mission_type: "photo",
  mission_context: "match",
  mission_date: "2026-10-25",
  start_time: "14:30:00",
  end_time: "17:00:00",
  location_name: "Stade de la Tuilliere",
  location_details: "Entree media B",
  brief: "Creer une selection dynamique.",
  deliverables: "30 photos retouchees",
  delivery_due_date: "2026-10-27",
  compensation_type: "paid_mandate",
  compensation_amount_chf_cents: 25000,
  expense_details: "Train rembourse",
  mission_status: "ready",
  response_status: "accepted",
  response_note: "Disponible des 14 h.",
  response_updated_at: "2026-10-12T10:00:00.000Z",
  response_history: [{
    action: "accepted",
    note: "Disponible des 14 h.",
    createdAt: "2026-10-12T10:00:00.000Z",
  }],
  execution_status: databaseState.executionStatus,
  execution_delivery_links: databaseState.deliveryLinks,
  execution_delivery_note: databaseState.deliveryNote,
  execution_change_request_note: databaseState.changeRequestNote,
  execution_started_at: databaseState.executionStatus
    ? "2026-10-12T11:00:00.000Z"
    : null,
  execution_delivered_at: databaseState.executionStatus === "delivered"
    || databaseState.executionStatus === "changes_requested"
    ? "2026-10-12T12:00:00.000Z"
    : null,
  execution_completed_at: null,
  execution_history: databaseState.executionStatus
    ? [{
        action: databaseState.executionStatus === "in_progress" ? "started" : "delivered",
        note: databaseState.deliveryNote,
        deliveryLinks: databaseState.deliveryLinks,
        createdAt: "2026-10-12T11:00:00.000Z",
      }]
    : [],
});

const expectedAcceptedMission = {
  reference: "KLIQUE-A1B2C3D4",
  title: "Couverture du match",
  discipline: "Football",
  missionType: "photo",
  missionContext: "match",
  missionDate: "2026-10-25",
  startTime: "14:30",
  endTime: "17:00",
  locationName: "Stade de la Tuilliere",
  locationDetails: "Entree media B",
  brief: "Creer une selection dynamique.",
  deliverables: "30 photos retouchees",
  deliveryDueDate: "2026-10-27",
  compensationType: "paid_mandate",
  compensationAmountChfCents: 25000,
  expenseDetails: "Train rembourse",
  missionStatus: "ready",
  response: {
    state: "accepted",
    note: "Disponible des 14 h.",
    respondedAt: "2026-10-12T10:00:00.000Z",
    history: [{
      action: "accepted",
      note: "Disponible des 14 h.",
      authoredBy: "creative",
      createdAt: "2026-10-12T10:00:00.000Z",
    }],
  },
  execution: {
    status: "accepted",
    deliveryLinks: [],
    deliveryNote: null,
    changeRequestNote: null,
    startedAt: null,
    deliveredAt: null,
    completedAt: null,
    history: [],
  },
};

const getRealMissions = async (): Promise<CreativePortalMission[]> => {
  const response = await GET(new Request("http://localhost/api/creative/missions"));
  const payload = await response.json();
  return payload.missions;
};

function MissionHarness({ initialMissions }: { initialMissions: CreativePortalMission[] }) {
  const [missions, setMissions] = useState(initialMissions);
  const reload = async () => setMissions(await getRealMissions());
  return <CreativeMissionContent missions={missions} onReload={reload} />;
}

const setControlValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("real creative mission 6D wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseState.executionStatus = null;
    databaseState.deliveryLinks = [];
    databaseState.deliveryNote = null;
    databaseState.changeRequestNote = null;
    getCreativeAccessMock.mockResolvedValue({
      workspaceId: "workspace-a",
      creativeProfileId,
      clerkUserId: "user-creative",
      status: "active",
      creativeProfileStatus: "active",
    });

    const query = vi.fn((statement: string, parameters: unknown[]) => {
      if (statement.includes("SELECT mission.reference_code")) {
        expect(parameters).toEqual(["workspace-a", creativeProfileId]);
        return [portalRow()];
      }
      return { statement, parameters };
    });
    const transaction = vi.fn(async (queries: Array<{
      statement: string;
      parameters: unknown[];
    }>) => {
      expect(queries).toHaveLength(2);
      expect(queries[0].statement).toContain("INSERT INTO creative_mission_executions");
      expect(queries[1].statement).toContain("INSERT INTO creative_mission_execution_events");
      expect(queries[1].statement).toContain("UPDATE creative_mission_executions");
      const action = queries[1].parameters[4];
      if (action === "delivered") {
        databaseState.executionStatus = "delivered";
        databaseState.deliveryNote = queries[1].parameters[5] as string | null;
        databaseState.deliveryLinks = JSON.parse(queries[1].parameters[6] as string) as string[];
        databaseState.changeRequestNote = null;
      } else {
        databaseState.executionStatus = "in_progress";
      }
      return [[], [{ outcome: "changed" }]];
    });
    createContentStorageClientMock.mockReturnValue({ query, transaction });
    vi.stubGlobal("crypto", { randomUUID: () => idempotencyKey });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("returns the exact accepted execution fallback from the real GET without writing", async () => {
    const response = await GET(new Request("http://localhost/api/creative/missions"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ missions: [expectedAcceptedMission] });
    const database = createContentStorageClientMock.mock.results[0].value;
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("starts through the real PATCH and returns in_progress on the following real GET", async () => {
    const patchResponse = await PATCH(new Request("http://localhost/api/creative/missions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reference: "KLIQUE-A1B2C3D4",
        action: "started",
        note: null,
        deliveryLinks: [],
        idempotencyKey,
      }),
    }));
    expect(patchResponse.status).toBe(200);
    expect(await patchResponse.json()).toEqual({ ok: true, unchanged: false });

    const missions = await getRealMissions();
    expect(missions[0].execution?.status).toBe("in_progress");
  });

  it("renders the real page content in A realiser without 6C response buttons", async () => {
    const response = await GET(new Request("http://localhost/api/creative/missions"));
    const payload = await response.json();
    const mission = payload.missions[0];
    const markup = renderToStaticMarkup(
      <CreativeMissionContent missions={[mission]} onReload={async () => undefined} />,
    );

    expect(CreativePortalPage).toBeTypeOf("function");
    expect(categorizeCreativeMission(mission)).toBe("to_do");
    expect(markup).toContain("À répondre (0)");
    expect(markup).toContain("À réaliser (1)");
    expect(markup).toContain("Acceptée");
    expect(markup).toContain("Commencer la mission");
    expect(markup).not.toContain("Accepter la mission");
    expect(markup).not.toContain("Refuser la mission");
  });

  it("shows delivery, uses the real PATCH once, then refreshes into Livrees", async () => {
    databaseState.executionStatus = "in_progress";
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : new URL(String(input), "http://localhost").href;
      const request = new Request(url, init);
      return request.method === "PATCH" ? PATCH(request) : GET(request);
    });
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<MissionHarness initialMissions={await getRealMissions()} />);
    });
    expect(container.textContent).toContain("Livrer la mission");

    const linkInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    const noteInput = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      setControlValue(linkInput, "https://delivery.example/final");
      setControlValue(noteInput, "Selection finale disponible.");
    });
    const sendButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Envoyer la livraison")!;
    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      sendButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patchCalls).toHaveLength(1);
    expect(JSON.parse(String(patchCalls[0][1]?.body))).toEqual({
      reference: "KLIQUE-A1B2C3D4",
      action: "delivered",
      note: "Selection finale disponible.",
      deliveryLinks: ["https://delivery.example/final"],
      idempotencyKey,
    });
    expect(container.textContent).toContain("Livrées (1)");
    expect(container.textContent).toContain("Livrée");
    expect(container.textContent).toContain("Selection finale disponible.");
    expect(container.querySelector('a[href="https://delivery.example/final"]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("prefills the previous delivery and shows the correction reason", async () => {
    databaseState.executionStatus = "changes_requested";
    databaseState.deliveryLinks = ["https://delivery.example/previous"];
    databaseState.deliveryNote = "Premiere livraison.";
    databaseState.changeRequestNote = "Ajouter les photos du podium.";
    const missions = await getRealMissions();
    const markup = renderToStaticMarkup(
      <CreativeMissionContent missions={missions} onReload={async () => undefined} />,
    );

    expect(markup).toContain("Livrer la mission");
    expect(markup).toContain("Ajouter les photos du podium.");
    expect(markup).toContain('value="https://delivery.example/previous"');
    expect(markup).toContain("Premiere livraison.");
    expect(markup).toContain("Envoyer la livraison");
  });
});
