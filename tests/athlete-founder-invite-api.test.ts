import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAthleteInviteHandlers } from "@/app/api/athletes/invite/route";

const invitation = {
  athleteId: "athlete-server",
  email: "founder@example.com",
  clerkInvitationId: "invitation-1",
  status: "invited" as const,
  invitedByClerkUserId: "admin-session",
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T10:00:00.000Z",
};

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  evaluateAccess: vi.fn().mockResolvedValue({ allowed: true, reason: "allowed" }),
  getAccessProfile: vi.fn().mockResolvedValue({
    clerkUser: { id: "admin-session", email: "admin@example.com" },
    userAccess: {
      clerkUserId: "admin-session",
      email: "admin@example.com",
      role: "admin",
      workspaceId: " workspace-session ",
      athleteId: null,
      partnerId: null,
      mediaId: null,
      status: "active",
      createdAt: "2026-09-15T09:00:00.000Z",
      updatedAt: "2026-09-15T09:00:00.000Z",
    },
  }),
  getAccessState: vi.fn().mockResolvedValue({ state: "none", email: null }),
  resolveFounderAthleteId: vi.fn().mockResolvedValue("athlete-server"),
  inviteAthlete: vi.fn().mockResolvedValue({ ok: true, invitation }),
  ...overrides,
});

const postRequest = (body: Record<string, unknown>) => new NextRequest(
  "http://localhost/api/athletes/invite",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

describe("Founder athlete invitation API", () => {
  it("derives workspace and athlete identity from the authenticated Founder subscription", async () => {
    const mocks = dependencies();
    const request = postRequest({
      subscriptionId: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
      athleteId: "athlete-client-tampered",
      workspaceId: "workspace-client-tampered",
      resend: false,
    });

    const response = await createAthleteInviteHandlers(mocks).POST(request);

    expect(response.status).toBe(200);
    expect(mocks.resolveFounderAthleteId).toHaveBeenCalledWith(
      "workspace-session",
      "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
    );
    expect(mocks.inviteAthlete).toHaveBeenCalledWith(request, "athlete-server");
    expect(mocks.inviteAthlete).not.toHaveBeenCalledWith(
      expect.anything(),
      "athlete-client-tampered",
      expect.anything(),
    );
  });

  it("resends through the existing Clerk invitation flow", async () => {
    const mocks = dependencies();
    const request = postRequest({
      subscriptionId: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
      resend: true,
    });

    const response = await createAthleteInviteHandlers(mocks).POST(request);

    expect(response.status).toBe(200);
    expect(mocks.inviteAthlete).toHaveBeenCalledWith(
      request,
      "athlete-server",
      { resend: true },
    );
  });

  it("rejects a non-Admin session before resolving the subscription", async () => {
    const mocks = dependencies({
      getAccessProfile: vi.fn().mockResolvedValue({
        clerkUser: { id: "athlete-session", email: "athlete@example.com" },
        userAccess: {
          role: "athlete",
          status: "active",
          workspaceId: "workspace-session",
        },
      }),
    });

    const response = await createAthleteInviteHandlers(mocks).POST(postRequest({
      subscriptionId: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
    }));

    expect(response.status).toBe(403);
    expect(mocks.resolveFounderAthleteId).not.toHaveBeenCalled();
    expect(mocks.inviteAthlete).not.toHaveBeenCalled();
  });

  it("does not invite when the active Founder subscription is outside the session workspace", async () => {
    const mocks = dependencies({ resolveFounderAthleteId: vi.fn().mockResolvedValue(null) });

    const response = await createAthleteInviteHandlers(mocks).POST(postRequest({
      subscriptionId: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Abonnement Founder actif introuvable." });
    expect(mocks.inviteAthlete).not.toHaveBeenCalled();
  });
});
