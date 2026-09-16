import { describe, expect, it } from "vitest";
import {
  isAthleteAllowedRoute,
  isHiddenExternalAthleteProfileRoute,
  isMediaAllowedApi,
  isMediaAllowedRoute,
} from "@/proxy";

describe("media desk proxy access", () => {
  it.each([
    "/media-desk",
    "/media-desk/subject-1",
    "/contents",
    "/contents/create",
    "/contents/create/result",
    "/media/athletes",
    "/media/athletes/athlete-1",
  ])("allows the media page %s", (pathname) => {
    expect(isMediaAllowedRoute(pathname)).toBe(true);
  });

  it.each([
    "/crm",
    "/hub",
    "/settings",
    "/media-deskoups",
    "/media-desk/subject-1/edit",
    "/contents/archive",
    "/contents/create/result/extra",
    "/media/athletes/athlete-1/private",
    "/media/athletes-admin",
  ])("denies the media page %s", (pathname) => {
    expect(isMediaAllowedRoute(pathname)).toBe(false);
  });

  it.each([
    ["/api/clerk/access", "GET"],
    ["/api/notifications", "GET"],
    ["/api/notifications", "PATCH"],
    ["/api/media-subjects", "GET"],
    ["/api/media-subjects/subject-1", "GET"],
    ["/api/media-requests", "GET"],
    ["/api/media-requests", "POST"],
    ["/api/media-bank", "GET"],
    ["/api/ai-credits/balance", "GET"],
    ["/api/media-subscriptions", "GET"],
    ["/api/media/athletes", "GET"],
    ["/api/media/athletes/athlete-1", "GET"],
    ["/api/content/generate", "POST"],
    ["/api/context/collect", "POST"],
    ["/api/contents/generate/article", "POST"],
    ["/api/contents/storage/drafts", "GET"],
    ["/api/contents/storage/drafts", "POST"],
    ["/api/contents/storage/drafts/draft-1", "GET"],
    ["/api/contents/storage/drafts/draft-1", "PATCH"],
    ["/api/contents/storage/variants", "GET"],
    ["/api/contents/storage/variants", "POST"],
    ["/api/contents/storage/variants/variant-1", "GET"],
    ["/api/contents/storage/sessions", "POST"],
    ["/api/contents/storage/sessions/session-1", "GET"],
  ])("allows the media API %s with %s", (pathname, method) => {
    expect(isMediaAllowedApi(pathname, method)).toBe(true);
  });

  it.each([
    ["/api/clerk/access", "POST"],
    ["/api/media-subjects", "POST"],
    ["/api/media-subjects", "PATCH"],
    ["/api/media-subjects/subject-1", "DELETE"],
    ["/api/media-subjects/subject-1/history", "GET"],
    ["/api/media-requests", "PATCH"],
    ["/api/media-requests", "DELETE"],
    ["/api/media-requests/request-1", "GET"],
    ["/api/media-bank", "POST"],
    ["/api/media-days", "GET"],
    ["/api/admin/media-organizations", "GET"],
    ["/api/admin/media-invitations", "POST"],
    ["/api/ai-credits/periods", "POST"],
    ["/api/media-subscriptions/manual", "POST"],
    ["/api/media/athletes", "POST"],
    ["/api/media/athletes/athlete-1", "PATCH"],
    ["/api/media/athletes/athlete-1/private", "GET"],
    ["/api/athletes", "GET"],
    ["/api/athletes", "PATCH"],
    ["/api/contents/storage/drafts/draft-1", "DELETE"],
    ["/api/contents/storage/drafts/draft-1/history", "GET"],
    ["/api/contents/storage/variants/variant-1", "PATCH"],
    ["/api/contents/storage/sessions/session-1", "POST"],
    ["/api/unknown", "GET"],
  ])("denies the media API %s with %s", (pathname, method) => {
    expect(isMediaAllowedApi(pathname, method)).toBe(false);
  });

  it("keeps the Media Desk closed to the athlete role", () => {
    expect(isAthleteAllowedRoute("/media-desk", "GET")).toBe(false);
    expect(isAthleteAllowedRoute("/media-desk/subject-1", "GET")).toBe(false);
    expect(isAthleteAllowedRoute("/api/media-subjects", "GET")).toBe(false);
  });

  it("identifies the hidden media athlete profile route", () => {
    expect(isHiddenExternalAthleteProfileRoute("/media/athletes/seb-mory")).toBe(true);
    expect(isHiddenExternalAthleteProfileRoute("/media/athletes/athlete-1")).toBe(false);
  });

  it("opens the media requests API to the athlete in read and consent only", () => {
    expect(isAthleteAllowedRoute("/api/media-requests", "GET")).toBe(true);
    expect(isAthleteAllowedRoute("/api/media-requests", "PATCH")).toBe(true);

    for (const method of ["POST", "PUT", "DELETE"]) {
      expect(isAthleteAllowedRoute("/api/media-requests", method)).toBe(false);
    }

    expect(isAthleteAllowedRoute("/api/media-requests/request-1", "GET")).toBe(false);
    expect(isAthleteAllowedRoute("/api/media-requestsoups", "GET")).toBe(false);
  });

});
