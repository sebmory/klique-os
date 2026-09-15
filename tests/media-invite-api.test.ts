import { beforeEach, describe, expect, it, vi } from "vitest";

const { inviteMediaToKliqueMock } = vi.hoisted(() => ({
  inviteMediaToKliqueMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  inviteMediaToKlique: inviteMediaToKliqueMock,
}));

import { POST } from "@/app/api/media/invite/route";

const mediaId = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";

const request = (body: unknown) => new Request(
  "http://localhost/api/media/invite?workspaceId=workspace-client",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

describe("media invitation API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("forwards normalized email and mediaId with the original session request", async () => {
    inviteMediaToKliqueMock.mockResolvedValue({
      ok: true,
      invitationId: "invitation-1",
      email: "journalist@example.com",
      mediaId,
    });
    const originalRequest = request({
      email: " Journalist@Example.com ",
      mediaId: mediaId.toUpperCase(),
    });

    const response = await POST(originalRequest);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      invitationId: "invitation-1",
      email: "journalist@example.com",
    });
    expect(inviteMediaToKliqueMock).toHaveBeenCalledWith(
      originalRequest,
      "Journalist@Example.com",
      mediaId,
    );
  });

  it.each([
    [{ email: "journalist@example.com" }, "missing"],
    [{ email: "journalist@example.com", mediaId: "not-a-uuid" }, "invalid"],
    [{ email: "journalist@example.com", mediaId: "" }, "blank"],
  ])("returns 400 for a %s mediaId", async (body, _scenario: string) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Identifiant Média invalide.",
    });
    expect(inviteMediaToKliqueMock).not.toHaveBeenCalled();
  });

  it.each([
    { mediaId },
    { email: "", mediaId },
    { email: 42, mediaId },
  ])("returns 400 when email is absent or blank", async (body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Adresse email requise.",
    });
    expect(inviteMediaToKliqueMock).not.toHaveBeenCalled();
  });

  it.each(["workspaceId", "clerkUserId", "role", "status", "resend", "unexpected"])(
    "rejects the non-allowlisted field %s",
    async (field) => {
      const response = await POST(request({
        email: "journalist@example.com",
        mediaId,
        [field]: "client-controlled",
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ ok: false, error: "Payload invalide." });
      expect(inviteMediaToKliqueMock).not.toHaveBeenCalled();
    },
  );

  it("returns 400 for malformed JSON", async () => {
    const malformedRequest = new Request("http://localhost/api/media/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await POST(malformedRequest);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Payload invalide." });
    expect(inviteMediaToKliqueMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_email", 400, "Adresse email invalide."],
    ["invalid_media", 400, "Identifiant Média invalide."],
    ["media_not_found", 404, "Organisation Média active introuvable."],
    ["already_invited", 409, "Une invitation est déjà en attente pour cette adresse."],
    ["already_active", 409, "Cette adresse dispose déjà d’un accès média actif."],
    ["forbidden", 403, "Accès refusé."],
    ["clerk_error", 502, "L’invitation n’a pas pu être envoyée."],
  ] as const)("maps %s to status %i", async (reason, expectedStatus, expectedError) => {
    inviteMediaToKliqueMock.mockResolvedValue({ ok: false, reason });

    const response = await POST(request({ email: "journalist@example.com", mediaId }));

    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toEqual({ ok: false, error: expectedError });
  });

  it("keeps a service-provided error message", async () => {
    inviteMediaToKliqueMock.mockResolvedValue({
      ok: false,
      reason: "clerk_error",
      message: "Clerk temporairement indisponible.",
    });

    const response = await POST(request({ email: "journalist@example.com", mediaId }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Clerk temporairement indisponible.",
    });
  });

  it("returns the existing generic 500 response for unexpected failures", async () => {
    inviteMediaToKliqueMock.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(request({ email: "journalist@example.com", mediaId }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "Invitation impossible." });
  });
});