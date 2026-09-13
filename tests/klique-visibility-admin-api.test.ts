import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminKliqueVisibilityHandlers } from "@/app/api/admin/klique-visibility/route";
import { KliqueVisibilityError } from "@/lib/klique-visibility";

const publicationId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "workspace-a";
const clerkUserId = "user-admin";

const publication = {
  id: publicationId,
  workspaceId,
  format: "story" as const,
  network: "instagram" as const,
  publishedAt: "2026-09-01",
  link: null,
  title: "Galerie de rentrée",
  editorialCategory: "photo_gallery" as const,
  origin: "klique_owned" as const,
  publisherName: "KLIQUE",
  externalPostId: "post-1",
  athleteIds: ["athlete-1"],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const metricSnapshot = {
  id: "22222222-2222-4222-8222-222222222222",
  workspaceId,
  publicationId,
  observedAt: "2026-09-12T10:00:00.000Z",
  views: 1250,
  reach: 900,
  impressions: 1600,
  source: "manual" as const,
  createdByClerkUserId: clerkUserId,
  createdAt: "2026-09-12T10:01:00.000Z",
};

const overview = {
  trackingSettings: null,
  publications: [publication],
  historyEntries: [],
  totals: {
    totalPublications: 1,
    totalHistorical: 0,
    combinedTotal: 1,
    perAthlete: { "athlete-1": { publications: 1, historical: 0, combined: 1 } },
  },
};

const createDependencies = () => ({
  getAccess: vi.fn().mockResolvedValue({
    clerkUserId,
    role: "admin",
    status: "active",
    workspaceId,
  }),
  getOverview: vi.fn().mockResolvedValue(overview),
  setTrackingStartDate: vi.fn(),
  createPublication: vi.fn().mockResolvedValue(publication),
  createHistoryEntry: vi.fn(),
  createMetricSnapshot: vi.fn().mockResolvedValue(metricSnapshot),
  listMetricSnapshots: vi.fn().mockResolvedValue([metricSnapshot]),
  updatePublication: vi.fn().mockResolvedValue(publication),
  updateClassification: vi.fn().mockResolvedValue(publication),
  deletePublication: vi.fn(),
  updateHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
});

const request = (method: string, body?: Record<string, unknown>) => new Request(
  "http://localhost/api/admin/klique-visibility",
  {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  },
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("KLIQUE visibility Admin audience API", () => {
  it("adds workspace snapshots and their audience summary to GET", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminKliqueVisibilityHandlers(dependencies);
    const response = await handlers.GET(request("GET"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dependencies.getOverview).toHaveBeenCalledWith({ workspaceId });
    expect(dependencies.listMetricSnapshots).toHaveBeenCalledWith({ workspaceId, publicationId });
    expect(payload.publications[0].audienceTracking).toEqual({
      status: "closed",
      theoreticalClosingDate: "2026-09-02",
    });
    expect(payload.metricSnapshots).toEqual([metricSnapshot]);
    expect(payload.audienceSummary).toMatchObject({
      totalDetailedContents: 1,
      contentsWithSnapshot: 1,
      coverageRate: 100,
      totalViews: 1250,
    });
  });

  it("creates a manual snapshot using only workspace and creator from the Clerk session", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminKliqueVisibilityHandlers(dependencies);
    const response = await handlers.POST(request("POST", {
      action: "metric_snapshot",
      publicationId,
      workspaceId: "attacker-workspace",
      createdByClerkUserId: "attacker-user",
      observedAt: "2026-09-12T10:00:00.000Z",
      views: 1250,
      reach: 900,
      impressions: 1600,
      source: "api",
    }));
    expect(response.status).toBe(200);
    expect(dependencies.createMetricSnapshot).toHaveBeenCalledWith({
      workspaceId,
      publicationId,
      createdByClerkUserId: clerkUserId,
      snapshot: {
        observedAt: "2026-09-12T10:00:00.000Z",
        views: 1250,
        reach: 900,
        impressions: 1600,
        source: "manual",
      },
    });
  });

  it("returns 409 when a snapshot already exists at the exact same instant", async () => {
    const dependencies = createDependencies();
    dependencies.createMetricSnapshot.mockRejectedValueOnce({
      code: "23505",
      constraint_name: "klique_visibility_metric_snapshots_workspace_publication_observed_unique",
    });
    const handlers = createAdminKliqueVisibilityHandlers(dependencies);
    const response = await handlers.POST(request("POST", {
      action: "metric_snapshot",
      publicationId,
      observedAt: "2026-09-12T10:00:00.000Z",
      views: 1250,
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Un relevé existe déjà à cette date. Modifiez l’heure de quelques secondes.",
      code: "metric_snapshot_duplicate",
    });
  });

  it("updates classification inside the Clerk workspace and ignores a body workspace", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminKliqueVisibilityHandlers(dependencies);
    const response = await handlers.PATCH(request("PATCH", {
      action: "classification",
      publicationId,
      workspaceId: "attacker-workspace",
      origin: "klique_distributed",
      publisherName: "Partenaire",
      externalPostId: "external-42",
    }));

    expect(response.status).toBe(200);
    expect(dependencies.updateClassification).toHaveBeenCalledWith({
      workspaceId,
      publicationId,
      classification: {
        origin: "klique_distributed",
        publisherName: "Partenaire",
        externalPostId: "external-42",
      },
    });
  });

  it("passes deduplicated collaborator athlete ids through publication POST and PATCH actions", async () => {
    const dependencies = createDependencies();
    const handlers = createAdminKliqueVisibilityHandlers(dependencies);
    const publicationInput = {
      format: "photo",
      network: "instagram",
      publishedAt: "2026-09-01",
      title: "  Galerie de rentrée  ",
      editorialCategory: "photo_gallery",
      athleteIds: ["athlete-1", "athlete-2"],
      collaboratorAthleteIds: ["athlete-2", "athlete-2"],
    };
    const validatedPublicationInput = {
      ...publicationInput,
      title: "Galerie de rentrée",
      link: null,
      collaboratorAthleteIds: ["athlete-2"],
    };

    expect((await handlers.POST(request("POST", {
      action: "create_publication",
      publication: publicationInput,
    }))).status).toBe(200);
    expect(dependencies.createPublication).toHaveBeenCalledWith({ workspaceId, publication: validatedPublicationInput });

    expect((await handlers.PATCH(request("PATCH", {
      action: "update_publication",
      publicationId,
      publication: publicationInput,
    }))).status).toBe(200);
    expect(dependencies.updatePublication).toHaveBeenCalledWith({ workspaceId, publicationId, publication: validatedPublicationInput });
  });

  it.each([
    ["a collaborator outside the publication athletes", {
      network: "instagram",
      athleteIds: ["athlete-1"],
      collaboratorAthleteIds: ["athlete-2"],
    }],
    ["a collaborator outside Instagram", {
      network: "tiktok",
      athleteIds: ["athlete-1"],
      collaboratorAthleteIds: ["athlete-1"],
    }],
  ])("returns 400 for %s when creating or updating a publication", async (_label, collaboratorFields) => {
    const dependencies = createDependencies();
    const handlers = createAdminKliqueVisibilityHandlers(dependencies);
    const invalidPublication = {
      format: "photo",
      publishedAt: "2026-09-01",
      title: "Galerie de rentrée",
      editorialCategory: "photo_gallery",
      ...collaboratorFields,
    };

    const createResponse = await handlers.POST(request("POST", {
      action: "create_publication",
      publication: invalidPublication,
    }));
    const updateResponse = await handlers.PATCH(request("PATCH", {
      action: "update_publication",
      publicationId,
      publication: invalidPublication,
    }));

    expect(createResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(dependencies.createPublication).not.toHaveBeenCalled();
    expect(dependencies.updatePublication).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty title", { title: "   ", editorialCategory: "photo_gallery" }],
    ["an invalid category", { title: "Galerie de rentrée", editorialCategory: "sponsoring" }],
    ["the legacy category", { title: "Galerie de rentrée", editorialCategory: "legacy_unclassified" }],
  ])("returns 400 for %s when creating or updating a publication", async (_label, editorialFields) => {
    const dependencies = createDependencies();
    const handlers = createAdminKliqueVisibilityHandlers(dependencies);
    const invalidPublication = {
      format: "photo",
      network: "instagram",
      publishedAt: "2026-09-01",
      athleteIds: ["athlete-1"],
      ...editorialFields,
    };

    const createResponse = await handlers.POST(request("POST", {
      action: "create_publication",
      publication: invalidPublication,
    }));
    const updateResponse = await handlers.PATCH(request("PATCH", {
      action: "update_publication",
      publicationId,
      publication: invalidPublication,
    }));

    expect(createResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(dependencies.createPublication).not.toHaveBeenCalled();
    expect(dependencies.updatePublication).not.toHaveBeenCalled();
  });

  it("returns 401 without a Clerk identity and 403 for a non-admin session", async () => {
    const unauthenticatedDependencies = createDependencies();
    unauthenticatedDependencies.getAccess.mockResolvedValueOnce(null);
    const unauthenticated = createAdminKliqueVisibilityHandlers(unauthenticatedDependencies);
    expect((await unauthenticated.GET(request("GET"))).status).toBe(401);

    const athleteDependencies = createDependencies();
    athleteDependencies.getAccess.mockResolvedValueOnce({
      clerkUserId: "user-athlete",
      role: "athlete",
      status: "active",
      workspaceId,
    });
    const athlete = createAdminKliqueVisibilityHandlers(athleteDependencies);
    expect((await athlete.GET(request("GET"))).status).toBe(403);
  });

  it("maps invalid input to 400, missing publications to 404, and unexpected failures to 500", async () => {
    const invalidDependencies = createDependencies();
    const invalid = createAdminKliqueVisibilityHandlers(invalidDependencies);
    expect((await invalid.POST(request("POST", {
      action: "metric_snapshot",
      publicationId: "invalid-id",
    }))).status).toBe(400);

    const missingDependencies = createDependencies();
    missingDependencies.createMetricSnapshot.mockRejectedValueOnce(
      new KliqueVisibilityError("publication_not_found", "Publication introuvable."),
    );
    const missing = createAdminKliqueVisibilityHandlers(missingDependencies);
    expect((await missing.POST(request("POST", {
      action: "metric_snapshot",
      publicationId,
      observedAt: "2026-09-12T10:00:00.000Z",
      views: 1,
    }))).status).toBe(404);

    const failingDependencies = createDependencies();
    failingDependencies.getOverview.mockRejectedValueOnce(new Error("database unavailable"));
    const failing = createAdminKliqueVisibilityHandlers(failingDependencies);
    expect((await failing.GET(request("GET"))).status).toBe(500);
  });
});