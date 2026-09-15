import { beforeEach, describe, expect, it, vi } from "vitest";

const { createContentStorageClientMock, getCurrentUserAccessProfileMock, sqlMock, transactionMock } = vi.hoisted(() => {
  const transaction = vi.fn();
  const sql = Object.assign(vi.fn(), { transaction });
  return {
    createContentStorageClientMock: vi.fn(() => sql),
    getCurrentUserAccessProfileMock: vi.fn(),
    sqlMock: sql,
    transactionMock: transaction,
  };
});

vi.mock("@/lib/clerk-access/service", () => ({
  getCurrentUserAccessProfile: getCurrentUserAccessProfileMock,
}));

vi.mock("@/lib/content-storage/db", () => ({
  createContentStorageClient: createContentStorageClientMock,
}));

import {
  ClubAdminConflictError,
  ClubAdminForbiddenError,
  ClubAdminValidationError,
  listProvisionedClubs,
  provisionClub,
  type ClubAdminRepository,
  type ClubProvisionRecord,
} from "@/lib/clubs/admin-service";

const request = new Request("http://localhost/admin/clubs");
const teamId = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";

const createdRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  workspace_id: "elfic-fribourg",
  workspace_name: "Elfic Fribourg",
  workspace_status: "active",
  workspace_created_at: "2026-09-15T08:00:00.000Z",
  workspace_updated_at: "2026-09-15T08:00:00.000Z",
  profile_created_at: "2026-09-15T08:00:00.000Z",
  team_id: teamId,
  team_name: "Equipe premiere",
  team_season: "2026-2027",
  team_status: "active",
  team_created_at: "2026-09-15T08:00:00.000Z",
  team_updated_at: "2026-09-15T08:00:00.000Z",
  ...overrides,
});

const createRepository = (overrides: Partial<ClubAdminRepository> = {}) => {
  const records: ClubProvisionRecord[] = [];
  const repository: ClubAdminRepository = {
    createAtomic: vi.fn(async (record) => {
      records.push(record);
      return createdRow({
        workspace_id: record.workspaceId,
        workspace_name: record.clubName,
        team_id: record.teamId,
        team_name: record.teamName,
        team_season: record.season,
      });
    }),
    list: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return { repository, records };
};

const asActiveAdmin = () => {
  getCurrentUserAccessProfileMock.mockResolvedValue({
    clerkUser: { id: "user_admin", email: "admin@example.test" },
    userAccess: {
      clerkUserId: "user_admin",
      role: "admin",
      status: "active",
      workspaceId: "klique-os",
    },
  });
};

describe("Club Admin service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asActiveAdmin();
  });

  it("accepts and normalizes Elfic Fribourg without provisioning it implicitly", async () => {
    const { repository, records } = createRepository();

    const club = await provisionClub(request, {
      workspaceId: " ELFIC-FRIBOURG ",
      clubName: "  Elfic   Fribourg ",
      teamName: "  Equipe   premiere ",
      season: " 2026-2027 ",
    }, repository);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      workspaceId: "elfic-fribourg",
      clubName: "Elfic Fribourg",
      teamName: "Equipe premiere",
      season: "2026-2027",
    });
    expect(records[0].teamId).toMatch(/^[0-9a-f-]{36}$/);
    expect(club.workspaceId).toBe("elfic-fribourg");
    expect(club.teamCount).toBe(1);
  });

  it("creates the workspace, profile and initial team in one serializable transaction", async () => {
    sqlMock.mockImplementation((strings: TemplateStringsArray) => ({ text: strings.join("?") }));
    transactionMock.mockResolvedValue([[createdRow()]]);

    await provisionClub(request, {
      workspaceId: "elfic-fribourg",
      clubName: "Elfic Fribourg",
      teamName: "Equipe premiere",
      season: "2026-2027",
    });

    expect(transactionMock).toHaveBeenCalledOnce();
    const [queries, options] = transactionMock.mock.calls[0];
    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain("WITH created_workspace AS");
    expect(queries[0].text).toContain("created_profile AS");
    expect(queries[0].text).toContain("created_team AS");
    expect(options).toEqual({ isolationLevel: "Serializable" });
  });

  it("derives Admin identity from the request and ignores extra client identity fields", async () => {
    const { repository } = createRepository();
    const input = {
      workspaceId: "new-club",
      clubName: "Nouveau Club",
      teamName: "Equipe premiere",
      season: "2026-2027",
      adminWorkspaceId: "forged-workspace",
      clerkUserId: "forged-user",
    };

    await provisionClub(request, input, repository);

    expect(getCurrentUserAccessProfileMock).toHaveBeenCalledWith(request);
    expect(repository.createAtomic).toHaveBeenCalledOnce();
    expect(repository.createAtomic).toHaveBeenCalledWith(expect.not.objectContaining({
      adminWorkspaceId: "forged-workspace",
      clerkUserId: "forged-user",
    }));
  });

  it.each([
    ["missing identity", null],
    ["inactive Admin", { clerkUser: { id: "user_admin" }, userAccess: { role: "admin", status: "disabled", workspaceId: "klique-os" } }],
    ["non Admin", { clerkUser: { id: "user_media" }, userAccess: { role: "media", status: "active", workspaceId: "klique-os" } }],
  ])("rejects %s before repository access", async (_label, profile) => {
    getCurrentUserAccessProfileMock.mockResolvedValue(profile);
    const { repository } = createRepository();

    await expect(provisionClub(request, {
      workspaceId: "elfic-fribourg",
      clubName: "Elfic Fribourg",
      teamName: "Equipe premiere",
      season: "2026-2027",
    }, repository)).rejects.toBeInstanceOf(ClubAdminForbiddenError);
    expect(repository.createAtomic).not.toHaveBeenCalled();
  });

  it.each([
    ["workspaceId vide", { workspaceId: " ", clubName: "Club", teamName: "Equipe", season: "2026-2027" }],
    ["workspaceId invalide", { workspaceId: "club suisse", clubName: "Club", teamName: "Equipe", season: "2026-2027" }],
    ["nom vide", { workspaceId: "club", clubName: " ", teamName: "Equipe", season: "2026-2027" }],
    ["equipe vide", { workspaceId: "club", clubName: "Club", teamName: " ", season: "2026-2027" }],
    ["saison vide", { workspaceId: "club", clubName: "Club", teamName: "Equipe", season: " " }],
  ])("rejects invalid input: %s", async (_label, input) => {
    const { repository } = createRepository();

    await expect(provisionClub(request, input, repository)).rejects.toBeInstanceOf(ClubAdminValidationError);
    expect(repository.createAtomic).not.toHaveBeenCalled();
  });

  it.each([
    ["existing identifier or name", vi.fn().mockResolvedValue(null)],
    ["database uniqueness violation", vi.fn().mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }))],
    ["concurrent serializable conflict", vi.fn().mockRejectedValue(Object.assign(new Error("serialization"), { code: "40001" }))],
  ])("returns a conflict for %s", async (_label, createAtomic) => {
    const { repository } = createRepository({ createAtomic });

    await expect(provisionClub(request, {
      workspaceId: "elfic-fribourg",
      clubName: "Elfic Fribourg",
      teamName: "Equipe premiere",
      season: "2026-2027",
    }, repository)).rejects.toBeInstanceOf(ClubAdminConflictError);
  });

  it("lists only normalized provisioned club rows after Admin authorization", async () => {
    const { repository } = createRepository({
      list: vi.fn().mockResolvedValue([{
        workspace_id: "club-a",
        workspace_name: " Club A ",
        workspace_status: "active",
        workspace_created_at: new Date("2026-09-15T08:00:00.000Z"),
        workspace_updated_at: "2026-09-15T10:00:00+02:00",
        team_count: "2",
      }]),
    });

    await expect(listProvisionedClubs(request, repository)).resolves.toEqual([{
      workspaceId: "club-a",
      name: "Club A",
      status: "active",
      createdAt: "2026-09-15T08:00:00.000Z",
      updatedAt: "2026-09-15T08:00:00.000Z",
      teamCount: 2,
    }]);
  });
});