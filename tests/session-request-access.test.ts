import { describe, expect, it } from "vitest";
import { resolveAthleteSessionIdentity } from "@/app/api/athlete/session-requests/route";
import { resolveCreativeAvailabilityIdentity } from "@/app/api/creative/availability/route";
import {
  isAthleteAllowedRoute,
  isCreativeAllowedRoute,
  isMediaAllowedApi,
  isPartnerAllowedApi,
} from "@/proxy";

describe("session request role isolation", () => {
  it("uses the same active Athlete access as the historical APIs", () => {
    expect(resolveAthleteSessionIdentity({
      clerkUser: {
        id: "user-athlete-production",
        email: "athlete-role@example.test",
      },
      userAccess: {
        clerkUserId: "user-athlete-production",
        email: "admin-role@example.test",
        role: "athlete",
        status: "active",
        workspaceId: "workspace-a",
        athleteId: "athlete-a",
      },
    })).toEqual({
      clerkUserId: "user-athlete-production",
      workspaceId: "workspace-a",
      athleteId: "athlete-a",
    });

    expect(resolveAthleteSessionIdentity({
      clerkUser: { id: "user-admin-production" },
      userAccess: {
        clerkUserId: "user-admin-production",
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
        athleteId: "athlete-a",
      },
    })).toBeNull();
    expect(resolveAthleteSessionIdentity({
      clerkUser: { id: "user-athlete" },
      userAccess: {
        clerkUserId: "user-athlete",
        role: "athlete",
        status: "disabled",
        workspaceId: "workspace-a",
        athleteId: "athlete-a",
      },
    })).toBeNull();
    expect(resolveAthleteSessionIdentity({
      clerkUser: { id: "user-athlete" },
      userAccess: {
        clerkUserId: "user-other-athlete",
        role: "athlete",
        status: "active",
        workspaceId: "workspace-b",
        athleteId: "athlete-b",
      },
    })).toBeNull();
  });

  it("allows the session endpoint only through the Athlete proxy policy", () => {
    const path = "/api/athlete/session-requests";
    expect(isAthleteAllowedRoute("/api/athlete/services", "GET")).toBe(true);
    expect(isAthleteAllowedRoute("/api/athlete/service-requests", "GET")).toBe(true);
    for (const method of ["GET", "POST", "PATCH"]) {
      expect(isAthleteAllowedRoute(path, method)).toBe(true);
    }
    expect(isAthleteAllowedRoute(path, "DELETE")).toBe(false);
    expect(isAthleteAllowedRoute(`${path}/other-athlete`, "GET")).toBe(false);
    expect(isPartnerAllowedApi(path, "GET")).toBe(false);
    expect(isMediaAllowedApi(path, "GET")).toBe(false);
    expect(isCreativeAllowedRoute(path, "GET")).toBe(false);
  });

  it("scopes Creative mutations to the authenticated profile only", () => {
    expect(resolveCreativeAvailabilityIdentity({
      status: "active",
      creativeProfileStatus: "active",
      workspaceId: "workspace-a",
      creativeProfileId: "11111111-1111-4111-8111-111111111111",
      clerkUserId: "creative-user",
    })).toEqual({
      workspaceId: "workspace-a",
      creativeProfileId: "11111111-1111-4111-8111-111111111111",
      clerkUserId: "creative-user",
    });
    expect(resolveCreativeAvailabilityIdentity({
      status: "revoked",
      creativeProfileStatus: "active",
      workspaceId: "workspace-a",
      creativeProfileId: "11111111-1111-4111-8111-111111111111",
      clerkUserId: "creative-user",
    })).toBeNull();
    expect(resolveCreativeAvailabilityIdentity({
      status: "active",
      creativeProfileStatus: "inactive",
      workspaceId: "workspace-a",
      creativeProfileId: "11111111-1111-4111-8111-111111111111",
      clerkUserId: "creative-user",
    })).toBeNull();

    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      expect(isCreativeAllowedRoute("/api/creative/availability", method)).toBe(true);
    }
  });
});
