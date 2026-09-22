import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as routeModule from "@/app/api/internal/partner-application-sync/route";
import { createPartnerApplicationSyncHandler } from "@/app/api/internal/partner-application-sync/route";
import { PartnerApplicationSyncError } from "@/lib/partners/application-sync-service";
import { isPartnerApplicationSyncWebhook } from "@/proxy";

const secret = "a-secure-partner-sync-secret-with-32-chars";
const timestamp = "1790078400";
const now = new Date(Number(timestamp) * 1000);

const createDependencies = () => ({
  sync: vi.fn().mockResolvedValue({
    status: "created" as const,
    sourceRow: 5,
    canonicalRow: 8,
    partnerId: "a4ed0d44-36d6-48e3-b399-28f6ac9e2538",
    partnerName: "Aloha Wake",
  }),
  findAdminIds: vi.fn().mockResolvedValue(["admin-1", " admin-1 ", "admin-2"]),
  notifyAdmins: vi.fn().mockResolvedValue([]),
  getWorkspaceId: vi.fn().mockReturnValue("workspace-server"),
  getSecret: vi.fn().mockReturnValue(secret),
  now: vi.fn().mockReturnValue(now),
});

const signedRequest = (body: string, overrides: Record<string, string> = {}) => {
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  return new Request("http://localhost/api/internal/partner-application-sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-klique-timestamp": timestamp,
      "x-klique-signature": signature,
      ...overrides,
    },
    body,
  });
};

describe("POST /api/internal/partner-application-sync", () => {
  beforeEach(() => vi.clearAllMocks());

  it("synchronizes only rowNumber and notifies active Admins in the server workspace", async () => {
    const dependencies = createDependencies();
    const POST = createPartnerApplicationSyncHandler(dependencies);

    const response = await POST(signedRequest(JSON.stringify({ rowNumber: 5 })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, status: "created", canonicalRow: 8 });
    expect(dependencies.sync).toHaveBeenCalledWith(5);
    expect(dependencies.findAdminIds).toHaveBeenCalledWith("workspace-server");
    expect(dependencies.notifyAdmins).toHaveBeenCalledWith({
      workspaceId: "workspace-server",
      recipientClerkUserIds: ["admin-1", "admin-2"],
      type: "partner_application.synced",
      title: "Réponse partenaire synchronisée",
      body: "Aloha Wake",
      actionHref: "/crm/demandes?tab=partners",
      sourceType: "partner_application.sync",
      sourceId: "5",
    });
  });

  it.each([
    { rowNumber: 5, workspaceId: "attacker-workspace" },
    { rowNumber: 5, email: "attacker@example.com" },
    { rowNumber: 5, partnerId: "attacker-partner" },
    { rowNumber: 5, name: "Injected" },
    {},
  ])("rejects every payload other than exact rowNumber: %o", async (payload) => {
    const dependencies = createDependencies();
    const POST = createPartnerApplicationSyncHandler(dependencies);

    const response = await POST(signedRequest(JSON.stringify(payload)));

    expect(response.status).toBe(400);
    expect(dependencies.sync).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before parsing or synchronizing", async () => {
    const dependencies = createDependencies();
    const POST = createPartnerApplicationSyncHandler(dependencies);
    const request = signedRequest("{", { "x-klique-signature": "sha256=invalid" });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(dependencies.sync).not.toHaveBeenCalled();
  });

  it("rejects a stale signed request", async () => {
    const dependencies = createDependencies();
    dependencies.now.mockReturnValue(new Date((Number(timestamp) + 301) * 1000));
    const POST = createPartnerApplicationSyncHandler(dependencies);

    const response = await POST(signedRequest(JSON.stringify({ rowNumber: 5 })));

    expect(response.status).toBe(401);
    expect(dependencies.sync).not.toHaveBeenCalled();
  });

  it.each([
    [new PartnerApplicationSyncError("not_found", "Introuvable."), 404],
    [new PartnerApplicationSyncError("conflict", "Doublons."), 409],
    [new Error("secret database detail"), 500],
  ])("maps synchronization errors without exposing internals", async (error, status) => {
    const dependencies = createDependencies();
    dependencies.sync.mockRejectedValue(error);
    const POST = createPartnerApplicationSyncHandler(dependencies);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(signedRequest(JSON.stringify({ rowNumber: 5 })));

    expect(response.status).toBe(status);
    if (status === 500) {
      expect(JSON.stringify(await response.json())).not.toContain("database");
      expect(consoleError).toHaveBeenCalledWith("[partner-application-sync]", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    }
    consoleError.mockRestore();
  });

  it("exports POST only", () => {
    expect("POST" in routeModule).toBe(true);
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) expect(method in routeModule).toBe(false);
  });
});

describe("Partner application sync proxy access", () => {
  const path = "/api/internal/partner-application-sync";

  it("allows POST only on the exact webhook path", () => {
    expect(isPartnerApplicationSyncWebhook(path, "POST")).toBe(true);
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      expect(isPartnerApplicationSyncWebhook(path, method)).toBe(false);
    }
    expect(isPartnerApplicationSyncWebhook(`${path}/5`, "POST")).toBe(false);
    expect(isPartnerApplicationSyncWebhook(`${path}/`, "POST")).toBe(false);
  });
});