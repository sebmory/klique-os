import { describe, expect, it } from "vitest";
import { isAthleteAllowedRoute, isMediaAllowedApi, isMediaAllowedRoute } from "@/proxy";

describe("media desk proxy access", () => {
  it("opens the Media Desk pages to the media role", () => {
    expect(isMediaAllowedRoute("/media-desk")).toBe(true);
    expect(isMediaAllowedRoute("/media-desk/subject-1")).toBe(true);
  });

  it("keeps Contents accessible to the media role", () => {
    expect(isMediaAllowedRoute("/contents")).toBe(true);
    expect(isMediaAllowedRoute("/contents/create")).toBe(true);
  });

  it("keeps the admin pages closed to the media role", () => {
    expect(isMediaAllowedRoute("/crm")).toBe(false);
    expect(isMediaAllowedRoute("/hub")).toBe(false);
    expect(isMediaAllowedRoute("/settings")).toBe(false);
    expect(isMediaAllowedRoute("/media-deskoups")).toBe(false);
  });

  it("allows the media role to read subjects only", () => {
    expect(isMediaAllowedApi("/api/media-subjects", "GET")).toBe(true);
    expect(isMediaAllowedApi("/api/media-subjects/subject-1", "GET")).toBe(true);

    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(isMediaAllowedApi("/api/media-subjects", method)).toBe(false);
      expect(isMediaAllowedApi("/api/media-subjects/subject-1", method)).toBe(false);
    }
  });

  it("leaves the other API routes to their own controls", () => {
    expect(isMediaAllowedApi("/api/clerk/access", "GET")).toBe(true);
    expect(isMediaAllowedApi("/api/contents/storage/drafts", "POST")).toBe(true);
  });

  it("keeps the Media Desk closed to the athlete role", () => {
    expect(isAthleteAllowedRoute("/media-desk", "GET")).toBe(false);
    expect(isAthleteAllowedRoute("/media-desk/subject-1", "GET")).toBe(false);
    expect(isAthleteAllowedRoute("/api/media-subjects", "GET")).toBe(false);
  });
});
