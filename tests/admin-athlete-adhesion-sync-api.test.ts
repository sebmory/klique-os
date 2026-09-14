import { describe, expect, it, vi } from "vitest";
import { createAdminAthleteAdhesionSyncHandler } from "@/app/api/admin/athletes/sync-adhesions/route";

const syncResult = {
  created: 2,
  skipped: 3,
  errors: [{ sourceRow: 7, message: "Nom athlète manquant." }],
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue({
    clerkUserId: " admin-session ",
    role: "admin",
    status: "active",
    workspaceId: " workspace-session ",
  }),
  syncAdhesions: vi.fn().mockResolvedValue(syncResult),
  ...overrides,
});

const request = () => new Request(
  "http://localhost/api/admin/athletes/sync-adhesions?workspaceId=attacker-workspace&sheet=attacker-sheet",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "attacker-workspace",
      spreadsheetId: "attacker-sheet",
      sheet: "Other_Sheet",
    }),
  },
);

describe("POST /api/admin/athletes/sync-adhesions", () => {
  it("returns the synchronization result for an active Admin", async () => {
    const mocks = dependencies();

    const response = await createAdminAthleteAdhesionSyncHandler(mocks)(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, ...syncResult });
    expect(mocks.syncAdhesions).toHaveBeenCalledOnce();
    expect(mocks.syncAdhesions).toHaveBeenCalledWith();
  });

  it("ignores client workspace and sheet parameters", async () => {
    const mocks = dependencies();

    await createAdminAthleteAdhesionSyncHandler(mocks)(request());

    expect(mocks.getAccess).toHaveBeenCalledWith(expect.any(Request));
    expect(mocks.syncAdhesions).toHaveBeenCalledWith();
  });

  it("returns 401 without a Clerk identity", async () => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(null) });

    const response = await createAdminAthleteAdhesionSyncHandler(mocks)(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Authentification requise." });
    expect(mocks.syncAdhesions).not.toHaveBeenCalled();
  });

  it.each([
    { clerkUserId: "admin-session", role: "athlete", status: "active", workspaceId: "workspace-session" },
    { clerkUserId: "admin-session", role: "admin", status: "disabled", workspaceId: "workspace-session" },
    { clerkUserId: "admin-session", role: "admin", status: "active", workspaceId: "" },
  ])("returns 403 without an active Admin workspace session: %o", async (access) => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(access) });

    const response = await createAdminAthleteAdhesionSyncHandler(mocks)(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Accès refusé." });
    expect(mocks.syncAdhesions).not.toHaveBeenCalled();
  });

  it("returns a generic 500 without leaking a global synchronization error", async () => {
    const mocks = dependencies({
      syncAdhesions: vi.fn().mockRejectedValue(new Error("Sensitive Google Sheets failure")),
    });

    const response = await createAdminAthleteAdhesionSyncHandler(mocks)(request());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      ok: false,
      error: "Impossible de synchroniser les adhésions Athlètes.",
    });
    expect(JSON.stringify(payload)).not.toContain("Sensitive Google Sheets failure");
  });
});