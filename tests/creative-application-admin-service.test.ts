import { describe, expect, it, vi } from "vitest";
import {
  approveCreativeApplication,
  CreativeApplicationAdminError,
  listCreativeApplicationsForAdmin,
  rejectCreativeApplication,
  type CreativeApplicationAdminServiceDependencies,
} from "@/lib/creatives/admin-application-service";
import type { CreativeApplication } from "@/lib/creatives/applications-sheet";
import type { CreativeProfile } from "@/types/creative";

const applicationId = "11111111-1111-4111-8111-111111111111";
const creativeId = "22222222-2222-4222-8222-222222222222";
const otherCreativeId = "33333333-3333-4333-8333-333333333333";
const workspaceId = "workspace-session";
const adminId = "user-admin";
const approvedAt = "2026-10-09T15:00:00.000Z";
const applicationVersion = `v1:${"a".repeat(64)}`;

const applicationFields: CreativeApplication["fields"] = {
  submittedAt: "2026-10-01 10:00:00",
  fullName: "Camille Martin",
  email: "camille@example.com",
  phone: "+41 79 000 00 00",
  birthYear: "1995",
  city: "Lausanne",
  region: "Vaud",
  languages: "Français",
  profile: "Photographe et vidéaste",
  experienceLevel: "Confirmé",
  practiceDuration: "5 ans",
  background: "Parcours créatif",
  sportsExperience: "Oui",
  previousProjectTypes: "Football",
  portfolioUrl: "portfolio.example.com",
  websiteUrl: "https://example.com",
  instagram: "@camille",
  otherReferences: "",
  sportsToCover: "Football, Basketball",
  interestedMissionTypes: "Reportage",
  accreditationsOrContacts: "Non",
  accreditationDetails: "",
  travelRegions: "Vaud; Fribourg",
  drivingLicense: "Oui",
  vehicleAccess: "Oui",
  usualAvailability: "Week-end",
  missionNotice: "48 heures",
  equipment: "Boîtier",
  software: "Lightroom",
  handlesPostproduction: "Oui",
  fastDelivery: "Oui",
  liabilityInsurance: "Oui",
  motivation: "Rejoindre le réseau",
  collaborationExpectations: "Collaborer",
  availableForUnpaid: "Non",
  interestedInPaidMandates: "Oui",
  interestedInPartTime: "Non",
  canInvoice: "Oui",
  specialConditions: "",
  missionCommitment: "Accepté",
  currentCollaborationNature: "Ponctuelle",
  contentUsage: "Accepté",
  dataProtection: "Accepté",
  contactAuthorization: "Accepté",
  additionalNotes: "",
};

const application = (
  overrides: Partial<CreativeApplication> = {},
): CreativeApplication => ({
  applicationId,
  version: applicationVersion,
  sourceRow: 7,
  fields: applicationFields,
  moderationStatus: "pending",
  creativeId: null,
  moderatedAt: null,
  moderatedBy: null,
  moderationNotes: null,
  ...overrides,
});

const profile = (overrides: Partial<CreativeProfile> = {}): CreativeProfile => ({
  id: creativeId,
  workspaceId,
  provenance: "form_application",
  applicationId,
  displayName: applicationFields.fullName,
  creativeType: "both",
  contactEmail: applicationFields.email,
  phone: applicationFields.phone,
  websiteUrl: "https://example.com/",
  portfolioUrl: "https://portfolio.example.com/",
  instagram: applicationFields.instagram,
  city: applicationFields.city,
  country: null,
  coverageAreas: ["Vaud", "Fribourg"],
  specialties: ["Football", "Basketball"],
  bio: applicationFields.background,
  status: "active",
  sourceRow: 7,
  approvedByClerkUserId: adminId,
  approvedAt,
  createdAt: approvedAt,
  updatedAt: approvedAt,
  ...overrides,
});

const dependencies = (
  overrides: Partial<CreativeApplicationAdminServiceDependencies> = {},
): CreativeApplicationAdminServiceDependencies => ({
  listApplications: vi.fn().mockResolvedValue([application()]),
  findApplication: vi.fn().mockResolvedValue(application()),
  updateModeration: vi.fn().mockImplementation(async (
    id: string,
    input: {
      status: "pending" | "approved" | "rejected";
      creativeId?: string | null;
      moderatedAt?: string | null;
      moderatedBy?: string | null;
      notes?: string | null;
    },
  ) => application({
    applicationId: id,
    moderationStatus: input.status,
    creativeId: input.creativeId ?? null,
    moderatedAt: input.moderatedAt ?? null,
    moderatedBy: input.moderatedBy ?? null,
    moderationNotes: input.notes ?? null,
  })),
  createProfile: vi.fn().mockResolvedValue(profile()),
  getProfileById: vi.fn().mockResolvedValue(profile()),
  listProfilesByApplicationIds: vi.fn().mockResolvedValue([]),
  now: () => new Date(approvedAt),
  ...overrides,
});

const approveWith = (
  mocks: CreativeApplicationAdminServiceDependencies,
  id = applicationId,
  version = applicationVersion,
) => approveCreativeApplication(workspaceId, id, adminId, version, mocks);

const rejectWith = (
  mocks: CreativeApplicationAdminServiceDependencies,
  reason: string,
  version = applicationVersion,
) => rejectCreativeApplication(
  workspaceId,
  applicationId,
  adminId,
  reason,
  version,
  mocks,
);

describe("creative application Admin service", () => {
  it("lists applications without logging or exposing dependency failures", async () => {
    const mocks = dependencies();
    await expect(listCreativeApplicationsForAdmin(workspaceId, mocks))
      .resolves.toEqual([application()]);

    const failed = dependencies({
      listApplications: vi.fn().mockRejectedValue(new Error("camille@example.com")),
    });
    await expect(listCreativeApplicationsForAdmin(workspaceId, failed)).rejects.toMatchObject({
      code: "dependency",
      message: "Le traitement de la candidature n’a pas pu aboutir.",
    });
  });

  it("approves by UUID, creates in the explicit workspace, then audits Sheets", async () => {
    const mocks = dependencies();

    const result = await approveWith(mocks);

    expect(result).toEqual({
      profile: profile(),
      application: application({
        moderationStatus: "approved",
        creativeId,
        moderatedAt: approvedAt,
        moderatedBy: adminId,
      }),
      alreadyApproved: false,
      sheetSynchronized: true,
    });
    expect(mocks.createProfile).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        provenance: "form_application",
        applicationId,
        displayName: applicationFields.fullName,
        creativeType: "both",
        contactEmail: applicationFields.email,
        portfolioUrl: "https://portfolio.example.com/",
        coverageAreas: ["Vaud", "Fribourg"],
        specialties: ["Football", "Basketball"],
        status: "active",
        sourceRow: 7,
        approvedByClerkUserId: adminId,
        approvedAt,
      }),
    );
    expect(mocks.updateModeration).toHaveBeenCalledWith(applicationId, {
      status: "approved",
      creativeId,
      moderatedAt: approvedAt,
      moderatedBy: adminId,
      notes: null,
    });
  });

  it("approves a historical Forms application while discarding invalid optional URLs", async () => {
    const historical = application({
      fields: {
        ...applicationFields,
        portfolioUrl: "Mon portfolio est disponible sur demande",
        websiteUrl: "",
        additionalNotes: "",
      },
    });
    const mocks = dependencies({
      findApplication: vi.fn().mockResolvedValue(historical),
    });

    await expect(approveWith(mocks)).resolves.toMatchObject({
      alreadyApproved: false,
      sheetSynchronized: true,
    });

    expect(mocks.createProfile).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        provenance: "form_application",
        applicationId,
        sourceRow: 7,
        portfolioUrl: null,
        websiteUrl: null,
      }),
    );
    expect(historical.fields.portfolioUrl)
      .toBe("Mon portfolio est disponible sur demande");
  });

  it("reports the exact required legacy field without mutating storage", async () => {
    const missingEmail = application({
      fields: { ...applicationFields, email: "" },
    });
    const mocks = dependencies({
      findApplication: vi.fn().mockResolvedValue(missingEmail),
    });

    await expect(approveWith(mocks)).rejects.toMatchObject({
      code: "missing_required_field",
      field: "email",
    });
    expect(mocks.createProfile).not.toHaveBeenCalled();
    expect(mocks.updateModeration).not.toHaveBeenCalled();
  });

  it("rejects a stale optimistic version before creating a profile", async () => {
    const mocks = dependencies();

    await expect(approveWith(mocks, applicationId, `v1:${"b".repeat(64)}`))
      .rejects.toMatchObject({ code: "version_conflict" });
    expect(mocks.createProfile).not.toHaveBeenCalled();
    expect(mocks.updateModeration).not.toHaveBeenCalled();
  });

  it("projects a canonical profile as approved when the Sheets mirror is still pending", async () => {
    const pending = application();
    const mocks = dependencies({
      listApplications: vi.fn().mockResolvedValue([pending]),
      listProfilesByApplicationIds: vi.fn().mockResolvedValue([profile()]),
    });

    await expect(listCreativeApplicationsForAdmin(workspaceId, mocks))
      .resolves.toEqual([
        expect.objectContaining({
          applicationId,
          moderationStatus: "approved",
          creativeId,
          moderatedAt: approvedAt,
          moderatedBy: adminId,
        }),
      ]);
    expect(mocks.listProfilesByApplicationIds).toHaveBeenCalledWith(
      workspaceId,
      [applicationId],
    );
  });

  it("does not write Sheets when canonical profile creation fails", async () => {
    const mocks = dependencies({
      createProfile: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });

    await expect(approveWith(mocks)).rejects.toMatchObject({ code: "dependency" });
    expect(mocks.updateModeration).not.toHaveBeenCalled();
  });

  it("reuses the same canonical profile after a Sheets failure", async () => {
    const sharedProfile = profile();
    const updateModeration = vi.fn()
      .mockRejectedValueOnce(new Error("Google unavailable"))
      .mockResolvedValueOnce(application({
        moderationStatus: "approved",
        creativeId,
      }));
    const mocks = dependencies({
      createProfile: vi.fn().mockResolvedValue(sharedProfile),
      updateModeration,
    });

    await expect(approveWith(mocks)).resolves.toMatchObject({
      profile: sharedProfile,
      application: {
        moderationStatus: "approved",
        creativeId,
      },
      alreadyApproved: false,
      sheetSynchronized: false,
    });
    await expect(approveWith(mocks)).resolves.toMatchObject({
      profile: sharedProfile,
      alreadyApproved: false,
      sheetSynchronized: true,
    });

    expect(mocks.createProfile).toHaveBeenCalledTimes(2);
    expect(updateModeration).toHaveBeenCalledTimes(2);
    expect(updateModeration.mock.calls[0][1].creativeId).toBe(creativeId);
    expect(updateModeration.mock.calls[1][1].creativeId).toBe(creativeId);
  });

  it("replays an already approved application only when its canonical link is coherent", async () => {
    const approved = application({ moderationStatus: "approved", creativeId });
    const mocks = dependencies({ findApplication: vi.fn().mockResolvedValue(approved) });

    await expect(approveWith(mocks)).resolves.toEqual({
      profile: profile(),
      application: approved,
      alreadyApproved: true,
      sheetSynchronized: true,
    });
    expect(mocks.createProfile).not.toHaveBeenCalled();
    expect(mocks.updateModeration).not.toHaveBeenCalled();

    const conflict = dependencies({
      findApplication: vi.fn().mockResolvedValue(approved),
      getProfileById: vi.fn().mockResolvedValue(profile({ applicationId: otherCreativeId })),
    });
    await expect(approveWith(conflict))
      .rejects.toMatchObject({ code: "conflict" });
  });

  it("accepts a concurrent approval only for the same canonical profile", async () => {
    const coherent = dependencies({
      findApplication: vi.fn()
        .mockResolvedValueOnce(application())
        .mockResolvedValueOnce(application())
        .mockResolvedValueOnce(application({ moderationStatus: "approved", creativeId })),
    });
    await expect(approveWith(coherent)).resolves.toMatchObject({
      profile: profile(),
      alreadyApproved: true,
      sheetSynchronized: true,
    });
    expect(coherent.updateModeration).not.toHaveBeenCalled();

    const conflict = dependencies({
      findApplication: vi.fn()
        .mockResolvedValueOnce(application())
        .mockResolvedValueOnce(application())
        .mockResolvedValueOnce(application({
          moderationStatus: "approved",
          creativeId: otherCreativeId,
        })),
    });
    await expect(approveWith(conflict))
      .rejects.toMatchObject({ code: "conflict" });
  });

  it("rejects invalid IDs and incompatible application states without side effects", async () => {
    for (const current of [
      application({ moderationStatus: "rejected", moderationNotes: "Incomplet" }),
      application({ creativeId }),
    ]) {
      const mocks = dependencies({ findApplication: vi.fn().mockResolvedValue(current) });
      await expect(approveWith(mocks))
        .rejects.toBeInstanceOf(CreativeApplicationAdminError);
      expect(mocks.createProfile).not.toHaveBeenCalled();
      expect(mocks.updateModeration).not.toHaveBeenCalled();
    }

    const invalid = dependencies();
    await expect(approveWith(invalid, "not-a-uuid"))
      .rejects.toMatchObject({ code: "validation" });
    expect(invalid.findApplication).not.toHaveBeenCalled();
  });

  it("rejects with a required reason and never creates a canonical profile", async () => {
    const mocks = dependencies();

    const result = await rejectWith(mocks, "  Portfolio insuffisant  ");

    expect(result.alreadyRejected).toBe(false);
    expect(mocks.updateModeration).toHaveBeenCalledWith(applicationId, {
      status: "rejected",
      creativeId: null,
      moderatedAt: approvedAt,
      moderatedBy: adminId,
      notes: "Portfolio insuffisant",
    });
    expect(mocks.createProfile).not.toHaveBeenCalled();
  });

  it("refuses approved applications and empty rejection reasons", async () => {
    const approvedMocks = dependencies({
      findApplication: vi.fn().mockResolvedValue(
        application({ moderationStatus: "approved", creativeId }),
      ),
    });
    await expect(rejectWith(approvedMocks, "Motif"))
      .rejects.toMatchObject({ code: "conflict" });
    expect(approvedMocks.updateModeration).not.toHaveBeenCalled();

    const emptyReasonMocks = dependencies();
    await expect(rejectWith(emptyReasonMocks, " "))
      .rejects.toMatchObject({ code: "validation" });
    expect(emptyReasonMocks.findApplication).not.toHaveBeenCalled();
  });

  it("replays the same rejection and conflicts on a different decision", async () => {
    const rejected = application({
      moderationStatus: "rejected",
      moderationNotes: "Portfolio insuffisant",
      moderatedBy: adminId,
      moderatedAt: approvedAt,
    });
    const same = dependencies({ findApplication: vi.fn().mockResolvedValue(rejected) });
    await expect(rejectWith(same, "Portfolio insuffisant"))
      .resolves.toEqual({ application: rejected, alreadyRejected: true });
    expect(same.updateModeration).not.toHaveBeenCalled();
    expect(same.createProfile).not.toHaveBeenCalled();

    const different = dependencies({ findApplication: vi.fn().mockResolvedValue(rejected) });
    await expect(rejectWith(different, "Autre motif"))
      .rejects.toMatchObject({ code: "conflict" });
  });
});
