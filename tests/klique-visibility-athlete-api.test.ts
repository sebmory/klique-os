import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAthleteKliqueVisibilityHandlers } from "@/app/api/athlete/klique-visibility/route";

const workspaceId = "workspace-a";
const athleteId = "athlete-1";

const publication = (
  id: string,
  athleteIds: string[],
  network: "instagram" | "tiktok" = "instagram",
) => ({
  id,
  workspaceId,
  format: "photo" as const,
  network,
  publishedAt: "2026-09-01",
  link: `https://example.com/${id}`,
  title: `Publication ${id}`,
  editorialCategory: "photo_gallery" as const,
  origin: "klique_owned" as const,
  publisherName: "KLIQUE",
  externalPostId: id,
  athleteIds,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
});

const snapshot = (
  id: string,
  publicationId: string,
  observedAt: string,
  views: number,
) => ({
  id,
  workspaceId,
  publicationId,
  observedAt,
  views,
  reach: views > 0 ? views - 10 : 0,
  impressions: views + 20,
  source: "manual" as const,
  createdByClerkUserId: "admin-secret",
  createdAt: observedAt,
});

const ownPublicationId = "11111111-1111-4111-8111-111111111111";
const ownPublicationWithoutMetricsId = "22222222-2222-4222-8222-222222222222";
const otherPublicationId = "33333333-3333-4333-8333-333333333333";

const createDependencies = () => ({
  getAccess: vi.fn().mockResolvedValue({
    role: "athlete",
    status: "active",
    workspaceId,
    athleteId,
  }),
  listPublications: vi.fn().mockResolvedValue([
    publication(ownPublicationId, [athleteId, "athlete-2"]),
    publication(ownPublicationWithoutMetricsId, [athleteId], "tiktok"),
    publication(otherPublicationId, ["athlete-2"]),
  ]),
  listHistoryEntries: vi.fn().mockResolvedValue([]),
  listMetricSnapshots: vi.fn().mockImplementation(async (_workspaceId: string, publicationId: string) => {
    if (publicationId !== ownPublicationId) return [];
    return [
      snapshot("metric-old", ownPublicationId, "2026-09-10T10:00:00.000Z", 500),
      snapshot("metric-latest", ownPublicationId, "2026-09-12T10:00:00.000Z", 120),
      snapshot("metric-other", otherPublicationId, "2026-09-12T10:00:00.000Z", 10000),
    ];
  }),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("KLIQUE visibility Athlete audience GET", () => {
  it("filters publications before loading and calculating their latest audience metrics", async () => {
    const dependencies = createDependencies();
    const handlers = createAthleteKliqueVisibilityHandlers(dependencies);
    const response = await handlers.GET(new Request("http://localhost/api/athlete/klique-visibility"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(dependencies.listPublications).toHaveBeenCalledWith(workspaceId);
    expect(dependencies.listMetricSnapshots).toHaveBeenCalledTimes(2);
    expect(dependencies.listMetricSnapshots).not.toHaveBeenCalledWith(workspaceId, otherPublicationId);

    expect(payload.totals).toEqual({ totalTracked: 2, totalHistorical: 0, combinedTotal: 2 });
    expect(payload.publications).toHaveLength(2);
    expect(payload.publications[0]).toMatchObject({
      id: ownPublicationId,
      title: `Publication ${ownPublicationId}`,
      editorialCategory: "photo_gallery",
      audienceTracking: {
        status: "in_progress",
        theoreticalClosingDate: "2026-10-01",
      },
    });
    expect(payload.audienceSummary).toMatchObject({
      totalDetailedContents: 2,
      contentsWithSnapshot: 1,
      coverageRate: 50,
      totalViews: 120,
      mostViewedContent: { publicationId: ownPublicationId, views: 120 },
    });
    expect(payload.latestMetrics).toEqual([{
      publicationId: ownPublicationId,
      observedAt: "2026-09-12T10:00:00.000Z",
      views: 120,
      reach: 110,
      impressions: 140,
    }]);
  });

  it("never exposes workspace, creator, source, or co-tagged athlete identifiers", async () => {
    const handlers = createAthleteKliqueVisibilityHandlers(createDependencies());
    const response = await handlers.GET(new Request("http://localhost/api/athlete/klique-visibility"));
    const payload = await response.json();

    expect(payload.publications[0]).not.toHaveProperty("athleteIds");
    expect(payload.latestMetrics[0]).not.toHaveProperty("workspaceId");
    expect(payload.latestMetrics[0]).not.toHaveProperty("createdByClerkUserId");
    expect(payload.latestMetrics[0]).not.toHaveProperty("source");
    expect(JSON.stringify(payload)).not.toContain("athlete-2");
    expect(JSON.stringify(payload)).not.toContain(otherPublicationId);
  });

  it("preserves access denial and server error responses", async () => {
    const forbiddenDependencies = createDependencies();
    forbiddenDependencies.getAccess.mockResolvedValueOnce({
      role: "athlete",
      status: "active",
      workspaceId,
      athleteId: null,
    });
    const forbidden = createAthleteKliqueVisibilityHandlers(forbiddenDependencies);
    expect((await forbidden.GET(new Request("http://localhost"))).status).toBe(403);

    const failingDependencies = createDependencies();
    failingDependencies.listPublications.mockRejectedValueOnce(new Error("database unavailable"));
    const failing = createAthleteKliqueVisibilityHandlers(failingDependencies);
    expect((await failing.GET(new Request("http://localhost"))).status).toBe(500);
  });
});