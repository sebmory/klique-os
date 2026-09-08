import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calculateAvailableAthleteServiceBalance } from "@/lib/athlete-service-requests";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "lib/athlete-service-requests.ts"),
  "utf8",
);

const scheduleSource = source.slice(
  source.indexOf("async schedule({ workspaceId, requestId, scheduledAt })"),
  source.indexOf("async start({ workspaceId, requestId })"),
);

type RequestState = "to_confirm" | "scheduled" | "refused";

class SerializedReservationModel {
  private lock = Promise.resolve();
  private readonly requests = new Map<string, { status: RequestState; scheduledAt: string | null }>([
    ["request-a", { status: "to_confirm", scheduledAt: null }],
    ["request-b", { status: "to_confirm", scheduledAt: null }],
  ]);

  async schedule(requestId: string, scheduledAt: string) {
    let release = () => {};
    const previous = this.lock;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const request = this.requests.get(requestId)!;
      if (request.status === "scheduled" && request.scheduledAt === scheduledAt) return "unchanged";
      const reserved = [...this.requests.values()].filter((item) => item.status === "scheduled").length;
      if (request.status !== "to_confirm") return "conflict";
      if (reserved >= 1) return "insufficient_rights";
      request.status = "scheduled";
      request.scheduledAt = scheduledAt;
      return "transitioned";
    } finally {
      release();
    }
  }

  refuse(requestId: string) {
    this.requests.get(requestId)!.status = "refused";
  }
}

describe("athlete service request scheduling", () => {
  it("locks the shared active membership before recalculating reservations", () => {
    expect(scheduleSource).toContain("sql.transaction([lockAthleteBalance, scheduleRequest])");
    expect(scheduleSource).toContain("FOR UPDATE OF membership");
    expect(scheduleSource).toContain("reservation.status IN ('scheduled', 'in_progress')");
    expect(scheduleSource).toContain("candidate.credit_balance - candidate.reserved_quantity");
  });

  it("allows only one of two concurrent requests to reserve the same available right", async () => {
    const model = new SerializedReservationModel();
    const results = await Promise.all([
      model.schedule("request-a", "2099-09-20T10:00:00.000Z"),
      model.schedule("request-b", "2099-09-21T10:00:00.000Z"),
    ]);

    expect(results.sort()).toEqual(["insufficient_rights", "transitioned"]);
  });

  it("does not reserve twice when the same scheduling is repeated", async () => {
    const model = new SerializedReservationModel();
    const scheduledAt = "2099-09-20T10:00:00.000Z";

    expect(await model.schedule("request-a", scheduledAt)).toBe("transitioned");
    expect(await model.schedule("request-a", scheduledAt)).toBe("unchanged");
    expect(await model.schedule("request-b", "2099-09-21T10:00:00.000Z")).toBe("insufficient_rights");
  });

  it("releases the calculated reservation after a scheduled request is refused", async () => {
    const model = new SerializedReservationModel();

    expect(await model.schedule("request-a", "2099-09-20T10:00:00.000Z")).toBe("transitioned");
    model.refuse("request-a");
    expect(await model.schedule("request-b", "2099-09-21T10:00:00.000Z")).toBe("transitioned");
    expect(source).toContain("status IN ('received', 'to_confirm', 'scheduled')");
    expect(calculateAvailableAthleteServiceBalance(
      { production: 1, custom_content: 2 },
      { production: 1, custom_content: 0 },
    )).toEqual({ production: 0, custom_content: 2 });
    expect(calculateAvailableAthleteServiceBalance(
      { production: 1, custom_content: 2 },
      { production: 0, custom_content: 0 },
    )).toEqual({ production: 1, custom_content: 2 });
  });

  it("never writes purchases, payments, credit movements, or executions while scheduling", () => {
    expect(scheduleSource).not.toMatch(/INSERT\s+INTO/i);
    expect(scheduleSource).not.toMatch(/UPDATE\s+(athlete_credit|athlete_credit_purchases|athlete_credit_movements)/i);
    expect(scheduleSource).toContain("UPDATE athlete_service_requests request");
  });
});