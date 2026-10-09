import { describe, expect, it, vi } from "vitest";
import {
  createManualCreativeProfileForAdmin,
  CreativeProfileAdminError,
  listCreativeProfilesForAdmin,
  updateCreativeProfileForAdmin,
  type CreativeProfileAdminServiceDependencies,
} from "@/lib/creatives/admin-profile-service";
import { CreativeProfileValidationError } from "@/lib/creatives/repository";
import type { CreativeProfile } from "@/types/creative";

const creativeId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "workspace-session";

const profile = (overrides: Partial<CreativeProfile> = {}): CreativeProfile => ({
  id: creativeId,
  workspaceId,
  provenance: "form_application",
  applicationId,
  displayName: "Camille Martin",
  creativeType: "both",
  contactEmail: "camille@example.com",
  phone: null,
  websiteUrl: null,
  portfolioUrl: "https://portfolio.example.com/",
  instagram: null,
  city: "Lausanne",
  country: "Suisse",
  coverageAreas: ["Vaud"],
  specialties: ["Football"],
  bio: null,
  status: "active",
  sourceRow: 7,
  approvedByClerkUserId: "user-admin",
  approvedAt: "2026-10-09T15:00:00.000Z",
  createdAt: "2026-10-09T15:00:00.000Z",
  updatedAt: "2026-10-09T15:00:00.000Z",
  ...overrides,
});

const dependencies = (
  overrides: Partial<CreativeProfileAdminServiceDependencies> = {},
): CreativeProfileAdminServiceDependencies => ({
  listProfiles: vi.fn().mockResolvedValue([profile()]),
  updateProfile: vi.fn().mockResolvedValue(profile({ status: "inactive" })),
  createManualProfile: vi.fn().mockResolvedValue(profile({
    provenance: "admin_manual",
    applicationId: null,
    sourceRow: null,
  })),
  now: () => new Date("2026-10-09T15:00:00.000Z"),
  ...overrides,
});

describe("creative profile Admin service", () => {
  it("creates an audited manual profile in the explicit workspace", async () => {
    const mocks = dependencies();
    const input = {
      displayName: "Studio Léman",
      creativeType: "photographer" as const,
      contactEmail: "studio@example.com",
      phone: null,
      websiteUrl: null,
      portfolioUrl: null,
      instagram: null,
      city: "Lausanne",
      country: "Suisse",
      coverageAreas: ["Vaud"],
      specialties: ["Football"],
      bio: null,
      status: "active" as const,
    };

    await expect(createManualCreativeProfileForAdmin(
      workspaceId,
      " user-admin ",
      input,
      mocks,
    )).resolves.toMatchObject({
      provenance: "admin_manual",
      applicationId: null,
      sourceRow: null,
    });
    expect(mocks.createManualProfile).toHaveBeenCalledWith(workspaceId, {
      ...input,
      provenance: "admin_manual",
      applicationId: null,
      sourceRow: null,
      approvedByClerkUserId: "user-admin",
      approvedAt: "2026-10-09T15:00:00.000Z",
    });
  });

  it("lists only through the explicit session workspace", async () => {
    const mocks = dependencies();

    await expect(listCreativeProfilesForAdmin(workspaceId, mocks))
      .resolves.toEqual([profile()]);
    expect(mocks.listProfiles).toHaveBeenCalledWith(workspaceId);
  });

  it("updates only by UUID and explicit workspace", async () => {
    const mocks = dependencies();

    await expect(updateCreativeProfileForAdmin(
      workspaceId,
      creativeId,
      { displayName: "Camille Studio", status: "inactive" },
      mocks,
    )).resolves.toMatchObject({ id: creativeId, status: "inactive" });

    expect(mocks.updateProfile).toHaveBeenCalledWith(
      workspaceId,
      creativeId,
      { displayName: "Camille Studio", status: "inactive" },
    );
  });

  it("keeps another workspace invisible and non-modifiable", async () => {
    const mocks = dependencies({
      updateProfile: vi.fn().mockResolvedValue(null),
    });

    await expect(updateCreativeProfileForAdmin(
      "workspace-other",
      creativeId,
      { status: "inactive" },
      mocks,
    )).rejects.toMatchObject({ code: "not_found" });
    expect(mocks.updateProfile).toHaveBeenCalledWith(
      "workspace-other",
      creativeId,
      { status: "inactive" },
    );
  });

  it("rejects invalid UUIDs and empty updates before repository access", async () => {
    const mocks = dependencies();

    await expect(updateCreativeProfileForAdmin(
      workspaceId,
      "not-a-uuid",
      { status: "inactive" },
      mocks,
    )).rejects.toBeInstanceOf(CreativeProfileAdminError);
    await expect(updateCreativeProfileForAdmin(
      workspaceId,
      creativeId,
      {},
      mocks,
    )).rejects.toMatchObject({ code: "validation" });
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("maps repository validation and dependency failures to safe errors", async () => {
    const invalid = dependencies({
      updateProfile: vi.fn().mockRejectedValue(
        new CreativeProfileValidationError("camille@example.com"),
      ),
    });
    await expect(updateCreativeProfileForAdmin(
      workspaceId,
      creativeId,
      { creativeType: "both" },
      invalid,
    )).rejects.toEqual(expect.objectContaining({
      code: "validation",
      message: "Les données de la fiche créative sont invalides.",
    }));

    const failed = dependencies({
      listProfiles: vi.fn().mockRejectedValue(new Error("private database detail")),
    });
    await expect(listCreativeProfilesForAdmin(workspaceId, failed))
      .rejects.toMatchObject({ code: "dependency" });
  });
});
