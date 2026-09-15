import { describe, expect, it, vi } from "vitest";
import { createAdminMediaOrganizationHandlers } from "@/app/api/admin/media-organizations/route";
import {
  MediaOrganizationConflictError,
  MediaOrganizationError,
  MediaOrganizationValidationError,
  type MediaOrganization,
} from "@/lib/media-organizations/service";

const organization = (overrides: Partial<MediaOrganization> = {}): MediaOrganization => ({
  id: "49c345aa-fb6e-46e8-83ef-1e07d7b69192",
  workspaceId: "workspace-session",
  name: "Le Journal",
  type: "media_outlet",
  contactEmail: "redaction@journal.example",
  website: "https://journal.example/",
  status: "active",
  createdAt: "2026-09-15T08:00:00.000Z",
  updatedAt: "2026-09-15T08:00:00.000Z",
  ...overrides,
});

const dependencies = (overrides: Record<string, unknown> = {}) => ({
  getAccess: vi.fn().mockResolvedValue({
    clerkUserId: " admin-session ",
    role: "admin",
    status: "active",
    workspaceId: " workspace-session ",
  }),
  listOrganizations: vi.fn().mockResolvedValue([organization()]),
  createOrganization: vi.fn().mockResolvedValue(organization()),
  linkExistingAccess: vi.fn().mockResolvedValue({
    clerkUserId: "user-media",
    mediaId: organization().id,
    email: "reporter@journal.example",
    linkedInvitationCount: 1,
  }),
  ...overrides,
});

const request = (method: "GET" | "POST" | "PATCH", body?: unknown) => new Request(
  "http://localhost/api/admin/media-organizations?workspaceId=workspace-client",
  {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  },
);

const validBody = {
  name: "Le Journal",
  type: "media_outlet",
  contactEmail: "redaction@journal.example",
  website: "https://journal.example",
  status: "active",
};

describe("Admin media organizations API", () => {
  it("lists organizations using only the workspace from the active Admin session", async () => {
    const mocks = dependencies();

    const response = await createAdminMediaOrganizationHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ organizations: [organization()] });
    expect(mocks.listOrganizations).toHaveBeenCalledWith("workspace-session");
  });

  it("returns 401 without a Clerk identity", async () => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(null) });

    const response = await createAdminMediaOrganizationHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentification requise." });
    expect(mocks.listOrganizations).not.toHaveBeenCalled();
  });

  it.each([
    { clerkUserId: "user-1", role: "media", status: "active", workspaceId: "workspace-session" },
    { clerkUserId: "user-1", role: "admin", status: "inactive", workspaceId: "workspace-session" },
    { clerkUserId: "user-1", role: "admin", status: "active", workspaceId: " " },
  ])("returns 403 without an active Admin workspace access", async (access) => {
    const mocks = dependencies({ getAccess: vi.fn().mockResolvedValue(access) });

    const response = await createAdminMediaOrganizationHandlers(mocks).GET(request("GET"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Accès refusé." });
    expect(mocks.listOrganizations).not.toHaveBeenCalled();
  });

  it("creates an organization with only allowlisted fields and the session workspace", async () => {
    const mocks = dependencies();

    const response = await createAdminMediaOrganizationHandlers(mocks).POST(request("POST", validBody));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ organization: organization() });
    expect(mocks.createOrganization).toHaveBeenCalledWith("workspace-session", validBody);
  });

  it("accepts omitted optional website and status without adding client identity", async () => {
    const mocks = dependencies();
    const body = {
      name: "Journaliste indépendant",
      type: "journalist",
      contactEmail: "journaliste@example.com",
    };

    const response = await createAdminMediaOrganizationHandlers(mocks).POST(request("POST", body));

    expect(response.status).toBe(201);
    expect(mocks.createOrganization).toHaveBeenCalledWith("workspace-session", body);
  });

  it.each(["workspaceId", "clerkUserId", "id", "createdAt", "unexpected"])(
    "rejects the non-allowlisted field %s",
    async (field) => {
      const mocks = dependencies();

      const response = await createAdminMediaOrganizationHandlers(mocks).POST(request("POST", {
        ...validBody,
        [field]: "client-controlled",
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "validation" });
      expect(mocks.createOrganization).not.toHaveBeenCalled();
    },
  );

  it("returns 400 for malformed JSON", async () => {
    const mocks = dependencies();
    const malformedRequest = new Request("http://localhost/api/admin/media-organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const response = await createAdminMediaOrganizationHandlers(mocks).POST(malformedRequest);

    expect(response.status).toBe(400);
    expect(mocks.createOrganization).not.toHaveBeenCalled();
  });

  it("maps service validation errors to 400", async () => {
    const mocks = dependencies({
      createOrganization: vi.fn().mockRejectedValue(
        new MediaOrganizationValidationError("contactEmail est invalide."),
      ),
    });

    const response = await createAdminMediaOrganizationHandlers(mocks).POST(request("POST", validBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "contactEmail est invalide.",
      code: "validation",
    });
  });

  it("maps uniqueness conflicts to 409", async () => {
    const mocks = dependencies({
      createOrganization: vi.fn().mockRejectedValue(new MediaOrganizationConflictError()),
    });

    const response = await createAdminMediaOrganizationHandlers(mocks).POST(request("POST", validBody));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "conflict" });
  });

  it("links an existing access using only mediaId, email and the session workspace", async () => {
    const mocks = dependencies();
    const body = { mediaId: organization().id, email: " Reporter@Journal.Example " };

    const response = await createAdminMediaOrganizationHandlers(mocks).PATCH(request("PATCH", body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      linkedAccess: { clerkUserId: "user-media", mediaId: organization().id },
    });
    expect(mocks.linkExistingAccess).toHaveBeenCalledWith("workspace-session", body);
  });

  it("keeps the link action restricted to an active Admin", async () => {
    const mocks = dependencies({
      getAccess: vi.fn().mockResolvedValue({
        clerkUserId: "user-media",
        role: "media",
        status: "active",
        workspaceId: "workspace-session",
      }),
    });

    const response = await createAdminMediaOrganizationHandlers(mocks).PATCH(request("PATCH", {
      mediaId: organization().id,
      email: "reporter@journal.example",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Accès refusé." });
    expect(mocks.linkExistingAccess).not.toHaveBeenCalled();
  });

  it.each(["workspaceId", "clerkUserId", "role", "status", "unexpected"])(
    "rejects the non-allowlisted link field %s",
    async (field) => {
      const mocks = dependencies();
      const response = await createAdminMediaOrganizationHandlers(mocks).PATCH(request("PATCH", {
        mediaId: organization().id,
        email: "reporter@journal.example",
        [field]: "client-controlled",
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "validation" });
      expect(mocks.linkExistingAccess).not.toHaveBeenCalled();
    },
  );

  it.each([
    { mediaId: organization().id },
    { email: "reporter@journal.example" },
    { mediaId: organization().id, email: "reporter@journal.example", extra: true },
  ])("requires the exact link payload", async (body) => {
    const mocks = dependencies();
    const response = await createAdminMediaOrganizationHandlers(mocks).PATCH(request("PATCH", body));

    expect(response.status).toBe(400);
    expect(mocks.linkExistingAccess).not.toHaveBeenCalled();
  });

  it("returns the new-invitation instruction for a pending legacy invitation", async () => {
    const mocks = dependencies({
      linkExistingAccess: vi.fn().mockRejectedValue(new MediaOrganizationError(
        "invitation_pending",
        "Une invitation ancienne est encore en attente. Envoyez une nouvelle invitation liée à l’organisation.",
      )),
    });

    const response = await createAdminMediaOrganizationHandlers(mocks).PATCH(request("PATCH", {
      mediaId: organization().id,
      email: "legacy@journal.example",
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Une invitation ancienne est encore en attente. Envoyez une nouvelle invitation liée à l’organisation.",
      code: "invitation_pending",
    });
  });

  it.each(["GET", "POST", "PATCH"] as const)("returns a generic 500 for unexpected %s failures", async (method) => {
    const mocks = dependencies({
      ...(method === "GET"
        ? { listOrganizations: vi.fn().mockRejectedValue(new Error("database unavailable")) }
        : method === "POST"
          ? { createOrganization: vi.fn().mockRejectedValue(new Error("database unavailable")) }
          : { linkExistingAccess: vi.fn().mockRejectedValue(new Error("database unavailable")) }),
    });
    const handler = createAdminMediaOrganizationHandlers(mocks)[method];

    const response = await handler(request(
      method,
      method === "POST"
        ? validBody
        : method === "PATCH"
          ? { mediaId: organization().id, email: "reporter@journal.example" }
          : undefined,
    ));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Impossible de gérer les organisations Média.",
    });
  });
});