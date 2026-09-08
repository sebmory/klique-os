import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  KliqueVisibilityError,
  calculateKliqueVisibilityFormatBreakdown,
  calculateKliqueVisibilityHistoryTotals,
  calculateKliqueVisibilityPublicationTotals,
  combineKliqueVisibilityRegistryTotals,
  doKliqueVisibilityHistoryPeriodsOverlap,
  isKliqueVisibilityHistoryPeriodBeforeTracking,
  isKliqueVisibilityPublicationWithinTracking,
  kliqueVisibilityFormats,
  listKliqueVisibilityPublications,
  parseKliqueVisibilityHistoryEntryInput,
  parseKliqueVisibilityPublicationInput,
} from "@/lib/klique-visibility";

const source = fs.readFileSync(path.resolve(process.cwd(), "lib/klique-visibility.ts"), "utf8");
const migration = fs.readFileSync(
  path.resolve(process.cwd(), "db/migrations/20260910_klique_visibility_registry_v1.sql"),
  "utf8",
);
const proxySource = fs.readFileSync(path.resolve(process.cwd(), "proxy.ts"), "utf8");

describe("KLIQUE visibility publication input", () => {
  const validPublication = () => ({
    format: "carousel" as const,
    network: "instagram" as const,
    publishedAt: "2026-09-01",
    link: "https://instagram.com/p/abc123",
    athleteIds: ["athlete-1", "athlete-2"],
  });

  it("parses a valid multi-athlete publication and deduplicates athlete ids", () => {
    const parsed = parseKliqueVisibilityPublicationInput({
      ...validPublication(),
      athleteIds: ["athlete-1", "athlete-2", "athlete-1"],
    });
    expect(parsed.athleteIds).toEqual(["athlete-1", "athlete-2"]);
    expect(parsed.format).toBe("carousel");
  });

  it("accepts an optional link and defaults it to null when absent", () => {
    const { link, ...withoutLink } = validPublication();
    void link;
    const parsed = parseKliqueVisibilityPublicationInput(withoutLink);
    expect(parsed.link).toBeNull();
  });

  it("rejects an invalid format or network", () => {
    expect(() => parseKliqueVisibilityPublicationInput({ ...validPublication(), format: "podcast" }))
      .toThrow(KliqueVisibilityError);
    expect(() => parseKliqueVisibilityPublicationInput({ ...validPublication(), network: "myspace" }))
      .toThrow(KliqueVisibilityError);
  });

  it("rejects an invalid date or a non-http link", () => {
    expect(() => parseKliqueVisibilityPublicationInput({ ...validPublication(), publishedAt: "not-a-date" }))
      .toThrow(KliqueVisibilityError);
    expect(() => parseKliqueVisibilityPublicationInput({ ...validPublication(), link: "javascript:alert(1)" }))
      .toThrow(KliqueVisibilityError);
  });

  it("requires at least one athlete", () => {
    expect(() => parseKliqueVisibilityPublicationInput({ ...validPublication(), athleteIds: [] }))
      .toThrow(KliqueVisibilityError);
  });

  it("rejects unknown fields", () => {
    expect(() => parseKliqueVisibilityPublicationInput({ ...validPublication(), extra: true }))
      .toThrow(KliqueVisibilityError);
  });
});

describe("KLIQUE visibility history entry input", () => {
  it("parses a valid global entry without an athlete", () => {
    const parsed = parseKliqueVisibilityHistoryEntryInput({
      scope: "global",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      format: "photo",
      network: "instagram",
      quantity: 42,
    });
    expect(parsed.athleteId).toBeNull();
    expect(parsed.quantity).toBe(42);
  });

  it("parses a valid athlete-scoped entry", () => {
    const parsed = parseKliqueVisibilityHistoryEntryInput({
      scope: "athlete",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      format: "video",
      network: "tiktok",
      athleteId: "athlete-1",
      quantity: 5,
    });
    expect(parsed.athleteId).toBe("athlete-1");
  });

  it("rejects a global scope carrying an athlete, and an athlete scope missing one", () => {
    expect(() => parseKliqueVisibilityHistoryEntryInput({
      scope: "global",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      format: "photo",
      network: "instagram",
      athleteId: "athlete-1",
      quantity: 1,
    })).toThrow(KliqueVisibilityError);

    expect(() => parseKliqueVisibilityHistoryEntryInput({
      scope: "athlete",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      format: "photo",
      network: "instagram",
      quantity: 1,
    })).toThrow(KliqueVisibilityError);
  });

  it("rejects a period ending before it starts", () => {
    expect(() => parseKliqueVisibilityHistoryEntryInput({
      scope: "global",
      periodStart: "2025-12-31",
      periodEnd: "2025-01-01",
      format: "photo",
      network: "instagram",
      quantity: 1,
    })).toThrow(KliqueVisibilityError);
  });

  it("rejects a non-positive or non-integer quantity", () => {
    expect(() => parseKliqueVisibilityHistoryEntryInput({
      scope: "global",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      format: "photo",
      network: "instagram",
      quantity: 0,
    })).toThrow(KliqueVisibilityError);

    expect(() => parseKliqueVisibilityHistoryEntryInput({
      scope: "global",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      format: "photo",
      network: "instagram",
      quantity: 2.5,
    })).toThrow(KliqueVisibilityError);
  });
});

describe("KLIQUE visibility publication totals", () => {
  it("counts a multi-athlete publication once in total and once per athlete", () => {
    const totals = calculateKliqueVisibilityPublicationTotals([
      { id: "pub-1", athleteIds: ["athlete-1", "athlete-2"] },
    ]);
    expect(totals.totalPublications).toBe(1);
    expect(totals.perAthlete).toEqual({ "athlete-1": 1, "athlete-2": 1 });
  });

  it("counts a carousel as a single publication like any other format", () => {
    const totals = calculateKliqueVisibilityPublicationTotals([
      { id: "pub-1", athleteIds: ["athlete-1"] },
      { id: "pub-2", athleteIds: ["athlete-1", "athlete-2", "athlete-3"] },
    ]);
    expect(totals.totalPublications).toBe(2);
    expect(totals.perAthlete["athlete-1"]).toBe(2);
    expect(totals.perAthlete["athlete-2"]).toBe(1);
    expect(totals.perAthlete["athlete-3"]).toBe(1);
  });

  it("does not double count when the same athlete id appears twice on one publication", () => {
    const totals = calculateKliqueVisibilityPublicationTotals([
      { id: "pub-1", athleteIds: ["athlete-1", "athlete-1"] },
    ]);
    expect(totals.perAthlete["athlete-1"]).toBe(1);
  });
});

describe("KLIQUE visibility history totals", () => {
  it("derives the global total only from scope='global' rows, never by summing athlete rows", () => {
    const totals = calculateKliqueVisibilityHistoryTotals([
      { scope: "global", athleteId: null, quantity: 100 },
      { scope: "athlete", athleteId: "athlete-1", quantity: 30 },
      { scope: "athlete", athleteId: "athlete-2", quantity: 40 },
    ]);
    expect(totals.globalTotal).toBe(100);
    // Somme des lignes par athlete (70) volontairement differente du total global (100): aucune deduction attendue.
    const summedAthletes = Object.values(totals.perAthlete).reduce((sum, value) => sum + value, 0);
    expect(summedAthletes).not.toBe(totals.globalTotal);
    expect(totals.perAthlete).toEqual({ "athlete-1": 30, "athlete-2": 40 });
  });

  it("ignores rows with an inconsistent missing athlete id under scope='athlete'", () => {
    const totals = calculateKliqueVisibilityHistoryTotals([
      { scope: "athlete", athleteId: null, quantity: 10 },
    ]);
    expect(totals.perAthlete).toEqual({});
    expect(totals.globalTotal).toBe(0);
  });
});

describe("KLIQUE visibility registry combined totals", () => {
  it("keeps publications and historical totals separate, adding them only at the end", () => {
    const publicationTotals = calculateKliqueVisibilityPublicationTotals([
      { id: "pub-1", athleteIds: ["athlete-1", "athlete-2"] },
    ]);
    const historyTotals = calculateKliqueVisibilityHistoryTotals([
      { scope: "global", athleteId: null, quantity: 50 },
      { scope: "athlete", athleteId: "athlete-1", quantity: 5 },
    ]);

    const combined = combineKliqueVisibilityRegistryTotals(publicationTotals, historyTotals);

    expect(combined.totalPublications).toBe(1);
    expect(combined.totalHistorical).toBe(50);
    expect(combined.combinedTotal).toBe(51);
    expect(combined.perAthlete["athlete-1"]).toEqual({ publications: 1, historical: 5, combined: 6 });
    expect(combined.perAthlete["athlete-2"]).toEqual({ publications: 1, historical: 0, combined: 1 });
  });
});

describe("KLIQUE visibility workspace isolation", () => {
  it("rejects a blank workspace instead of silently querying without isolation", async () => {
    await expect(listKliqueVisibilityPublications("   ")).rejects.toThrow(KliqueVisibilityError);
  });

  it("scopes every persistence query to the workspace and never references credits or service requests", () => {
    expect(source).toContain("WHERE publication.workspace_id = ${resolvedWorkspaceId}");
    expect(source).toContain("WHERE workspace_id = ${resolvedWorkspaceId}");
    expect(source).not.toMatch(/athlete_credit_purchases|athlete_credit_movements|athlete_credit_purchase_executions|athlete_service_requests/);
  });

  it("inserts a publication and its athlete links atomically", () => {
    expect(source).toContain("sql.transaction([insertPublication, ...insertAthletes])");
  });
});

describe("KLIQUE visibility registry migration", () => {
  it("creates the publications, athlete links, and history tables without inserting data", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS klique_visibility_publications");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS klique_visibility_publication_athletes");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS klique_visibility_history_entries");
    expect(migration).not.toMatch(/INSERT\s+INTO/i);
  });

  it("allows carousel as a publication format", () => {
    expect(migration).toContain("'photo', 'video', 'carousel', 'story', 'reel', 'article', 'live', 'other'");
  });

  it("ties history scope to athlete presence and prevents deriving a global total from athlete rows", () => {
    expect(migration).toContain("(scope = 'global' AND athlete_id IS NULL)");
    expect(migration).toContain("(scope = 'athlete' AND athlete_id IS NOT NULL AND btrim(athlete_id) <> '')");
  });

  it("never references credits, purchases, or service request tables", () => {
    expect(migration).not.toMatch(/athlete_credit_purchases|athlete_credit_movements|athlete_credit_purchase_executions|athlete_service_requests/);
  });
});

describe("KLIQUE visibility tracking start date", () => {
  it("treats a publication dated at or after tracking start as within tracking", () => {
    expect(isKliqueVisibilityPublicationWithinTracking("2026-01-01", "2026-01-01")).toBe(true);
    expect(isKliqueVisibilityPublicationWithinTracking("2026-01-02", "2026-01-01")).toBe(true);
    expect(isKliqueVisibilityPublicationWithinTracking("2025-12-31", "2026-01-01")).toBe(false);
  });

  it("treats a history period as historical only when it ends strictly before tracking start", () => {
    expect(isKliqueVisibilityHistoryPeriodBeforeTracking("2025-12-31", "2026-01-01")).toBe(true);
    expect(isKliqueVisibilityHistoryPeriodBeforeTracking("2026-01-01", "2026-01-01")).toBe(false);
    expect(isKliqueVisibilityHistoryPeriodBeforeTracking("2026-01-02", "2026-01-01")).toBe(false);
  });

  it("requires a configured tracking start date before creating a publication or history entry", () => {
    expect(source).toContain("tracking_start_missing");
    expect(source).toContain("requireTrackingStartDate");
    expect(source).toContain("await requireTrackingStartDate(resolvedWorkspaceId)");
  });

  it("blocks changing an existing tracking start date once a publication or history entry exists", () => {
    expect(source).toContain("tracking_start_locked");
    expect(source).toContain("existingSettings.trackingStartDate !== normalizedDate");
    expect(source).toContain("counts.publications > 0 || counts.history_entries > 0");
  });

  it("reads DATE columns using local date parts, never toISOString, to avoid a Neon local-timezone off-by-one-day shift", () => {
    expect(source).toContain("date.getFullYear()");
    expect(source).toContain("date.getMonth() + 1");
    expect(source).toContain("date.getDate()");
    const toIsoDateBody = source.slice(source.indexOf("const toIsoDate ="), source.indexOf("const toIsoDateTime ="));
    expect(toIsoDateBody).not.toMatch(/toISOString/);
  });

  it("prepares the per-workspace tracking settings table and enforcement triggers, not yet executed", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS klique_visibility_tracking_settings");
    expect(migration).toContain("klique_visibility_enforce_publication_tracking_start");
    expect(migration).toContain("klique_visibility_enforce_history_before_tracking_start");
    expect(migration).toContain("NEW.published_at < tracking_start");
    expect(migration).toContain("NEW.period_end >= tracking_start");
    expect(migration).not.toMatch(/INSERT\s+INTO/i);
  });
});

describe("KLIQUE visibility overlapping historical periods", () => {
  const category = {
    scope: "athlete" as const,
    athleteId: "athlete-1",
    format: "photo" as const,
    network: "instagram" as const,
  };

  it("detects an overlap for the same category with intersecting periods", () => {
    const overlaps = doKliqueVisibilityHistoryPeriodsOverlap(
      { ...category, periodStart: "2025-01-01", periodEnd: "2025-06-30" },
      { ...category, periodStart: "2025-06-01", periodEnd: "2025-12-31" },
    );
    expect(overlaps).toBe(true);
  });

  it("does not flag adjacent, non-overlapping periods for the same category", () => {
    const overlaps = doKliqueVisibilityHistoryPeriodsOverlap(
      { ...category, periodStart: "2025-01-01", periodEnd: "2025-06-30" },
      { ...category, periodStart: "2025-07-01", periodEnd: "2025-12-31" },
    );
    expect(overlaps).toBe(false);
  });

  it("ignores identical periods across a different scope, athlete, format, or network", () => {
    const base = { ...category, periodStart: "2025-01-01", periodEnd: "2025-06-30" };
    expect(doKliqueVisibilityHistoryPeriodsOverlap(base, { ...base, athleteId: "athlete-2" })).toBe(false);
    expect(doKliqueVisibilityHistoryPeriodsOverlap(base, { ...base, format: "video" })).toBe(false);
    expect(doKliqueVisibilityHistoryPeriodsOverlap(base, { ...base, network: "tiktok" })).toBe(false);
    expect(doKliqueVisibilityHistoryPeriodsOverlap(base, { ...base, scope: "global", athleteId: null })).toBe(false);
  });

  it("treats every global entry as the same category since athlete_id is always null", () => {
    const globalA = { scope: "global" as const, athleteId: null, format: "photo" as const, network: "instagram" as const, periodStart: "2025-01-01", periodEnd: "2025-06-30" };
    const globalB = { ...globalA, periodStart: "2025-06-15", periodEnd: "2025-12-31" };
    expect(doKliqueVisibilityHistoryPeriodsOverlap(globalA, globalB)).toBe(true);
  });

  it("blocks overlapping periods for the same category via a database exclusion constraint, safe under concurrent inserts", () => {
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS btree_gist");
    expect(migration).toContain("GENERATED ALWAYS AS (daterange(period_start, period_end, '[]')) STORED");
    expect(migration).toContain("ADD CONSTRAINT klique_visibility_history_entries_no_overlap_excl");
    expect(migration).toContain("EXCLUDE USING gist (");
    expect(migration).toContain("workspace_id WITH =,");
    expect(migration).toContain("scope WITH =,");
    expect(migration).toContain("format WITH =,");
    expect(migration).toContain("network WITH =,");
    expect(migration).toContain("COALESCE(athlete_id, '') WITH =,");
    expect(migration).toContain("period WITH &&");
  });
});

describe("KLIQUE visibility per-format breakdown for a single athlete", () => {
  it("counts one unit per tracked publication and sums historical quantities, per format", () => {
    const breakdown = calculateKliqueVisibilityFormatBreakdown(
      [{ format: "photo" }, { format: "photo" }, { format: "reel" }],
      [{ format: "photo", quantity: 5 }, { format: "video", quantity: 2 }],
    );
    const photo = breakdown.find((row) => row.format === "photo");
    const reel = breakdown.find((row) => row.format === "reel");
    const video = breakdown.find((row) => row.format === "video");
    const story = breakdown.find((row) => row.format === "story");
    expect(photo).toEqual({ format: "photo", tracked: 2, historical: 5, combined: 7 });
    expect(reel).toEqual({ format: "reel", tracked: 1, historical: 0, combined: 1 });
    expect(video).toEqual({ format: "video", tracked: 0, historical: 2, combined: 2 });
    expect(story).toEqual({ format: "story", tracked: 0, historical: 0, combined: 0 });
  });

  it("returns every known format even with no data at all", () => {
    const breakdown = calculateKliqueVisibilityFormatBreakdown([], []);
    expect(breakdown).toHaveLength(kliqueVisibilityFormats.length);
    expect(breakdown.every((row) => row.combined === 0)).toBe(true);
  });
});

describe("KLIQUE visibility athlete-scoped API", () => {
  it("strips co-tagged athlete ids and returns only the requesting athlete's own publications and format/link fields", () => {
    const athleteRouteSource = fs.readFileSync(
      path.resolve(process.cwd(), "app/api/athlete/klique-visibility/route.ts"),
      "utf8",
    );
    expect(athleteRouteSource).toContain("ownPublications");
    expect(athleteRouteSource).toContain('publication.athleteIds.includes(athleteId)');
    expect(athleteRouteSource).not.toMatch(/athleteIds:/);
    expect(athleteRouteSource).toContain('entry.scope === "athlete" && entry.athleteId === athleteId');
  });

  it("requires an active athlete role with a resolved workspace and athleteId from the session", () => {
    const athleteRouteSource = fs.readFileSync(
      path.resolve(process.cwd(), "app/api/athlete/klique-visibility/route.ts"),
      "utf8",
    );
    expect(athleteRouteSource).toContain('access?.role !== "athlete"');
    expect(athleteRouteSource).toContain('access.status !== "active"');
    expect(athleteRouteSource).toContain("!workspaceId || !athleteId");
  });

  it("is allow-listed for the athlete role in the proxy without opening it to other roles", () => {
    expect(proxySource).toContain('pathname === "/api/athlete/klique-visibility"');
  });
});

describe("KLIQUE visibility admin update and delete", () => {
  it("re-validates tracking-start rules and workspace ownership before updating a publication, atomically with its athlete links", () => {
    expect(source).toContain("export const updateKliqueVisibilityPublication");
    expect(source).toContain("export const deleteKliqueVisibilityPublication");
    expect(source).toContain("publication_not_found");
    // Verifie l'existence dans le workspace avant la transaction pour ne jamais inserer de liens orphelins.
    const updateBody = source.slice(
      source.indexOf("export const updateKliqueVisibilityPublication"),
      source.indexOf("export const deleteKliqueVisibilityPublication"),
    );
    expect(updateBody).toContain("requireTrackingStartDate(resolvedWorkspaceId)");
    expect(updateBody).toContain("isKliqueVisibilityPublicationWithinTracking(input.publishedAt, trackingStartDate)");
    expect(updateBody).toContain("SELECT id FROM klique_visibility_publications WHERE id = ${id} AND workspace_id = ${resolvedWorkspaceId}");
    expect(updateBody).toContain("sql.transaction([updatePublication, deleteAthletes, ...insertAthletes])");
  });

  it("re-validates tracking-start and overlap rules before updating a history entry, and requires workspace ownership to delete", () => {
    expect(source).toContain("export const updateKliqueVisibilityHistoryEntry");
    expect(source).toContain("export const deleteKliqueVisibilityHistoryEntry");
    expect(source).toContain("history_entry_not_found");
    const updateBody = source.slice(
      source.indexOf("export const updateKliqueVisibilityHistoryEntry"),
      source.indexOf("export const deleteKliqueVisibilityHistoryEntry"),
    );
    expect(updateBody).toContain("requireTrackingStartDate(resolvedWorkspaceId)");
    expect(updateBody).toContain("isKliqueVisibilityHistoryPeriodBeforeTracking(input.periodEnd, trackingStartDate)");
    expect(updateBody).toContain("WHERE id = ${id} AND workspace_id = ${resolvedWorkspaceId}");
  });

  it("never references athlete credits or service requests from the update/delete paths", () => {
    expect(source).not.toMatch(/athlete_credit_purchases|athlete_credit_movements|athlete_credit_purchase_executions|athlete_service_requests/);
  });
});

describe("KLIQUE visibility admin route: update/delete actions", () => {
  const routeSource = fs.readFileSync(
    path.resolve(process.cwd(), "app/api/admin/klique-visibility/route.ts"),
    "utf8",
  );

  it("exposes update_publication, delete_publication, update_history_entry and delete_history_entry via PATCH, gated by the same admin workspace check", () => {
    expect(routeSource).toContain('async PATCH(request: Request) {');
    expect(routeSource).toContain('"update_publication"');
    expect(routeSource).toContain('"delete_publication"');
    expect(routeSource).toContain('"update_history_entry"');
    expect(routeSource).toContain('"delete_history_entry"');
    expect(routeSource).toContain("await getAdminWorkspace(request, dependencies)");
  });

  it("validates ids with the same UUID pattern used elsewhere before touching the database", () => {
    expect(routeSource).toContain("idPattern.test(publicationId)");
    expect(routeSource).toContain("idPattern.test(historyEntryId)");
  });

  it("maps not-found errors to 404 so the admin UI can show a clear message", () => {
    expect(routeSource).toContain("publication_not_found: 404");
    expect(routeSource).toContain("history_entry_not_found: 404");
  });
});
