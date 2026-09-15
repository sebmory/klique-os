import { describe, expect, it, vi } from "vitest";
import {
  MediaOrganizationConflictError,
  MediaOrganizationNotFoundError,
  MediaOrganizationValidationError,
  createMediaOrganization,
  getActiveMediaOrganization,
  linkExistingMediaAccess,
  listMediaOrganizations,
  type MediaOrganizationAccessLinkRepository,
  type MediaOrganizationCreateRecord,
  type MediaOrganizationRepository,
} from "@/lib/media-organizations/service";

const organizationId = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";

const neonRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: organizationId,
  workspace_id: "workspace-1",
  name: "Le Journal",
  type: "media_outlet",
  contact_email: "redaction@journal.example",
  website: "https://journal.example/",
  status: "active",
  created_at: new Date("2026-09-15T08:00:00.000Z"),
  updated_at: "2026-09-15T09:30:00+02:00",
  ...overrides,
});

const createRepository = (overrides: Partial<MediaOrganizationRepository> = {}) => {
  const createdRecords: MediaOrganizationCreateRecord[] = [];
  const repository: MediaOrganizationRepository = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(async (record) => {
      createdRecords.push(record);
      return neonRow({
        id: record.id,
        workspace_id: record.workspaceId,
        name: record.name,
        type: record.type,
        contact_email: record.contactEmail,
        website: record.website,
        status: record.status,
      });
    }),
    getActive: vi.fn().mockResolvedValue(null),
    ...overrides,
  };

  return { repository, createdRecords };
};

const validInput = {
  name: "Le Journal",
  type: "media_outlet",
  contactEmail: "redaction@journal.example",
  website: "https://journal.example",
  status: "active",
};

const linkRepository = (
  overrides: Partial<Awaited<ReturnType<MediaOrganizationAccessLinkRepository["linkExisting"]>>> = {},
): MediaOrganizationAccessLinkRepository => ({
  linkExisting: vi.fn().mockResolvedValue({
    organizationRows: [{ id: organizationId }],
    accessRows: [{ clerk_user_id: "user-media", media_id: null }],
    pendingInvitationRows: [],
    updatedAccessRows: [{ clerk_user_id: "user-media" }],
    updatedInvitationRows: [{ id: "invitation-1" }],
    ...overrides,
  }),
});

describe("media organizations service", () => {
  it("lists organizations in the normalized workspace and returns ISO dates", async () => {
    const { repository } = createRepository({
      list: vi.fn().mockResolvedValue([neonRow()]),
    });

    const organizations = await listMediaOrganizations(" workspace-1 ", repository);

    expect(repository.list).toHaveBeenCalledWith("workspace-1");
    expect(organizations).toEqual([{
      id: organizationId,
      workspaceId: "workspace-1",
      name: "Le Journal",
      type: "media_outlet",
      contactEmail: "redaction@journal.example",
      website: "https://journal.example/",
      status: "active",
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T07:30:00.000Z",
    }]);
  });

  it("normalizes create input and defaults the status to active", async () => {
    const { repository, createdRecords } = createRepository();

    const organization = await createMediaOrganization(" workspace-1 ", {
      name: "  Le   Journal  ",
      type: " MEDIA_OUTLET ",
      contactEmail: " REDACTION@JOURNAL.EXAMPLE ",
      website: " https://journal.example ",
    }, repository);

    expect(createdRecords).toHaveLength(1);
    expect(createdRecords[0]).toMatchObject({
      workspaceId: "workspace-1",
      name: "Le Journal",
      type: "media_outlet",
      contactEmail: "redaction@journal.example",
      website: "https://journal.example/",
      status: "active",
    });
    expect(createdRecords[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(organization.createdAt).toBe("2026-09-15T08:00:00.000Z");
  });

  it.each([
    ["workspace", " ", validInput],
    ["name", "workspace-1", { ...validInput, name: " " }],
    ["type", "workspace-1", { ...validInput, type: "publisher" }],
    ["contactEmail", "workspace-1", { ...validInput, contactEmail: "invalid" }],
    ["website vide", "workspace-1", { ...validInput, website: " " }],
    ["website", "workspace-1", { ...validInput, website: "ftp://journal.example" }],
    ["status", "workspace-1", { ...validInput, status: "pending" }],
  ])("rejects invalid %s values", async (_field, workspaceId, input) => {
    const { repository } = createRepository();

    await expect(createMediaOrganization(workspaceId, input, repository)).rejects.toMatchObject({
      code: "validation",
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("scopes the active lookup to the normalized workspace and media id", async () => {
    const { repository } = createRepository({
      getActive: vi.fn().mockResolvedValue(neonRow()),
    });

    const organization = await getActiveMediaOrganization(
      " workspace-1 ",
      ` ${organizationId.toUpperCase()} `,
      repository,
    );

    expect(repository.getActive).toHaveBeenCalledWith("workspace-1", organizationId);
    expect(organization.id).toBe(organizationId);
    expect(organization.status).toBe("active");
  });

  it("returns a typed not_found error when no active organization matches", async () => {
    const { repository } = createRepository();

    await expect(
      getActiveMediaOrganization("workspace-1", organizationId, repository),
    ).rejects.toBeInstanceOf(MediaOrganizationNotFoundError);
    await expect(
      getActiveMediaOrganization("workspace-1", organizationId, repository),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it.each([
    Object.assign(new Error("duplicate key"), { code: "23505" }),
    Object.assign(new Error("Neon query failed"), {
      cause: Object.assign(new Error("duplicate key"), { code: "23505" }),
    }),
  ])("maps Neon uniqueness violations to a typed conflict error", async (neonError) => {
    const { repository } = createRepository({
      create: vi.fn().mockRejectedValue(neonError),
    });

    await expect(
      createMediaOrganization("workspace-1", validInput, repository),
    ).rejects.toBeInstanceOf(MediaOrganizationConflictError);
    await expect(
      createMediaOrganization("workspace-1", validInput, repository),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("keeps validation errors typed", async () => {
    const { repository } = createRepository();

    await expect(
      getActiveMediaOrganization("workspace-1", "not-a-uuid", repository),
    ).rejects.toBeInstanceOf(MediaOrganizationValidationError);
  });
});

describe("existing media access linking", () => {
  it("normalizes inputs and returns the individual author with the linked organization", async () => {
    const repository = linkRepository();

    const result = await linkExistingMediaAccess(
      " workspace-1 ",
      { mediaId: ` ${organizationId.toUpperCase()} `, email: " Reporter@Journal.Example " },
      repository,
    );

    expect(repository.linkExisting).toHaveBeenCalledWith(
      "workspace-1",
      organizationId,
      "reporter@journal.example",
    );
    expect(result).toEqual({
      clerkUserId: "user-media",
      mediaId: organizationId,
      email: "reporter@journal.example",
      linkedInvitationCount: 1,
    });
  });

  it("does not overwrite an access linked to another organization", async () => {
    const repository = linkRepository({
      accessRows: [{ clerk_user_id: "user-media", media_id: "927f53ef-6d5e-46cc-8891-411bd904f4fc" }],
      updatedAccessRows: [],
      updatedInvitationRows: [],
    });

    await expect(linkExistingMediaAccess("workspace-1", {
      mediaId: organizationId,
      email: "reporter@journal.example",
    }, repository)).rejects.toMatchObject({ code: "conflict" });
  });

  it("asks for a new linked invitation when only an old pending invitation exists", async () => {
    const repository = linkRepository({
      accessRows: [],
      pendingInvitationRows: [{ id: "legacy-invitation" }],
      updatedAccessRows: [],
      updatedInvitationRows: [],
    });

    await expect(linkExistingMediaAccess("workspace-1", {
      mediaId: organizationId,
      email: "legacy@journal.example",
    }, repository)).rejects.toMatchObject({
      code: "invitation_pending",
      message: "Une invitation ancienne est encore en attente. Envoyez une nouvelle invitation liée à l’organisation.",
    });
  });

  it("rejects an inactive organization and an unknown active access", async () => {
    await expect(linkExistingMediaAccess("workspace-1", {
      mediaId: organizationId,
      email: "reporter@journal.example",
    }, linkRepository({ organizationRows: [], updatedAccessRows: [], updatedInvitationRows: [] })))
      .rejects.toMatchObject({ code: "not_found" });

    await expect(linkExistingMediaAccess("workspace-1", {
      mediaId: organizationId,
      email: "unknown@journal.example",
    }, linkRepository({ accessRows: [], updatedAccessRows: [], updatedInvitationRows: [] })))
      .rejects.toMatchObject({ code: "not_found" });
  });
});