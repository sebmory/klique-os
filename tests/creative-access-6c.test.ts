import { describe, expect, it, vi } from "vitest";
import { buildUserAccessPermissionContext } from "@/lib/clerk-access/service";
import { createAdminCreativeAccessHandlers } from "@/app/api/admin/creatives/access/route";

const creativeId = "11111111-1111-4111-8111-111111111111";

const adminAccess = vi.fn(async () => ({
  clerkUserId: "admin-1",
  role: "admin",
  status: "active",
  workspaceId: "workspace-a",
}));

const request = (method: string, body?: unknown) => new Request(
  "http://localhost/api/admin/creatives/access",
  {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  },
);

describe("creative access 6C", () => {
  it("keeps an active Admin role while adding active creative permissions", () => {
    const context = buildUserAccessPermissionContext({
      role: "admin",
      status: "active",
      workspaceId: "workspace-a",
    }, {
      creativeProfileId: creativeId,
      status: "active",
      workspaceId: "workspace-a",
      creativeProfileStatus: "active",
    });

    expect(context.isAdmin).toBe(true);
    expect(context.hasFullAccess).toBe(true);
    expect(context.isCreative).toBe(true);
    expect(context.canAccessCreativeSpace).toBe(true);
  });

  it("invites an active profile and never calls Clerk directly from the route test", async () => {
    const invite = vi.fn(async () => ({
      ok: true as const,
      creativeProfileId: creativeId,
      email: "creative@example.com",
      clerkInvitationId: "inv_1",
      workspaceId: "workspace-a",
    }));
    const handlers = createAdminCreativeAccessHandlers({
      getAccess: adminAccess,
      getState: vi.fn(),
      invite,
      revoke: vi.fn(),
    });

    const response = await handlers.POST(request("POST", { creativeProfileId: creativeId }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      state: "invited",
      email: "creative@example.com",
      onboardingState: "invitation_sent",
    });
    expect(invite).toHaveBeenCalledWith(expect.any(Request), creativeId, {
      resend: false,
      message: null,
    });
  });

  it("rejects an inactive profile and prevents duplicate pending invitations", async () => {
    const invite = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: "inactive_profile" })
      .mockResolvedValueOnce({ ok: false, reason: "already_invited" });
    const handlers = createAdminCreativeAccessHandlers({
      getAccess: adminAccess,
      getState: vi.fn(),
      invite,
      revoke: vi.fn(),
    });

    const inactive = await handlers.POST(request("POST", { creativeProfileId: creativeId }));
    const duplicate = await handlers.POST(request("POST", { creativeProfileId: creativeId }));

    expect(inactive.status).toBe(409);
    expect((await inactive.json()).error).toContain("inactive");
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toContain("déjà en attente");
  });

  it("supports an idempotent resend and revokes access without changing the profile", async () => {
    const invite = vi.fn(async () => ({
      ok: true as const,
      creativeProfileId: creativeId,
      email: "creative@example.com",
      clerkInvitationId: "inv_2",
      workspaceId: "workspace-a",
    }));
    const revoke = vi.fn(async () => ({
      ok: true as const,
      creativeProfileId: creativeId,
    }));
    const handlers = createAdminCreativeAccessHandlers({
      getAccess: adminAccess,
      getState: vi.fn(async () => ({
        state: "revoked" as const,
        email: "creative@example.com",
        onboardingState: "disabled" as const,
      })),
      invite,
      revoke,
    });

    const resend = await handlers.POST(request("POST", {
      creativeProfileId: creativeId,
      resend: true,
    }));
    const revoked = await handlers.DELETE(request("DELETE", { creativeProfileId: creativeId }));

    expect(resend.status).toBe(201);
    expect(invite).toHaveBeenCalledWith(expect.any(Request), creativeId, {
      resend: true,
      message: null,
    });
    expect(await revoked.json()).toEqual({
      state: "revoked",
      email: "creative@example.com",
      onboardingState: "disabled",
    });
    expect(revoke).toHaveBeenCalledWith(expect.any(Request), creativeId);
  });

  it("isolates access state lookup with the Admin workspace", async () => {
    const getState = vi.fn(async () => ({
      state: "active" as const,
      email: "creative@example.com",
    }));
    const handlers = createAdminCreativeAccessHandlers({
      getAccess: adminAccess,
      getState,
      invite: vi.fn(),
      revoke: vi.fn(),
    });
    const response = await handlers.GET(new Request(
      `http://localhost/api/admin/creatives/access?creativeProfileId=${creativeId}`,
    ));

    expect(response.status).toBe(200);
    expect(getState).toHaveBeenCalledWith("workspace-a", creativeId);
  });

  it("validates a submitted profile explicitly in the Admin workspace", async () => {
    const validate = vi.fn(async () => "validated" as const);
    const getState = vi.fn(async () => ({
      state: "active" as const,
      email: "creative@example.com",
      onboardingState: "active" as const,
    }));
    const handlers = createAdminCreativeAccessHandlers({
      getAccess: adminAccess,
      getState,
      invite: vi.fn(),
      revoke: vi.fn(),
      validate,
    });

    const response = await handlers.PATCH(request("PATCH", {
      creativeProfileId: creativeId,
      action: "validate",
    }));

    expect(response.status).toBe(200);
    expect(validate).toHaveBeenCalledWith("workspace-a", creativeId, "admin-1");
    expect(await response.json()).toMatchObject({
      state: "active",
      onboardingState: "active",
    });
  });
});
