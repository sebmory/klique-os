import { beforeEach, describe, expect, it, vi } from "vitest";

const getShootingsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/google-sheets", () => ({
  getShootingsFromGoogleSheets: getShootingsMock,
}));

import { resolveConnector } from "@/services/context-intelligence/connectors";
import type { ContextCollectionRequest } from "@/types/context-intelligence";

describe("editorial Productions connector", () => {
  beforeEach(() => {
    process.env.KLIQUE_DEFAULT_WORKSPACE_ID = "workspace-1";
    getShootingsMock.mockReset();
  });

  it("returns an unavailable connector and never demo facts when Sheets fails", async () => {
    getShootingsMock.mockRejectedValue(new Error("Sheets unavailable"));
    const connector = resolveConnector("productions");

    const request = {
      workspaceId: "workspace-1",
      subject: { id: "athlete-1", type: "person", source: "crm", displayName: "Mila Martin" },
      selectedConnectorIds: ["productions"],
      dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      language: "fr",
      contentType: "interview",
    } as ContextCollectionRequest;
    const result = await connector!.collect(request, undefined, {
      workspaceId: "workspace-1",
      clerkUserId: "user-1",
      role: "media",
      mediaId: "11111111-1111-4111-8111-111111111111",
      requestGroupId: "request-1",
    });

    expect(result.status).toBe("unavailable");
    expect(result.items).toEqual([]);
    expect(result.errorCode).toBe("CONNECTOR_NOT_AVAILABLE");
  });

  it("refuses the global Sheet outside the default workspace", async () => {
    const connector = resolveConnector("productions");
    const request = {
      workspaceId: "workspace-2",
      subject: { id: "athlete-1", type: "person", source: "crm", displayName: "Mila Martin" },
      selectedConnectorIds: ["productions"],
      dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      language: "fr",
      contentType: "interview",
    } as ContextCollectionRequest;
    const result = await connector!.collect(request, undefined, {
      workspaceId: "workspace-2",
      clerkUserId: "user-1",
      role: "media",
      mediaId: "11111111-1111-4111-8111-111111111111",
      requestGroupId: "request-1",
    });

    expect(result.status).toBe("unavailable");
    expect(getShootingsMock).not.toHaveBeenCalled();
  });

  it("excludes unpublished planned productions from Media context", async () => {
    getShootingsMock.mockResolvedValue([
      { row: 1, athlete: "Mila Martin", type: "Portrait", date: "2026-10-20", objective: "Campagne secrète", status: "Planifié", published: false },
      { row: 2, athlete: "Mila Martin", type: "Interview", date: "2026-09-10", objective: "Annonce publique", status: "Terminé", published: true },
    ]);
    const connector = resolveConnector("productions");
    const result = await connector!.collect({
      workspaceId: "workspace-1",
      subject: { id: "athlete-1", type: "person", source: "crm", displayName: "Mila Martin" },
      selectedConnectorIds: ["productions"],
      dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
      sourcePreference: "official_and_reliable",
      searchDepth: "standard",
      language: "fr",
      contentType: "interview",
    }, undefined, {
      workspaceId: "workspace-1",
      clerkUserId: "user-1",
      role: "media",
      mediaId: "11111111-1111-4111-8111-111111111111",
      requestGroupId: "request-1",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.metadata.row).toBe(2);
    expect(JSON.stringify(result)).not.toContain("Campagne secrète");
  });
});
