import { describe, expect, it, vi } from "vitest";
import {
  getCurrentAthleteMembership,
  type AthleteMembership,
  type AthleteMembershipReader,
} from "@/lib/athlete-memberships";

const baseMembership: AthleteMembership = {
  id: "membership-1",
  workspaceId: "klique-os",
  athleteId: "athlete-stable-id",
  membershipKind: "founder",
  planCode: null,
  status: "active",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: null,
  autoRenew: false,
  paymentInstallments: null,
  source: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const read = (memberships: AthleteMembership[]): AthleteMembershipReader => vi.fn().mockResolvedValue(memberships);

const resolve = (readMemberships: AthleteMembershipReader) => getCurrentAthleteMembership({
  workspaceId: "klique-os",
  athleteId: "athlete-stable-id",
  historical: { startDate: "2026-01-15", athleteIndex: 0 },
  now: new Date("2026-09-01T00:00:00.000Z"),
  readMemberships,
});

describe("getCurrentAthleteMembership", () => {
  it("returns an active founder membership from Neon", async () => {
    const result = await resolve(read([baseMembership]));

    expect(result.origin).toBe("neon");
    expect(result.membership?.membershipKind).toBe("founder");
    expect(result.status).toBe("active");
    expect(result.isActive).toBe(true);
  });

  it("keeps an expired subscription from Neon instead of falling back", async () => {
    const result = await resolve(read([{
      ...baseMembership,
      membershipKind: "subscription",
      planCode: "annual",
      status: "expired",
      endsAt: "2026-08-01T00:00:00.000Z",
    }]));

    expect(result.origin).toBe("neon");
    expect(result.status).toBe("expired");
    expect(result.isActive).toBe(false);
  });

  it("returns a future membership as scheduled", async () => {
    const result = await resolve(read([{
      ...baseMembership,
      membershipKind: "trial",
      status: "scheduled",
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: "2026-11-01T00:00:00.000Z",
    }]));

    expect(result.origin).toBe("neon");
    expect(result.status).toBe("scheduled");
    expect(result.isActive).toBe(false);
  });

  it("uses the historical first-16 fallback when Neon has no row", async () => {
    const result = await resolve(read([]));

    expect(result.origin).toBe("historical");
    expect(result.membership).toBeNull();
    expect(result.status).toBe("active");
    expect(result.isActive).toBe(true);
  });
});