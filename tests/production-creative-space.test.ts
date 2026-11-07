import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseApplicationInput,
  parseCompensation,
  parseDeliveryInput,
} from "@/lib/production-creative-validation";
import {
  buildProductionSourceFingerprint,
  classifyProductionSourceAnchor,
  parseAdminBriefInput,
} from "@/lib/admin-production-creative";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("production creative space validation", () => {
  it("keeps an application separate from assignment", () => {
    expect(parseApplicationInput({
      briefId: uuid,
      action: "apply",
      message: "Disponible et intéressé.",
    })).toEqual({
      briefId: uuid,
      action: "apply",
      message: "Disponible et intéressé.",
    });
  });

  it("allows withdrawal before assignment", () => {
    expect(parseApplicationInput({
      briefId: uuid,
      action: "withdraw",
      message: null,
    }).action).toBe("withdraw");
  });

  it("requires explicit financial conditions", () => {
    expect(() => parseCompensation({
      type: "paid_mandate",
      amountMinor: null,
      currency: null,
    })).toThrow(/montant et la devise/i);
    expect(parseCompensation({
      type: "unpaid_collaboration",
      amountMinor: null,
      currency: null,
    }).type).toBe("unpaid_collaboration");
  });

  it("requires the current conditions version on confirmation", () => {
    expect(() => parseDeliveryInput({
      briefId: uuid,
      action: "confirm",
      conditionsVersion: null,
      links: [],
      comment: null,
    })).toThrow(/version/i);
  });

  it("accepts HTTPS delivery links only", () => {
    expect(() => parseDeliveryInput({
      briefId: uuid,
      action: "deliver",
      conditionsVersion: null,
      links: ["http://example.test/files"],
      comment: null,
    })).toThrow(/HTTPS/i);
    expect(parseDeliveryInput({
      briefId: uuid,
      action: "deliver",
      conditionsVersion: null,
      links: ["https://example.test/files"],
      comment: "Première livraison",
    }).links).toEqual(["https://example.test/files"]);
  });

  it("requires a reason when refusing an assignment", () => {
    expect(() => parseDeliveryInput({
      briefId: uuid,
      action: "refuse",
      conditionsVersion: null,
      links: [],
      comment: null,
    })).toThrow(/motif/i);
  });

  it("rejects private production fields from the published snapshot", () => {
    expect(() => parseAdminBriefInput({
      productionSourceRow: 8,
      productionSnapshot: {
        date: "2026-11-20",
        athlete: "Athlète",
        notes: "Coordonnées privées",
      },
      title: "Match",
      creativeType: "photo",
      athletes: [{ id: "athlete-stable-id", name: "Athlète" }],
      scheduledDate: "2026-11-20",
      dateToAgree: false,
      region: "Vaud",
      locationDetails: "Lausanne",
      objective: "Couverture",
      deliverables: "20 photos",
      deliveryDueDate: "2026-11-22",
      compensation: { type: "unpaid_collaboration", amountMinor: null, currency: null },
      expensesCovered: false,
      expenseTerms: "Aucun frais pris en charge.",
      creditsAndUsage: "Crédit obligatoire, usage réseaux sociaux.",
      necessaryContactDetails: null,
      recipientIds: [uuid],
    })).toThrow(/non autorisées/i);
  });
});

describe("production creative migration guarantees", () => {
  const migration = readFileSync(
    "db/migrations/20261107_production_creative_space_v1.sql",
    "utf8",
  );
  const adminRepository = readFileSync("lib/admin-production-creative.ts", "utf8");

  it("uses UUID briefs instead of mutable sheet rows for relations", () => {
    expect(migration).toMatch(/id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    expect(migration).toMatch(/Indice de rapprochement uniquement/);
    expect(migration).not.toMatch(/FOREIGN KEY\s*\([^)]*production_source_row/i);
  });

  it("prevents concurrent double assignment", () => {
    expect(migration).toMatch(/production_creative_assignments_active_brief_unique_idx/);
    expect(migration).toMatch(/WHERE status = 'active'/);
    expect(adminRepository).toMatch(/FOR UPDATE/);
    expect(adminRepository).toMatch(/assigned_creative_profile_id IS NULL/);
  });

  it("does not publish the source production when delivery is validated", () => {
    expect(adminRepository).not.toMatch(/published\s*=\s*true/i);
    expect(adminRepository).not.toMatch(
      /updateShooting|addShooting|ShootingService|spreadsheets\.values\.(?:update|append)/i,
    );
  });

  it("keeps future athlete requests as origins, not assignments", () => {
    expect(migration).toMatch(/origin_type.*admin_production/);
    expect(migration).toMatch(/athlete_session_request/);
    expect(migration).toMatch(/planning_timezone TEXT NOT NULL DEFAULT 'Europe\/Zurich'/);
  });

  it("keeps immutable condition versions and historical assignments", () => {
    expect(migration).toMatch(/production_creative_condition_versions/);
    expect(migration).toMatch(/status IN \('active', 'refused', 'superseded'\)/);
    expect(adminRepository).toMatch(/conditions_version = proposed\.conditions_version \+ 1/);
    expect(adminRepository).toMatch(/confirmation_status = 'confirmation_required'/);
  });
});

describe("production source anchor", () => {
  const first = {
    date: "2026-11-20",
    type: "Match",
    athlete: "Athlète",
    sport: "Basketball",
    location: "Lausanne",
    objective: "Couverture",
  };
  const second = { ...first, athlete: "Autre athlète" };
  const firstFingerprint = buildProductionSourceFingerprint(first);
  const secondFingerprint = buildProductionSourceFingerprint(second);

  it("does not silently follow a reordered or modified row", () => {
    expect(classifyProductionSourceAnchor([
      { row: 4, fingerprint: secondFingerprint },
      { row: 5, fingerprint: firstFingerprint },
    ], 4, firstFingerprint)).toBe("source_changed");
  });

  it("rejects indistinguishable duplicate productions as ambiguous", () => {
    expect(classifyProductionSourceAnchor([
      { row: 4, fingerprint: firstFingerprint },
      { row: 5, fingerprint: firstFingerprint },
    ], 4, firstFingerprint)).toBe("ambiguous");
  });

  it("accepts only a unique exact source anchor", () => {
    expect(classifyProductionSourceAnchor([
      { row: 4, fingerprint: firstFingerprint },
      { row: 5, fingerprint: secondFingerprint },
    ], 4, firstFingerprint)).toBe("exact");
  });
});
