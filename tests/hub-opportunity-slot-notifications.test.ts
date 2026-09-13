import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sqlMock,
  transactionMock,
  createContentStorageClientMock,
  resolveActiveAccessMock,
  findActiveAthleteClerkUserIdsMock,
  createNotificationsForRecipientsMock,
} = vi.hoisted(() => ({
  sqlMock: vi.fn(),
  transactionMock: vi.fn(),
  createContentStorageClientMock: vi.fn(),
  resolveActiveAccessMock: vi.fn(),
  findActiveAthleteClerkUserIdsMock: vi.fn(),
  createNotificationsForRecipientsMock: vi.fn(),
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

vi.mock("@/lib/hub-opportunities/service", () => ({
  resolveActiveAccess: resolveActiveAccessMock,
}));

vi.mock("@/lib/notifications/service", () => ({
  findActiveAthleteClerkUserIds: findActiveAthleteClerkUserIdsMock,
  createNotificationsForRecipients: createNotificationsForRecipientsMock,
}));

import { updateHubOpportunitySlotRequestStatus } from "@/lib/hub-opportunity-slots/service";

type SqlCall = { text: string; values: unknown[] };

const requestRow = (status: "confirmed" | "declined" | "cancelled") => ({
  id: "request-1",
  slot_id: "slot-1",
  opportunity_id: "opportunity-1",
  workspace_id: "workspace-1",
  athlete_id: "athlete-1",
  clerk_user_id: "user-athlete-legacy",
  status,
  athlete_seen_at: null,
  created_at: "2026-09-13T08:00:00.000Z",
  updated_at: "2026-09-13T09:00:00.000Z",
});

let calls: SqlCall[] = [];

const installSqlMock = () => {
  calls = [];
  sqlMock.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    calls.push({ text, values });

    if (text.includes("select s.id") && text.includes("for update of s")) {
      return Promise.resolve([{ id: "slot-1" }]);
    }
    if (text.includes("update hub_opportunity_slot_requests")) {
      const status = text.includes("status = 'confirmed'") ? "confirmed" : String(values[0]);
      return Promise.resolve([requestRow(status as "confirmed" | "declined" | "cancelled")]);
    }
    return Promise.resolve([]);
  });
  Object.assign(sqlMock, { transaction: transactionMock });
  transactionMock.mockImplementation(async (queries: Promise<unknown>[]) => Promise.all(queries));
  createContentStorageClientMock.mockReturnValue(sqlMock);
};

describe("hub opportunity slot decision notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveActiveAccessMock.mockResolvedValue({ role: "admin", workspaceId: "workspace-1" });
    findActiveAthleteClerkUserIdsMock.mockResolvedValue(["user-athlete-active"]);
    createNotificationsForRecipientsMock.mockResolvedValue([]);
    installSqlMock();
  });

  it.each([
    ["confirmed", "Votre créneau a été accepté"],
    ["declined", "Votre demande de créneau a été refusée"],
  ] as const)("notifies the active athlete after a %s decision", async (status, title) => {
    await updateHubOpportunitySlotRequestStatus(new Request("http://localhost"), "request-1", status);

    expect(findActiveAthleteClerkUserIdsMock).toHaveBeenCalledWith("workspace-1", ["athlete-1"]);
    expect(createNotificationsForRecipientsMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      recipientClerkUserIds: ["user-athlete-active"],
      type: "opportunity.slot_request_decision",
      title,
      actionHref: "/athlete/opportunities",
      sourceType: "hub_opportunity_slot_request",
      sourceId: `request-1:${status}`,
    });

    const update = calls.find((call) => call.text.includes("update hub_opportunity_slot_requests"));
    expect(update?.text).toContain("athlete_seen_at = null");
  });

  it("keeps cancellation on the legacy flow without a persistent notification", async () => {
    await updateHubOpportunitySlotRequestStatus(new Request("http://localhost"), "request-1", "cancelled");

    expect(findActiveAthleteClerkUserIdsMock).not.toHaveBeenCalled();
    expect(createNotificationsForRecipientsMock).not.toHaveBeenCalled();
    expect(calls.find((call) => call.text.includes("update hub_opportunity_slot_requests"))?.text)
      .toContain("athlete_seen_at = null");
  });

  it("does not cancel the decision when notification delivery fails", async () => {
    createNotificationsForRecipientsMock.mockRejectedValue(new Error("Notifications unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      updateHubOpportunitySlotRequestStatus(new Request("http://localhost"), "request-1", "declined"),
    ).resolves.toMatchObject({ id: "request-1", status: "declined", athleteSeenAt: null });

    expect(consoleError).toHaveBeenCalledWith(
      "[hub_opportunity_slot_notifications] Notifications unavailable",
    );
    consoleError.mockRestore();
  });
});