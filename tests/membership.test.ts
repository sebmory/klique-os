import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { buildMembershipState, parseMembershipDate } from "@/lib/membership";

describe("buildMembershipState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses an explicit end date when provided", () => {
    vi.setSystemTime(new Date("2024-04-01T00:00:00.000Z"));

    const state = buildMembershipState({
      startDate: "2024-01-01",
      explicitEndDate: "2024-03-01",
      durationMonths: 3,
      isInitialFreeYearEligible: true,
    });

    expect(state.isActive).toBe(false);
    expect(state.statusLabel).toBe("Expiré");
    expect(state.endDateLabel).toBe("01/03/2024");
    expect(state.durationMonths).toBe(3);
  });

  it("falls back to 12 months for the first 16 athletes when no explicit end date exists", () => {
    vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));

    const state = buildMembershipState({
      startDate: "2024-01-15",
      isInitialFreeYearEligible: true,
    });

    expect(state.isActive).toBe(true);
    expect(state.statusLabel).toBe("Actif");
    expect(state.endDateLabel).toBe("15/01/2025");
    expect(state.durationMonths).toBe(12);
  });

  it("remains unknown when no explicit end date exists outside the initial free-year eligibility", () => {
    vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));

    const state = buildMembershipState({
      startDate: "2024-01-15",
      isInitialFreeYearEligible: false,
    });

    expect(state.isActive).toBe(false);
    expect(state.statusLabel).toBe("Non renseignée");
    expect(state.endDateLabel).toBeNull();
  });
});

describe("parseMembershipDate", () => {
  it("parses common date formats", () => {
    const firstDate = parseMembershipDate("01/02/2024");
    const secondDate = parseMembershipDate("2024-02-01");

    expect(firstDate?.getFullYear()).toBe(2024);
    expect(firstDate?.getMonth()).toBe(1);
    expect(firstDate?.getDate()).toBe(1);
    expect(secondDate?.getFullYear()).toBe(2024);
    expect(secondDate?.getMonth()).toBe(1);
    expect(secondDate?.getDate()).toBe(1);
    expect(parseMembershipDate("")).toBeNull();
  });
});
