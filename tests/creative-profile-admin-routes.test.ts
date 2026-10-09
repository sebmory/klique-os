import { describe, expect, it, vi } from "vitest";
import * as collectionRoute from "@/app/api/admin/creatives/route";
import * as itemRoute from "@/app/api/admin/creatives/[creativeId]/route";
import { createAdminCreativeProfilesHandlers } from "@/app/api/admin/creatives/route";
import { createAdminCreativeProfileHandlers } from "@/app/api/admin/creatives/[creativeId]/route";
import { CreativeProfileAdminError } from "@/lib/creatives/admin-profile-service";
import type { CreativeProfile } from "@/types/creative";

const creativeId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const url = "http://localhost/api/admin/creatives";

const profile = {
  id: creativeId,
  workspaceId: "workspace-session",
  provenance: "form_application",
  applicationId,
  displayName: "Camille Martin",
  creativeType: "both",
  contactEmail: "camille@example.com",
  status: "active",
} as CreativeProfile;

const access = {
  clerkUserId: " user-admin ",
  role: "admin",
  status: "active",
  workspaceId: " workspace-session ",
};

const patchRequest = (body: unknown, query = "") => new Request(
  `${url}/${creativeId}${query}`,
  {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

const postRequest = (body: unknown, query = "") => new Request(
  `${url}${query}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

const manualInput = {
  displayName: "Studio Léman",
  creativeType: "photographer",
  contactEmail: "studio@example.com",
  phone: null,
  websiteUrl: null,
  portfolioUrl: "https://portfolio.example.com",
  instagram: null,
  city: "Lausanne",
  country: "Suisse",
  coverageAreas: ["Vaud"],
  specialties: ["Football"],
  bio: null,
  status: "active",
};

const context = (id = creativeId) => ({
  params: Promise.resolve({ creativeId: id }),
});

describe("Admin creative profiles routes", () => {
  it("exports only the requested route methods", () => {
    expect("GET" in collectionRoute).toBe(true);
    expect("POST" in collectionRoute).toBe(true);
    expect("PATCH" in itemRoute).toBe(true);
    expect("POST" in itemRoute).toBe(false);
    expect("DELETE" in itemRoute).toBe(false);
  });

  it("creates a manual profile with session workspace and Admin audit", async () => {
    const created = {
      ...profile,
      provenance: "admin_manual",
      applicationId: null,
      sourceRow: null,
    } as CreativeProfile;
    const createManualProfile = vi.fn().mockResolvedValue(created);
    const response = await createAdminCreativeProfilesHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      listProfiles: vi.fn(),
      createManualProfile,
    }).POST(postRequest(manualInput));

    expect(response.status).toBe(201);
    expect(createManualProfile).toHaveBeenCalledWith(
      "workspace-session",
      "user-admin",
      manualInput,
    );
    await expect(response.json()).resolves.toEqual({ profile: created });
  });

  it("protects manual creation with Admin access and rejects client workspace input", async () => {
    const createManualProfile = vi.fn();
    const unauthenticated = await createAdminCreativeProfilesHandlers({
      getAccess: vi.fn().mockResolvedValue(null),
      listProfiles: vi.fn(),
      createManualProfile,
    }).POST(postRequest(manualInput));
    expect(unauthenticated.status).toBe(401);

    const invalidQuery = await createAdminCreativeProfilesHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      listProfiles: vi.fn(),
      createManualProfile,
    }).POST(postRequest(manualInput, "?workspaceId=forged"));
    expect(invalidQuery.status).toBe(400);
    expect(createManualProfile).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and non-JSON manual creation requests", async () => {
    const createManualProfile = vi.fn();
    const handlers = createAdminCreativeProfilesHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      listProfiles: vi.fn(),
      createManualProfile,
    });
    const malformed = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const wrongContentType = new Request(url, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(manualInput),
    });

    expect((await handlers.POST(malformed)).status).toBe(400);
    expect((await handlers.POST(wrongContentType)).status).toBe(400);
    expect(createManualProfile).not.toHaveBeenCalled();
  });

  it.each([
    { ...manualInput, workspaceId: "forged" },
    { ...manualInput, applicationId: applicationId },
    { ...manualInput, sourceRow: 7 },
    { ...manualInput, provenance: "form_application" },
    { ...manualInput, approvedByClerkUserId: "forged" },
    { ...manualInput, creativeType: "designer" },
    { ...manualInput, status: "pending" },
    { ...manualInput, contactEmail: null },
    { ...manualInput, specialties: [1] },
    {},
    null,
    [],
  ])("rejects non-strict manual creation payload %#", async (body) => {
    const createManualProfile = vi.fn();
    const response = await createAdminCreativeProfilesHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      listProfiles: vi.fn(),
      createManualProfile,
    }).POST(postRequest(body));

    expect(response.status).toBe(400);
    expect(createManualProfile).not.toHaveBeenCalled();
  });

  it("invalidates public stats only for an active manual profile in klique-os", async () => {
    const invalidateStats = vi.fn();
    const createManualProfile = vi.fn()
      .mockResolvedValueOnce({
        ...profile,
        workspaceId: "klique-os",
        provenance: "admin_manual",
        applicationId: null,
        sourceRow: null,
        status: "active",
      })
      .mockResolvedValueOnce({
        ...profile,
        workspaceId: "klique-os",
        provenance: "admin_manual",
        applicationId: null,
        sourceRow: null,
        status: "inactive",
      });
    const handlers = createAdminCreativeProfilesHandlers({
      getAccess: vi.fn().mockResolvedValue({
        ...access,
        workspaceId: "klique-os",
      }),
      listProfiles: vi.fn(),
      createManualProfile,
      invalidateStats,
    });

    expect((await handlers.POST(postRequest(manualInput))).status).toBe(201);
    expect(invalidateStats).toHaveBeenCalledOnce();
    expect((await handlers.POST(postRequest({
      ...manualInput,
      status: "inactive",
    }))).status).toBe(201);
    expect(invalidateStats).toHaveBeenCalledOnce();
  });

  it("lists profiles with the workspace from active Admin user_access", async () => {
    const listProfiles = vi.fn().mockResolvedValue([profile]);
    const response = await createAdminCreativeProfilesHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      listProfiles,
    }).GET(new Request(url));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listProfiles).toHaveBeenCalledWith("workspace-session");
    await expect(response.json()).resolves.toEqual({ profiles: [profile] });
  });

  it("requires authentication and an active Admin workspace", async () => {
    const listProfiles = vi.fn();
    const unauthenticated = await createAdminCreativeProfilesHandlers({
      getAccess: vi.fn().mockResolvedValue(null),
      listProfiles,
    }).GET(new Request(url));
    expect(unauthenticated.status).toBe(401);

    const forbidden = await createAdminCreativeProfilesHandlers({
      getAccess: vi.fn().mockResolvedValue({
        ...access,
        role: "media",
      }),
      listProfiles,
    }).GET(new Request(url));
    expect(forbidden.status).toBe(403);
    expect(listProfiles).not.toHaveBeenCalled();
  });

  it("patches editable fields and status using only session workspace and path UUID", async () => {
    const updateProfile = vi.fn().mockResolvedValue({ ...profile, status: "inactive" });
    const body = {
      displayName: "Camille Studio",
      creativeType: "photographer",
      coverageAreas: ["Vaud", "Fribourg"],
      specialties: ["Football"],
      status: "inactive",
    };
    const response = await createAdminCreativeProfileHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      updateProfile,
    }).PATCH(patchRequest(body), context());

    expect(response.status).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith("workspace-session", creativeId, body);
  });

  it("invalidates public stats after activation or deactivation in klique-os", async () => {
    const invalidateStats = vi.fn();
    const updateProfile = vi.fn().mockResolvedValue({
      ...profile,
      workspaceId: "klique-os",
      status: "inactive",
    });
    const handlers = createAdminCreativeProfileHandlers({
      getAccess: vi.fn().mockResolvedValue({
        ...access,
        workspaceId: "klique-os",
      }),
      updateProfile,
      invalidateStats,
    });

    expect((await handlers.PATCH(
      patchRequest({ status: "inactive" }),
      context(),
    )).status).toBe(200);
    expect(invalidateStats).toHaveBeenCalledOnce();

    updateProfile.mockResolvedValueOnce({
      ...profile,
      workspaceId: "klique-os",
      status: "active",
    });
    expect((await handlers.PATCH(
      patchRequest({ status: "active" }),
      context(),
    )).status).toBe(200);
    expect(invalidateStats).toHaveBeenCalledTimes(2);
  });

  it("does not invalidate public stats for profile edits, other workspaces, or failures", async () => {
    const invalidateStats = vi.fn();
    const updateProfile = vi.fn().mockResolvedValue(profile);
    const handlers = createAdminCreativeProfileHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      updateProfile,
      invalidateStats,
    });

    expect((await handlers.PATCH(
      patchRequest({ displayName: "Camille Studio" }),
      context(),
    )).status).toBe(200);
    expect((await handlers.PATCH(
      patchRequest({ status: "inactive" }),
      context(),
    )).status).toBe(200);
    expect(invalidateStats).not.toHaveBeenCalled();

    updateProfile.mockRejectedValueOnce(
      new CreativeProfileAdminError("dependency", "private"),
    );
    const failed = createAdminCreativeProfileHandlers({
      getAccess: vi.fn().mockResolvedValue({
        ...access,
        workspaceId: "klique-os",
      }),
      updateProfile,
      invalidateStats,
    });
    expect((await failed.PATCH(
      patchRequest({ status: "inactive" }),
      context(),
    )).status).toBe(500);
    expect(invalidateStats).not.toHaveBeenCalled();
  });

  it.each([
    "id",
    "workspaceId",
    "applicationId",
    "sourceRow",
    "approvedByClerkUserId",
    "approvedAt",
    "createdAt",
    "updatedAt",
    "unknown",
  ])("rejects immutable or unknown field %s", async (field) => {
    const updateProfile = vi.fn();
    const response = await createAdminCreativeProfileHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      updateProfile,
    }).PATCH(patchRequest({ displayName: "Camille", [field]: "forged" }), context());

    expect(response.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { creativeType: "designer" },
    { status: "pending" },
    { displayName: null },
    { coverageAreas: "Vaud" },
    { specialties: [1] },
    [],
    null,
  ])("rejects non-strict PATCH payload %#", async (body) => {
    const updateProfile = vi.fn();
    const response = await createAdminCreativeProfileHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      updateProfile,
    }).PATCH(patchRequest(body), context());

    expect(response.status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("rejects query workspace overrides and invalid creative UUIDs", async () => {
    const updateProfile = vi.fn();
    const handlers = createAdminCreativeProfileHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      updateProfile,
    });

    expect((await handlers.PATCH(
      patchRequest({ status: "inactive" }, "?workspaceId=client"),
      context(),
    )).status).toBe(400);
    expect((await handlers.PATCH(
      patchRequest({ status: "inactive" }),
      context("not-a-uuid"),
    )).status).toBe(400);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("returns 404 for profiles outside the session workspace without leaking details", async () => {
    const updateProfile = vi.fn().mockRejectedValue(
      new CreativeProfileAdminError("not_found", "private other workspace"),
    );
    const response = await createAdminCreativeProfileHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      updateProfile,
    }).PATCH(patchRequest({ status: "inactive" }), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Fiche créative introuvable.",
      code: "not_found",
    });
  });
});
