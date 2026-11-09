import { describe, expect, it } from "vitest";
import { resolveAthleteSessionIdentity } from "@/app/api/athlete/session-requests/route";
import { resolveCreativeAvailabilityIdentity } from "@/app/api/creative/availability/route";

describe("session request role isolation", () => {
  it("accepts only the active Athlete identity tied to the workspace", () => {
    expect(resolveAthleteSessionIdentity({
      clerkUser: { id: "user-athlete" },
      userAccess: {
        role: "athlete",
        status: "active",
        workspaceId: "workspace-a",
        athleteId: "athlete-a",
      },
    })).toEqual({
      clerkUserId: "user-athlete",
      workspaceId: "workspace-a",
      athleteId: "athlete-a",
    });

    expect(resolveAthleteSessionIdentity({
      clerkUser: { id: "user-admin" },
      userAccess: {
        role: "admin",
        status: "active",
        workspaceId: "workspace-a",
        athleteId: "athlete-a",
      },
    })).toBeNull();
    expect(resolveAthleteSessionIdentity({
      clerkUser: { id: "user-athlete" },
      userAccess: {
        role: "athlete",
        status: "disabled",
        workspaceId: "workspace-a",
        athleteId: "athlete-a",
      },
    })).toBeNull();
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
  });
});
