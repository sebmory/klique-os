import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCreativeMissionRegularizationPayload,
  creativeMissionRegularizationFixtures,
} from "@/fixtures/creative-mission-regularization";
import { parseScriptMode } from "@/lib/production-script-safety";

const migration = readFileSync(
  "db/migrations/20261113_canonical_creative_missions_v1.sql",
  "utf8",
);
const route = readFileSync("app/api/admin/missions/route.ts", "utf8");
const script = readFileSync("scripts/regularize-creative-missions.ts", "utf8");

describe("canonical creative mission schema", () => {
  it("creates an additive multi-athlete projection with immutable provenance", () => {
    for (const table of [
      "creative_missions",
      "creative_mission_athletes",
      "creative_mission_links",
      "creative_mission_events",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(migration).toContain("record_kind IN ('mission', 'historical_entry')");
    expect(migration).toContain("creative_mission_athletes_mission_workspace_fk");
    expect(migration).toContain("creative_mission_links_source_unique_idx");
    expect(migration).toContain("creative_mission_events_immutable");
    expect(migration).toContain("creative_mission_links_immutable");
    expect(migration).toContain("RAISE EXCEPTION '% is immutable'");
  });

  it("projects modern sources without replacing their execution engine", () => {
    expect(migration).toContain("athlete_session_requests_canonical_projection");
    expect(migration).toContain("production_creative_briefs_canonical_projection");
    expect(migration).toContain("production_creative_assignments_canonical_projection");
    expect(migration).toContain("production_creative_events_canonical_journal");
    expect(migration).not.toMatch(/INSERT\s+INTO\s+production_creative_applications/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+production_creative_assignments/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+creative_mission_executions/i);
  });

  it("serves only the canonical projection from the Admin mission endpoint", () => {
    expect(route).toContain("listCanonicalCreativeMissions");
    expect(route).not.toContain("listAdminCreativeMissions");
  });
});

describe("approved historical regularization fixtures", () => {
  it("contains exactly five completed physical missions and two closed test entries", () => {
    expect(creativeMissionRegularizationFixtures).toHaveLength(7);
    expect(creativeMissionRegularizationFixtures.filter(
      (fixture) => fixture.recordKind === "mission",
    )).toHaveLength(5);
    expect(creativeMissionRegularizationFixtures.filter(
      (fixture) => fixture.recordKind === "historical_entry",
    )).toHaveLength(2);
  });

  it("links exactly twelve completed services and two refused tests", () => {
    const services = creativeMissionRegularizationFixtures.flatMap((fixture) => fixture.services);
    expect(services).toHaveLength(14);
    expect(services.filter((service) => service.status === "completed")).toHaveLength(12);
    expect(services.filter((service) => service.status === "refused")).toHaveLength(2);
    expect(new Set(services.map((service) => service.requestId)).size).toBe(14);
  });

  it("uses the corrected multi-athlete Media Day groupings", () => {
    const completed = creativeMissionRegularizationFixtures.filter(
      (fixture) => fixture.recordKind === "mission",
    );
    expect(completed.map((fixture) => ({
      title: fixture.title,
      athletes: fixture.athletes.map((athlete) => athlete.id),
      services: fixture.services.length,
    }))).toEqual([
      {
        title: "Media Day — Armand Angha & Raphaël Monty",
        athletes: ["armand-angha", "raphael-monty"],
        services: 4,
      },
      {
        title: "Media Day — Herez Moussa",
        athletes: ["herez-moussa"],
        services: 2,
      },
      {
        title: "Media Day — Chiona Kapinga & Veronika Bernardini",
        athletes: ["chiona-kapinga", "veronika-bernardini"],
        services: 4,
      },
      {
        title: "Photos en match — Matheus Monteiro",
        athletes: ["matheus-monteiro"],
        services: 1,
      },
      {
        title: "Photos en match — Abdou Böbödi Camara",
        athletes: ["abdou-bobodi-camara"],
        services: 1,
      },
    ]);
  });

  it("preserves raw Sheet contradictions as evidence snapshots", () => {
    const productions = buildCreativeMissionRegularizationPayload().records
      .flatMap((record) => record.productions);
    expect(productions).toHaveLength(2);
    expect(productions.every((item) => item.fingerprint.length === 64)).toBe(true);
    expect(productions.map((item) => item.snapshot)).toEqual([
      expect.objectContaining({ shootingDone: false, published: true, status: "En cours" }),
      expect.objectContaining({ shootingDone: false, published: true, status: "Planifié" }),
    ]);
  });

  it("keeps execution explicit and opt-in", () => {
    expect(parseScriptMode([])).toEqual({ apply: false, skipConfirmation: false });
    expect(parseScriptMode(["--apply"])).toEqual({ apply: true, skipConfirmation: false });
    expect(script).toContain("Dry-run uniquement");
    expect(script).toContain("completedMissionServiceLinks");
    expect(script).toContain("closedEntryRequestLinks");
    expect(script).toContain("activeHistoricalMissions");
    expect(script).toContain("runCreativeMissionRegularization");
  });
});
