import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  evaluateBusinessAccessMock,
  createAthleteDistinctionMock,
  createAthleteDistinctionNominationMock,
  deleteAthleteDistinctionMock,
  deleteAthleteDistinctionNominationMock,
  getDistinctionByPeriodMock,
  listAthleteDistinctionNominationsMock,
  listAthleteDistinctionsMock,
  listDistinctionNominationsByPeriodMock,
} = vi.hoisted(() => ({
  evaluateBusinessAccessMock: vi.fn(),
  createAthleteDistinctionMock: vi.fn(),
  createAthleteDistinctionNominationMock: vi.fn(),
  deleteAthleteDistinctionMock: vi.fn(),
  deleteAthleteDistinctionNominationMock: vi.fn(),
  getDistinctionByPeriodMock: vi.fn(),
  listAthleteDistinctionNominationsMock: vi.fn(),
  listAthleteDistinctionsMock: vi.fn(),
  listDistinctionNominationsByPeriodMock: vi.fn(),
}));

vi.mock("@/lib/clerk-access/service", () => ({
  evaluateBusinessAccess: evaluateBusinessAccessMock,
  getCurrentUserAccessProfile: vi.fn(),
}));

vi.mock("@/lib/athlete-distinctions/service", () => ({
  createAthleteDistinction: createAthleteDistinctionMock,
  createAthleteDistinctionNomination: createAthleteDistinctionNominationMock,
  deleteAthleteDistinction: deleteAthleteDistinctionMock,
  deleteAthleteDistinctionNomination: deleteAthleteDistinctionNominationMock,
  getDistinctionByPeriod: getDistinctionByPeriodMock,
  listAthleteDistinctionNominations: listAthleteDistinctionNominationsMock,
  listAthleteDistinctions: listAthleteDistinctionsMock,
  listDistinctionNominationsByPeriod: listDistinctionNominationsByPeriodMock,
}));

import { DELETE, GET, POST } from "@/app/api/athlete-distinctions/route";
import { NextRequest } from "next/server";

const request = (method: "POST" | "DELETE", payload: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/athlete-distinctions", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

const septemberPeriod = {
  type: "athlete_of_the_month",
  awardMonth: 9,
  awardYear: 2026,
};

describe("/api/athlete-distinctions monthly periods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 12));
    evaluateBusinessAccessMock.mockResolvedValue({ allowed: true });
    getDistinctionByPeriodMock.mockResolvedValue(null);
    listDistinctionNominationsByPeriodMock.mockResolvedValue([]);
    createAthleteDistinctionNominationMock.mockResolvedValue({ id: "nomination-1" });
  });

  it("stores a nomination under the selected completed period", async () => {
    const response = await POST(request("POST", {
      action: "nominate",
      athleteId: "athlete-1",
      ...septemberPeriod,
    }));

    expect(response.status).toBe(201);
    expect(createAthleteDistinctionNominationMock).toHaveBeenCalledWith(expect.objectContaining({
      athleteId: "athlete-1",
      awardMonth: 9,
      awardYear: 2026,
    }));
    expect(evaluateBusinessAccessMock).toHaveBeenCalledWith(expect.anything(), { action: "write:crm" });
  });

  it("loads nominations and the winner for the selected historical period", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/athlete-distinctions?type=athlete_of_the_month&awardMonth=9&awardYear=2026",
    ));

    expect(response.status).toBe(200);
    expect(listDistinctionNominationsByPeriodMock).toHaveBeenCalledWith("athlete_of_the_month", 9, 2026);
    expect(getDistinctionByPeriodMock).toHaveBeenCalledWith("athlete_of_the_month", 9, 2026);
    expect(evaluateBusinessAccessMock).toHaveBeenCalledWith(expect.anything(), { action: "write:crm" });
  });

  it("rejects the current month for the monthly award", async () => {
    const response = await POST(request("POST", {
      action: "nominate",
      athleteId: "athlete-1",
      type: "athlete_of_the_month",
      awardMonth: 10,
      awardYear: 2026,
    }));

    expect(response.status).toBe(400);
    expect(createAthleteDistinctionNominationMock).not.toHaveBeenCalled();
  });

  it("does not delete a nomination from another period", async () => {
    listDistinctionNominationsByPeriodMock.mockResolvedValue([{ id: "nomination-september" }]);

    const response = await DELETE(request("DELETE", {
      action: "delete-nomination",
      nominationId: "nomination-august",
      ...septemberPeriod,
    }));

    expect(response.status).toBe(404);
    expect(deleteAthleteDistinctionNominationMock).not.toHaveBeenCalled();
  });
});
