import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAthlete: vi.fn(),
  requireAdmin: vi.fn(),
  findExisting: vi.fn(),
  create: vi.fn(),
  listOwn: vi.fn(),
  notifyAdmins: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  errorStatus: vi.fn(),
  updateStatus: vi.fn(),
  buildPrefill: vi.fn(),
}));

vi.mock("@/lib/athlete-news-reports/service", () => ({
  requireAthleteNewsIdentity: mocks.requireAthlete,
  requireAthleteNewsAdmin: mocks.requireAdmin,
  athleteNewsErrorStatus: mocks.errorStatus,
  AthleteNewsReportService: {
    findByClientRequestId: mocks.findExisting,
    create: mocks.create,
    listOwn: mocks.listOwn,
    notifyAdmins: mocks.notifyAdmins,
    updateStatus: mocks.updateStatus,
    buildArticlePrefill: mocks.buildPrefill,
  },
}));

vi.mock("@/lib/athlete-news-reports/photo", () => ({
  uploadAthleteNewsPhoto: mocks.upload,
  deleteAthleteNewsPhoto: mocks.remove,
}));

import { GET, POST } from "@/app/api/athlete-news-reports/route";
import {
  GET as GET_ADMIN_REPORT,
  PATCH as PATCH_ADMIN_REPORT,
} from "@/app/api/admin/athlete-news-reports/[reportId]/route";
import { isAthleteAllowedRoute } from "@/proxy";

const identity = {
  workspaceId: "workspace-1",
  clerkUserId: "user-1",
  athleteId: "athlete-1",
};

const report = {
  id: "22222222-2222-4222-8222-222222222222",
  athleteId: "athlete-1",
  message: "Une actualité.",
  eventDate: "2026-10-21",
  externalUrl: null,
  photoHref: null,
  status: "new",
  version: 1,
  createdAt: "2026-10-21T12:00:00.000Z",
  updatedAt: "2026-10-21T12:00:00.000Z",
};

describe("athlete news report routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAthlete.mockResolvedValue(identity);
    mocks.requireAdmin.mockResolvedValue({
      workspaceId: identity.workspaceId,
      clerkUserId: "admin-1",
    });
    mocks.errorStatus.mockReturnValue(500);
  });

  it("allows only the required athlete report methods through the proxy", () => {
    expect(isAthleteAllowedRoute("/api/athlete-news-reports", "GET")).toBe(true);
    expect(isAthleteAllowedRoute("/api/athlete-news-reports", "POST")).toBe(true);
    expect(isAthleteAllowedRoute(`/api/athlete-news-reports/${report.id}/photo`, "GET")).toBe(true);
    expect(isAthleteAllowedRoute("/api/athlete-news-reports", "DELETE")).toBe(false);
    expect(isAthleteAllowedRoute(`/api/athlete-news-reports/${report.id}/photo`, "POST")).toBe(false);
    expect(isAthleteAllowedRoute(`/api/athlete-news-reports/${report.id}`, "GET")).toBe(false);
  });

  it("returns the faithful Article prefill only after Admin access", async () => {
    const prefill = {
      reportId: report.id,
      athleteId: report.athleteId,
      message: report.message,
      eventDate: report.eventDate,
      externalUrl: null,
      photoHref: null,
      provenance: "Déclaration directe de l’athlète — non vérifiée indépendamment.",
    };
    mocks.buildPrefill.mockResolvedValue(prefill);
    const response = await GET_ADMIN_REPORT(
      new Request(`http://localhost/api/admin/athlete-news-reports/${report.id}`) as never,
      { params: Promise.resolve({ reportId: report.id }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, prefill });
  });

  it("returns 409 when an Admin status update uses an old version", async () => {
    mocks.updateStatus.mockRejectedValue(new Error("Le signalement a été modifié."));
    mocks.errorStatus.mockReturnValue(409);
    const response = await PATCH_ADMIN_REPORT(
      new Request(`http://localhost/api/admin/athlete-news-reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "processed", version: 1 }),
      }) as never,
      { params: Promise.resolve({ reportId: report.id }) },
    );
    expect(response.status).toBe(409);
    expect(mocks.updateStatus).toHaveBeenCalledWith(
      report.id,
      "processed",
      1,
      { workspaceId: identity.workspaceId, clerkUserId: "admin-1" },
    );
  });

  it("returns only the authenticated athlete reports", async () => {
    mocks.listOwn.mockResolvedValue([report]);
    const response = await GET(new Request("http://localhost/api/athlete-news-reports"));
    expect(response.status).toBe(200);
    expect(mocks.listOwn).toHaveBeenCalledWith(identity);
    expect(await response.json()).toMatchObject({ reports: [report] });
  });

  it("does not upload or create twice when the idempotency key already exists", async () => {
    mocks.findExisting.mockResolvedValue(report);
    const form = new FormData();
    form.set("clientRequestId", "33333333-3333-4333-8333-333333333333");
    form.set("message", report.message);
    form.set("eventDate", report.eventDate);
    const response = await POST(new Request("http://localhost/api/athlete-news-reports", {
      method: "POST",
      body: form,
    }));
    expect(response.status).toBe(200);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(report, identity);
  });

  it("rejects a request when server-derived athlete access is missing", async () => {
    mocks.requireAthlete.mockRejectedValue(new Error("Un accès Athlète actif est requis."));
    mocks.errorStatus.mockReturnValue(403);
    const response = await GET(new Request("http://localhost/api/athlete-news-reports"));
    expect(response.status).toBe(403);
    expect(mocks.listOwn).not.toHaveBeenCalled();
  });
});
