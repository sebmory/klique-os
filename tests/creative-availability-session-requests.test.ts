import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  expandCreativeAvailabilityRules,
  parseCreativeAvailabilityInput,
  type CreativeAvailabilityRule,
} from "@/lib/creative-availability";
import {
  parseAthleteSessionRequestInput,
  parseAthleteSessionProductionInput,
  zurichLocalDateTimeToIso,
} from "@/lib/athlete-session-requests";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("creative availability validation", () => {
  it("requires a valid time range or a full day", () => {
    expect(() => parseCreativeAvailabilityInput({
      availabilityDate: "2026-11-12",
      startTime: "18:00",
      endTime: "09:00",
      allDay: false,
      recurrence: "none",
      recurrenceUntil: null,
      exceptionDates: [],
      regions: ["Vaud"],
      missionTypes: ["match_competition"],
      internalComment: null,
    })).toThrow(/plage horaire/i);

    expect(parseCreativeAvailabilityInput({
      availabilityDate: "2026-11-12",
      startTime: null,
      endTime: null,
      allDay: true,
      recurrence: "none",
      recurrenceUntil: null,
      exceptionDates: [],
      regions: ["Vaud"],
      missionTypes: ["media_day"],
      internalComment: null,
    }).allDay).toBe(true);
  });

  it("caps recurrence at one year and applies exceptions", () => {
    expect(() => parseCreativeAvailabilityInput({
      availabilityDate: "2026-01-01",
      startTime: "09:00",
      endTime: "12:00",
      allDay: false,
      recurrence: "weekly",
      recurrenceUntil: "2027-02-01",
      exceptionDates: [],
      regions: ["Vaud"],
      missionTypes: ["match_competition"],
      internalComment: null,
    })).toThrow(/maximal d’un an/i);

    const rule: CreativeAvailabilityRule = {
      id: uuid,
      creativeProfileId: uuid,
      creativeDisplayName: "Créatif Test",
      availabilityDate: "2026-11-02",
      startTime: "09:00",
      endTime: "12:00",
      allDay: false,
      recurrence: "weekly",
      recurrenceUntil: "2026-11-30",
      exceptionDates: ["2026-11-16"],
      regions: ["Vaud"],
      missionTypes: ["match_competition"],
      internalComment: null,
      planningTimezone: "Europe/Zurich",
      createdAt: "2026-11-01T10:00:00.000Z",
      updatedAt: "2026-11-01T10:00:00.000Z",
    };
    expect(expandCreativeAvailabilityRules([rule], "2026-11-01", "2026-11-30")
      .map((item) => item.date))
      .toEqual(["2026-11-02", "2026-11-09", "2026-11-23", "2026-11-30"]);
  });
});

describe("athlete session request validation", () => {
  it("stores Zurich local times as unambiguous UTC instants across DST", () => {
    expect(zurichLocalDateTimeToIso("2026-01-15", "10:00")).toBe("2026-01-15T09:00:00.000Z");
    expect(zurichLocalDateTimeToIso("2026-07-15", "10:00")).toBe("2026-07-15T08:00:00.000Z");
  });

  it("requires two distinct Media Day periods", () => {
    expect(() => parseAthleteSessionRequestInput({
      idempotencyKey: uuid,
      requestType: "media_day",
      locationName: "Lausanne",
      region: "Vaud",
      objective: "Portraits",
      deliverables: "20 photos",
      desiredDurationMinutes: 120,
      constraintsComment: null,
      practicalInformation: null,
      periods: [{ date: "2026-11-20", startTime: "10:00", endTime: "12:00" }],
    })).toThrow(/au moins deux/i);
  });

  it("keeps creative conditions explicit when creating Production", () => {
    expect(() => parseAthleteSessionProductionInput({
      idempotencyKey: uuid,
      creativeType: "photo",
      selectedPeriodStart: null,
      deliveryDueDate: null,
      compensation: {
        type: "paid_mandate",
        amountMinor: null,
        currency: null,
      },
      expensesCovered: false,
      expenseTerms: "Aucun frais.",
      creditsAndUsage: "Crédit obligatoire.",
      necessaryContactDetails: null,
      recipientIds: [uuid],
    })).toThrow(/montant et la devise/i);
  });
});

describe("migration and workflow guarantees", () => {
  const migration = readFileSync(
    "db/migrations/20261109_creative_availability_session_requests_v1.sql",
    "utf8",
  );
  const workflow = readFileSync("lib/athlete-session-requests.ts", "utf8");

  it("uses UUID origins and never a Sheets row as identity", () => {
    expect(migration).toMatch(/origin_request_id/);
    expect(migration).toMatch(/production_brief_id UUID/);
    expect(workflow).toMatch(/production_source_row[\s\S]*NULL/);
    expect(workflow).not.toMatch(/addShooting|updateShooting|spreadsheets\.values\.(?:append|update)/);
  });

  it("keeps transition history append-only and idempotent", () => {
    expect(migration).toMatch(/athlete_session_request_events_immutable/);
    expect(migration).toMatch(/UNIQUE \(workspace_id, request_id, idempotency_key\)/);
    expect(workflow).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it("locks final confirmation and checks confirmed conflicts only", () => {
    expect(workflow).toMatch(/pg_advisory_xact_lock/);
    expect(workflow).toMatch(/confirmation_status = 'confirmed'/);
    expect(workflow).toMatch(/workflow_status IN \('confirmed', 'completed'\)/);
    expect(workflow).not.toMatch(/notification|sendEmail|invitation/i);
  });
});
