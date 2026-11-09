import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAthleteSessionProductionInput } from "@/lib/athlete-session-requests";
import { parseOperationalMissionDraftInput } from "@/lib/operational-creative-missions";

const migration = readFileSync(
  "db/migrations/20261113_canonical_creative_missions_operational_v2.sql",
  "utf8",
);
const operationalService = readFileSync("lib/operational-creative-missions.ts", "utf8");
const productionService = readFileSync("lib/admin-production-creative.ts", "utf8");

const validDraft = {
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  title: "Media Day équipe première",
  missionType: "media_day",
  athletes: [
    { id: "athlete-1", name: "Athlète 1" },
    { id: "athlete-1", name: "Athlète 1" },
  ],
  scheduledAt: "2026-12-10T09:00:00+01:00",
  periodEndsAt: "2026-12-10T12:00:00+01:00",
  locationName: "Stade",
  region: "Vaud",
  deliverables: "Portraits",
  contextNotes: "Préparation de saison",
  usageRights: "Web KLIQUE",
  budgetAmountMinor: null,
  expensesCovered: false,
  expenseTerms: "Frais non prévus",
  responseDeadline: "2026-12-01T18:00:00+01:00",
  searchMode: "targeted_creatives",
};

describe("operational canonical mission inputs", () => {
  it("accepts an incomplete Admin draft while normalizing dates and athletes", () => {
    const parsed = parseOperationalMissionDraftInput({
      ...validDraft,
      scheduledAt: null,
      periodEndsAt: null,
      locationName: null,
      region: null,
      deliverables: null,
      contextNotes: null,
      usageRights: null,
      expenseTerms: null,
      responseDeadline: null,
      searchMode: null,
    });

    expect(parsed.athletes).toEqual([{ id: "athlete-1", name: "Athlète 1" }]);
    expect(parsed.region).toBeNull();
    expect(parsed.deliverables).toBeNull();
  });

  it("rejects invalid periods, budgets and unknown fields", () => {
    expect(() => parseOperationalMissionDraftInput({
      ...validDraft,
      periodEndsAt: "2026-12-09T12:00:00+01:00",
    })).toThrow("La fin de période doit suivre son début.");
    expect(() => parseOperationalMissionDraftInput({
      ...validDraft,
      budgetAmountMinor: -1,
    })).toThrow("Budget invalide.");
    expect(() => parseOperationalMissionDraftInput({
      ...validDraft,
      workspaceId: "workspace-b",
    })).toThrow("Requête invalide.");
  });

  it("carries the response deadline into Athlete-origin Production briefs", () => {
    const parsed = parseAthleteSessionProductionInput({
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      creativeType: "photo",
      selectedPeriodStart: null,
      deliveryDueDate: null,
      responseDeadline: "2026-12-01T18:00:00+01:00",
      compensation: {
        type: "unpaid_collaboration",
        amountMinor: null,
        currency: null,
      },
      expensesCovered: false,
      expenseTerms: "Frais non prévus",
      creditsAndUsage: "Web KLIQUE",
      necessaryContactDetails: null,
      recipientIds: ["33333333-3333-4333-8333-333333333333"],
    });

    expect(parsed.responseDeadline).toBe("2026-12-01T18:00:00+01:00");
  });
});

describe("operational canonical mission schema", () => {
  it("adds Admin idempotence and operational fields without a new execution engine", () => {
    expect(migration).toContain("creative_missions_admin_creation_unique_idx");
    expect(migration).toContain("origin_kind = 'admin'");
    expect(migration).toContain("response_deadline TIMESTAMPTZ");
    expect(migration).toContain("'confirmation_pending'");
    expect(migration).toContain("'changes_requested'");
    expect(migration).toContain("'cancelled'");
    expect(migration).not.toMatch(/INSERT\s+INTO\s+production_creative_applications/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+production_creative_assignments/i);
    expect(migration).not.toMatch(
      /creative_availability[\s\S]*INSERT|INSERT[\s\S]*creative_availability/i,
    );
  });

  it("keeps creation idempotent and proposals delegated to Production", () => {
    expect(operationalService).toContain("ON CONFLICT (workspace_id, admin_creation_key)");
    expect(operationalService).toContain("'admin-create:' || $3");
    expect(productionService).toContain("createProductionCreativeBriefFromCanonicalMission");
    expect(productionService).toContain("origin_type = 'canonical_mission'");
    expect(productionService).toContain("transitionProductionCreativeBrief");
  });
});
