import { describe, expect, it, vi } from "vitest";
import { createAdminCreativeApplicationsHandlers } from "@/app/api/admin/creatives/applications/route";
import { createAdminCreativeApplicationApproveHandlers } from "@/app/api/admin/creatives/applications/[applicationId]/approve/route";
import { createAdminCreativeApplicationRejectHandlers } from "@/app/api/admin/creatives/applications/[applicationId]/reject/route";
import { CreativeApplicationAdminError } from "@/lib/creatives/admin-application-service";
import type { CreativeApplication } from "@/lib/creatives/applications-sheet";
import type { CreativeProfile } from "@/types/creative";

const applicationId = "11111111-1111-4111-8111-111111111111";
const creativeId = "22222222-2222-4222-8222-222222222222";
const url = "http://localhost/api/admin/creatives/applications";

const application = {
  applicationId,
  sourceRow: 7,
  fields: {},
  moderationStatus: "pending",
  creativeId: null,
  moderatedAt: null,
  moderatedBy: null,
  moderationNotes: null,
} as CreativeApplication;

const profile = {
  id: creativeId,
  workspaceId: "workspace-session",
  applicationId,
} as CreativeProfile;

const getAccess = vi.fn().mockResolvedValue({
  clerkUserId: " user-admin ",
  role: "admin",
  status: "active",
  workspaceId: " workspace-session ",
});

const context = (id = applicationId) => ({
  params: Promise.resolve({ applicationId: id }),
});

const postRequest = (path: "approve" | "reject", body: unknown, query = "") =>
  new Request(`${url}/${applicationId}/${path}${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Admin creative application routes", () => {
  it("lists applications only for an authenticated active Admin and rejects client workspace input", async () => {
    const listApplications = vi.fn().mockResolvedValue([application]);
    const response = await createAdminCreativeApplicationsHandlers({
      getAccess,
      listApplications,
    }).GET(new Request(url));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ applications: [application] });
    expect(listApplications).toHaveBeenCalledWith("workspace-session");

    const invalid = await createAdminCreativeApplicationsHandlers({
      getAccess,
      listApplications,
    }).GET(new Request(`${url}?workspaceId=client-workspace`));
    expect(invalid.status).toBe(400);
  });

  it("returns 401 without identity and 403 without an active Admin workspace", async () => {
    const listApplications = vi.fn();
    const unauthenticated = await createAdminCreativeApplicationsHandlers({
      getAccess: vi.fn().mockResolvedValue(null),
      listApplications,
    }).GET(new Request(url));
    expect(unauthenticated.status).toBe(401);

    for (const access of [
      { clerkUserId: "user-1", role: "media", status: "active", workspaceId: "workspace-1" },
      { clerkUserId: "user-1", role: "admin", status: "disabled", workspaceId: "workspace-1" },
      { clerkUserId: "user-1", role: "admin", status: "active", workspaceId: " " },
    ]) {
      const forbidden = await createAdminCreativeApplicationsHandlers({
        getAccess: vi.fn().mockResolvedValue(access),
        listApplications,
      }).GET(new Request(url));
      expect(forbidden.status).toBe(403);
    }
    expect(listApplications).not.toHaveBeenCalled();
  });

  it("approves using only UUID path params and session identities", async () => {
    const approve = vi.fn().mockResolvedValue({
      profile,
      alreadyApproved: false,
    });
    const response = await createAdminCreativeApplicationApproveHandlers({
      getAccess,
      approve,
    }).POST(postRequest("approve", {}), context());

    expect(response.status).toBe(200);
    expect(approve).toHaveBeenCalledWith(
      "workspace-session",
      applicationId,
      "user-admin",
    );
  });

  it("invalidates public stats only after a new active approval in klique-os", async () => {
    const invalidateStats = vi.fn();
    const approve = vi.fn().mockResolvedValue({
      profile: { ...profile, workspaceId: "klique-os", status: "active" },
      alreadyApproved: false,
    });
    const kliqueAccess = vi.fn().mockResolvedValue({
      clerkUserId: "user-admin",
      role: "admin",
      status: "active",
      workspaceId: "klique-os",
    });
    const handlers = createAdminCreativeApplicationApproveHandlers({
      getAccess: kliqueAccess,
      approve,
      invalidateStats,
    });

    expect((await handlers.POST(postRequest("approve", {}), context())).status).toBe(200);
    expect(invalidateStats).toHaveBeenCalledOnce();

    approve.mockResolvedValueOnce({
      profile: { ...profile, workspaceId: "klique-os", status: "active" },
      alreadyApproved: true,
    });
    expect((await handlers.POST(postRequest("approve", {}), context())).status).toBe(200);
    expect(invalidateStats).toHaveBeenCalledOnce();
  });

  it("does not invalidate public stats for another workspace or failed approval", async () => {
    const invalidateStats = vi.fn();
    const otherWorkspaceApprove = vi.fn().mockResolvedValue({
      profile: { ...profile, status: "active" },
      alreadyApproved: false,
    });
    const otherWorkspace = createAdminCreativeApplicationApproveHandlers({
      getAccess,
      approve: otherWorkspaceApprove,
      invalidateStats,
    });

    expect((await otherWorkspace.POST(postRequest("approve", {}), context())).status).toBe(200);
    expect(invalidateStats).not.toHaveBeenCalled();

    const failed = createAdminCreativeApplicationApproveHandlers({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "user-admin",
        role: "admin",
        status: "active",
        workspaceId: "klique-os",
      }),
      approve: vi.fn().mockRejectedValue(
        new CreativeApplicationAdminError("dependency", "private"),
      ),
      invalidateStats,
    });
    expect((await failed.POST(postRequest("approve", {}), context())).status).toBe(500);
    expect(invalidateStats).not.toHaveBeenCalled();
  });

  it.each([
    { workspaceId: "client-workspace" },
    { clerkUserId: "client-user" },
    { reason: "not allowed" },
    { unexpected: true },
  ])("rejects non-empty approve payloads %#", async (body) => {
    const approve = vi.fn();
    const response = await createAdminCreativeApplicationApproveHandlers({
      getAccess,
      approve,
    }).POST(postRequest("approve", body), context());
    expect(response.status).toBe(400);
    expect(approve).not.toHaveBeenCalled();
  });

  it("rejects malformed approve requests and invalid application UUIDs", async () => {
    const approve = vi.fn();
    const handlers = createAdminCreativeApplicationApproveHandlers({ getAccess, approve });
    const malformed = new Request(`${url}/${applicationId}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect((await handlers.POST(malformed, context())).status).toBe(400);
    expect((await handlers.POST(postRequest("approve", {}), context("not-a-uuid"))).status)
      .toBe(400);
    expect((await handlers.POST(postRequest("approve", {}, "?workspaceId=client"), context())).status)
      .toBe(400);
    expect(approve).not.toHaveBeenCalled();
  });

  it("rejects a candidature with the exact allowlisted reason payload", async () => {
    const reject = vi.fn().mockResolvedValue({
      application: { ...application, moderationStatus: "rejected" },
      alreadyRejected: false,
    });
    const response = await createAdminCreativeApplicationRejectHandlers({
      getAccess,
      reject,
    }).POST(postRequest("reject", { reason: "Portfolio insuffisant" }), context());

    expect(response.status).toBe(200);
    expect(reject).toHaveBeenCalledWith(
      "workspace-session",
      applicationId,
      "user-admin",
      "Portfolio insuffisant",
    );
  });

  it.each([
    {},
    { reason: "" },
    { reason: "Motif", workspaceId: "client-workspace" },
    { reason: "Motif", unexpected: true },
    { reason: 123 },
    null,
    [],
  ])("rejects non-strict rejection payloads %#", async (body) => {
    const reject = vi.fn();
    const response = await createAdminCreativeApplicationRejectHandlers({
      getAccess,
      reject,
    }).POST(postRequest("reject", body), context());
    expect(response.status).toBe(400);
    expect(reject).not.toHaveBeenCalled();
  });

  it("maps safe workflow errors without exposing personal data or logging", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const approve = vi.fn().mockRejectedValue(
      new CreativeApplicationAdminError("conflict", "camille@example.com"),
    );
    const response = await createAdminCreativeApplicationApproveHandlers({
      getAccess,
      approve,
    }).POST(postRequest("approve", {}), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "État de candidature incohérent.",
      code: "conflict",
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
