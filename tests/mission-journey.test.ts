import { describe, expect, it } from "vitest";
import { creativeMissionRegularizationFixtures } from "@/fixtures/creative-mission-regularization";
import type { AthleteSessionRequest } from "@/lib/athlete-session-requests";
import type { CanonicalCreativeMission } from "@/lib/canonical-creative-missions";
import {
  projectAthleteSessionJourney,
  projectCanonicalMissionJourney,
  projectCreativeMissionJourney,
} from "@/lib/mission-journey";
import type { ProductionCreativeBrief } from "@/types/production-creative";

const canonicalMission = (
  overrides: Partial<CanonicalCreativeMission> = {},
): CanonicalCreativeMission => ({
  id: "11111111-1111-4111-8111-111111111111",
  recordKind: "mission",
  originKind: "athlete_request",
  state: "review",
  view: "to_process",
  title: "Couverture de match",
  missionType: "match_competition",
  scheduledAt: "2026-11-20T19:00:00.000Z",
  periodEndsAt: null,
  locationName: "Stade de Lausanne",
  region: "Vaud",
  deliverables: "20 photos",
  contextNotes: "Couverture du match",
  usageRights: "Web KLIQUE",
  budgetAmountMinor: null,
  expensesCovered: false,
  expenseTerms: "Aucun frais",
  responseDeadline: "2026-11-17T17:00:00.000Z",
  searchMode: "targeted_creatives",
  blockingReason: null,
  occurredAt: null,
  occurredAtSource: null,
  regularizationStatus: "none",
  regularizationNote: null,
  athletes: [{ id: "athlete-a", name: "Athlète A" }],
  services: [],
  sources: [{
    type: "athlete_session_request",
    relation: "origin",
    id: "22222222-2222-4222-8222-222222222222",
    snapshot: { workflowStatus: "submitted" },
  }],
  creative: null,
  nextAction: "Examiner la demande",
  nextActor: "Admin",
  events: [{
    action: "source_event",
    fromState: "review",
    toState: "review",
    actor: "athlete",
    note: null,
    details: { sourceAction: "submitted" },
    createdAt: "2026-11-10T09:00:00.000Z",
  }],
  updatedAt: "2026-11-10T09:00:00.000Z",
  ...overrides,
});

const athleteRequest = (
  overrides: Partial<AthleteSessionRequest> = {},
): AthleteSessionRequest => ({
  id: "33333333-3333-4333-8333-333333333333",
  athleteId: "athlete-a",
  athleteName: "Athlète A",
  requestType: "match_competition",
  workflowStatus: "submitted",
  sport: "Football",
  eventType: "Match",
  eventStartsAt: "2026-11-20T19:00:00.000Z",
  eventEndsAt: "2026-11-20T21:00:00.000Z",
  scheduleToConfirm: false,
  locationName: "Stade de Lausanne",
  region: "Vaud",
  clubOrTeam: "Club A",
  opponentOrEvent: "Club B",
  objective: "Documenter le match",
  deliverables: "20 photos",
  practicalInformation: "Entrée joueurs",
  desiredDurationMinutes: null,
  constraintsComment: "Arriver 30 minutes avant",
  productCode: "internal-product",
  commercialMode: "paid_extra",
  snapshotCreditType: null,
  snapshotCreditQuantity: null,
  snapshotPriceChf: 250,
  adminReason: null,
  athleteComplement: null,
  productionBriefId: "44444444-4444-4444-8444-444444444444",
  productionStatus: "published",
  assignedCreativeProfileId: "55555555-5555-4555-8555-555555555555",
  assignedCreativeName: "Créatif interne",
  creativeConfirmationStatus: "pending",
  deliveryStatus: "pending",
  applications: [{
    creativeProfileId: "66666666-6666-4666-8666-666666666666",
    displayName: "Candidature non retenue",
    status: "interested",
    message: "Message interne",
  }],
  finalConfirmedAt: null,
  cancelledAt: null,
  createdAt: "2026-11-10T09:00:00.000Z",
  updatedAt: "2026-11-10T09:00:00.000Z",
  periods: [],
  events: [{
    id: "event-1",
    fromStatus: null,
    toStatus: "submitted",
    action: "submitted",
    actorRole: "athlete",
    details: { requestType: "match_competition" },
    createdAt: "2026-11-10T09:00:00.000Z",
  }],
  nextAction: "KLIQUE doit examiner la demande",
  ...overrides,
});

const creativeProject = (
  overrides: Partial<ProductionCreativeBrief> = {},
): ProductionCreativeBrief => ({
  id: "77777777-7777-4777-8777-777777777777",
  title: "Couverture de match",
  creativeType: "photo",
  athletes: [{ id: "athlete-a", name: "Athlète A" }],
  scheduledDate: "2026-11-20",
  dateToAgree: false,
  region: "Vaud",
  locationDetails: "Stade de Lausanne",
  objective: "Documenter le match",
  deliverables: "20 photos",
  deliveryDueDate: "2026-11-22",
  responseDeadline: "2026-11-17T17:00:00.000Z",
  compensation: { type: "unpaid_collaboration", amountMinor: null, currency: null },
  expensesCovered: false,
  expenseTerms: "Aucun frais",
  creditsAndUsage: "Web KLIQUE",
  status: "published",
  conditionsVersion: 1,
  applicationStatus: "none",
  applicationMessage: null,
  assignment: null,
  ...overrides,
});

describe("unified mission journey projection", () => {
  it("maps persisted request, proposal, assignment, confirmation and delivery events", () => {
    const mission = canonicalMission({
      state: "changes_requested",
      view: "in_progress",
      creative: {
        kind: "operational",
        name: "Créatif A",
        profileId: "55555555-5555-4555-8555-555555555555",
      },
      sources: [
        ...canonicalMission().sources,
        {
          type: "production_brief",
          relation: "production",
          id: "44444444-4444-4444-8444-444444444444",
          snapshot: { status: "assigned" },
        },
      ],
      events: [
        canonicalMission().events[0],
        {
          action: "source_event",
          fromState: "review",
          toState: "organize",
          actor: "admin",
          note: null,
          details: { sourceAction: "accepted" },
          createdAt: "2026-11-10T10:00:00.000Z",
        },
        {
          action: "source_event",
          fromState: "proposed",
          toState: "proposed",
          actor: "creative",
          note: null,
          details: { sourceAction: "application_submitted" },
          createdAt: "2026-11-11T10:00:00.000Z",
        },
        {
          action: "assignment_projection_updated",
          fromState: "proposed",
          toState: "confirmation_pending",
          actor: "projection:production_assignment",
          note: null,
          details: {
            assignmentStatus: "active",
            confirmationStatus: "pending",
            deliveryStatus: "pending",
          },
          createdAt: "2026-11-12T10:00:00.000Z",
        },
        {
          action: "assignment_projection_updated",
          fromState: "confirmation_pending",
          toState: "confirmed",
          actor: "projection:production_assignment",
          note: null,
          details: {
            assignmentStatus: "active",
            confirmationStatus: "confirmed",
            deliveryStatus: "pending",
          },
          createdAt: "2026-11-13T10:00:00.000Z",
        },
        {
          action: "assignment_projection_updated",
          fromState: "confirmed",
          toState: "review_delivery",
          actor: "projection:production_assignment",
          note: null,
          details: {
            assignmentStatus: "active",
            confirmationStatus: "confirmed",
            deliveryStatus: "delivered",
          },
          createdAt: "2026-11-21T10:00:00.000Z",
        },
        {
          action: "assignment_projection_updated",
          fromState: "review_delivery",
          toState: "changes_requested",
          actor: "projection:production_assignment",
          note: null,
          details: {
            assignmentStatus: "active",
            confirmationStatus: "confirmed",
            deliveryStatus: "changes_requested",
          },
          createdAt: "2026-11-22T10:00:00.000Z",
        },
      ],
    });

    const projection = projectCanonicalMissionJourney(mission);

    expect(projection.timeline.map((item) => item.stage)).toEqual([
      "request_received",
      "mission_to_organize",
      "creative_response",
      "creative_assigned",
      "mission_confirmed",
      "delivery_received",
      "changes_requested",
      "delivery_received",
    ]);
    expect(projection.expectedActor).toBe("Créatif");
    expect(projection.nextAction).toBe("Transmettre une nouvelle version");
    expect(projection.warnings).toEqual([]);
  });

  it("signals missing or contradictory information instead of filling it", () => {
    const projection = projectCanonicalMissionJourney(canonicalMission({
      state: "completed",
      view: "history",
      scheduledAt: null,
      occurredAt: null,
      athletes: [],
      events: [{
        action: "assignment_projection_updated",
        fromState: "confirmation_pending",
        toState: "confirmed",
        actor: "projection:production_assignment",
        note: null,
        details: {
          assignmentStatus: "active",
          confirmationStatus: "confirmed",
          deliveryStatus: "pending",
        },
        createdAt: "2026-11-13T10:00:00.000Z",
      }],
    }));

    expect(projection.warnings).toEqual(expect.arrayContaining([
      "Aucun Athlète n’est rattaché à la mission.",
      "La date de mission est manquante.",
      "Aucun Créatif n’est rattaché à cet état.",
      "Le brief Production source est manquant.",
      "La mission est terminée sans date de réalisation connue.",
      "Le dernier événement métier contredit l’état actuel.",
    ]));
  });

  it("keeps the seven historical entries to the three evidenced milestones", () => {
    expect(creativeMissionRegularizationFixtures).toHaveLength(7);
    expect(creativeMissionRegularizationFixtures.filter(
      (fixture) => fixture.regularizationStatus === "historical_completed",
    )).toHaveLength(5);
    expect(creativeMissionRegularizationFixtures.filter(
      (fixture) => fixture.regularizationStatus === "historical_closed_without_action",
    )).toHaveLength(2);

    for (const fixture of creativeMissionRegularizationFixtures) {
      const projection = projectCanonicalMissionJourney(canonicalMission({
        recordKind: fixture.recordKind,
        state: fixture.businessState,
        view: "history",
        occurredAt: fixture.occurredAt,
        regularizationStatus: fixture.regularizationStatus,
        regularizationNote: fixture.regularizationNote,
      }));
      expect(projection.timeline.map((item) => item.stage)).toEqual([
        "historical_regularization",
        "known_realization",
        fixture.businessState === "completed" ? "completed" : "closed_without_action",
      ]);
    }
  });

  it("preserves a multi-Athlete canonical mission without duplicating its journey", () => {
    const mission = canonicalMission({
      athletes: [
        { id: "athlete-a", name: "Athlète A" },
        { id: "athlete-b", name: "Athlète B" },
      ],
    });
    const before = structuredClone(mission);

    const projection = projectCanonicalMissionJourney(mission);

    expect(projection.timeline.filter((item) => item.stage === "request_received")).toHaveLength(1);
    expect(mission).toEqual(before);
  });

  it.each([
    ["submitted", "pending", "À examiner", "Admin"],
    ["accepted", "pending", "À organiser", "Admin"],
    ["proposed_to_creatives", "pending", "Créatif recherché", "Créatif"],
    ["confirmed", "pending", "Mission confirmée", "Créatif"],
    ["confirmed", "changes_requested", "Réalisation en cours", "Créatif"],
    ["confirmed", "delivered", "Livré", "Admin"],
    ["completed", "validated", "Terminé", null],
    ["refused", "pending", "Refusée", null],
    ["cancelled", "pending", "Annulée", null],
  ] as const)(
    "builds the Athlete view for %s / %s",
    (workflowStatus, deliveryStatus, label, expectedActor) => {
      const projection = projectAthleteSessionJourney(athleteRequest({
        workflowStatus,
        deliveryStatus,
      }));
      expect(projection.label).toBe(label);
      expect(projection.expectedActor).toBe(expectedActor);
    },
  );

  it("returns an Athlete-safe DTO without internal costs, candidates or Creative identity", () => {
    const projection = projectAthleteSessionJourney(athleteRequest());
    const serialized = JSON.stringify(projection);

    expect(serialized).not.toContain("snapshotPriceChf");
    expect(serialized).not.toContain("paid_extra");
    expect(serialized).not.toContain("Candidature non retenue");
    expect(serialized).not.toContain("Créatif interne");
    expect(serialized).not.toContain("Message interne");
    expect(projection.nextAction).toBe("KLIQUE examine votre demande");
  });

  it.each([
    [creativeProject(), "Proposition reçue", "Créatif"],
    [creativeProject({ applicationStatus: "interested" }), "Réponse envoyée", "Admin"],
    [creativeProject({
      status: "assigned",
      applicationStatus: "selected",
      assignment: {
        confirmationStatus: "pending",
        deliveryStatus: "pending",
        deliveryLinks: [],
        deliveryComment: null,
        reviewComment: null,
        necessaryContactDetails: null,
      },
    }), "Confirmation attendue", "Créatif"],
    [creativeProject({
      status: "assigned",
      applicationStatus: "selected",
      assignment: {
        confirmationStatus: "confirmed",
        deliveryStatus: "pending",
        deliveryLinks: [],
        deliveryComment: null,
        reviewComment: null,
        necessaryContactDetails: "Contact autorisé",
      },
    }), "Livraison attendue", "Créatif"],
    [creativeProject({
      status: "assigned",
      applicationStatus: "selected",
      assignment: {
        confirmationStatus: "confirmed",
        deliveryStatus: "delivered",
        deliveryLinks: ["https://example.test/delivery"],
        deliveryComment: null,
        reviewComment: null,
        necessaryContactDetails: "Contact autorisé",
      },
    }), "Livraison transmise", "Admin"],
    [creativeProject({
      status: "assigned",
      applicationStatus: "selected",
      assignment: {
        confirmationStatus: "confirmed",
        deliveryStatus: "changes_requested",
        deliveryLinks: ["https://example.test/delivery"],
        deliveryComment: null,
        reviewComment: "Recadrer deux photos",
        necessaryContactDetails: "Contact autorisé",
      },
    }), "Modifications demandées", "Créatif"],
    [creativeProject({
      status: "assigned",
      applicationStatus: "selected",
      assignment: {
        confirmationStatus: "confirmed",
        deliveryStatus: "validated",
        deliveryLinks: ["https://example.test/delivery"],
        deliveryComment: null,
        reviewComment: null,
        necessaryContactDetails: "Contact autorisé",
      },
    }), "Terminée", null],
  ] as const)("builds a role-safe Creative state", (project, label, expectedActor) => {
    const projection = projectCreativeMissionJourney(project);
    expect(projection.label).toBe(label);
    expect(projection.expectedActor).toBe(expectedActor);
    expect(JSON.stringify(projection)).not.toContain("internal_admin_notes");
  });
});
