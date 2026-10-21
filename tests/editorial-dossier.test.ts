import { describe, expect, it } from "vitest";
import {
  buildEditorialDossier,
  projectEditorialDossier,
} from "@/services/editorial-dossier/builder";
import {
  editorialDossierItems,
  editorialDossierSubject,
  securedEditorialCollectionFixture,
} from "@/tests/fixtures/editorial-dossier";

const build = (role: "admin" | "media" = "admin") =>
  buildEditorialDossier({
    collection: securedEditorialCollectionFixture,
    authenticatedWorkspaceId: "workspace-1",
    subject: editorialDossierSubject,
    role,
  });

describe("canonical EditorialDossier", () => {
  it("is deterministic and keeps stable identifiers regardless of input item order", () => {
    const first = build();
    const second = build();
    const reordered = buildEditorialDossier({
      collection: {
        ...securedEditorialCollectionFixture,
        items: [...securedEditorialCollectionFixture.items].reverse(),
      },
      authenticatedWorkspaceId: "workspace-1",
      subject: editorialDossierSubject,
      role: "admin",
    });

    expect(second).toEqual(first);
    expect(reordered).toEqual(first);
    expect(first.dossierId).toMatch(/^dossier-[a-f0-9]{24}$/);
    expect(first.facts.every((fact) => /^fact-[a-f0-9]{24}$/.test(fact.factId))).toBe(true);
    expect(first.sources.every((source) => /^source-[a-f0-9]{24}$/.test(source.sourceId))).toBe(true);
  });

  it("projects Admin and Media through the central visibility matrix", () => {
    const admin = build("admin");
    const media = projectEditorialDossier(admin, "media");

    expect(admin.visibilityProjection).toBe("admin");
    expect(media.visibilityProjection).toBe("media");
    expect(media.subject).toMatchObject({
      canonicalId: "athlete-1",
      displayName: "Mila Martin",
      sport: "Football",
      clubOrOrganization: "FC Lausanne",
      publicRoleOrPosition: "Attaquante",
    });
    expect(JSON.stringify(admin)).toContain("Douleur au genou strictement privee");
    expect(JSON.stringify(admin)).toContain("Rendez-vous interne vendredi matin");
    expect(JSON.stringify(media)).not.toContain("Douleur au genou strictement privee");
    expect(JSON.stringify(media)).not.toContain("Rendez-vous interne vendredi matin");
    expect(JSON.stringify(media)).not.toContain("health:athlete-1");
    expect(JSON.stringify(media)).not.toContain("weekly:athlete-1");
  });

  it("keeps manual information unverified and previous content as editorial leads", () => {
    const dossier = build();
    const manual = dossier.editorialLeads.find((lead) => lead.sourceItemIds.includes("manual-note"));
    const previous = dossier.editorialLeads.find((lead) => lead.sourceItemIds.includes("previous-content"));

    expect(manual).toMatchObject({
      verificationStatus: "user_provided",
      confidence: { level: "low" },
      formulation: "Explorer son rapport au collectif",
    });
    expect(previous?.category).toBe("generated_reference");
    expect(dossier.facts.some((fact) => fact.sourceItemIds.includes("manual-note"))).toBe(false);
    expect(dossier.facts.some((fact) => fact.sourceItemIds.includes("previous-content"))).toBe(false);
  });

  it("keeps a user-provided verbatim quote attributed and out of verified facts", () => {
    const dossier = build();
    const citation = dossier.citations.find((item) => item.text === "Je veux progresser avec le groupe.");

    expect(citation).toMatchObject({
      author: "Mila Martin",
      date: "2026-10-20T00:00:00.000Z",
      verificationStatus: "user_provided",
    });
    expect(dossier.facts.some((fact) => fact.sourceItemIds.includes("manual-quote"))).toBe(false);
    expect(dossier.editorialLeads.find((lead) => lead.sourceItemIds.includes("manual-quote")))
      .toMatchObject({ verificationStatus: "user_provided", confidence: { level: "low" } });
  });

  it("supports a recent official source and a verified internal source without URL", () => {
    const dossier = build();
    const official = dossier.sources.find((source) => source.name === "Federation officielle");
    const internal = dossier.sources.find((source) => source.name === "Registre editorial interne");

    expect(official).toMatchObject({
      official: true,
      url: "https://federation.example/resultat",
      confidence: { level: "high" },
      visibility: "public",
    });
    expect(internal).toMatchObject({
      official: false,
      internalReference: "editorial-register:42",
      confidence: { level: "medium" },
      visibility: "workspace_internal",
    });
    expect(internal).not.toHaveProperty("url");
  });

  it("preserves contradictions and blocks every unresolved concerned fact", () => {
    const dossier = build();
    const contradiction = dossier.contradictions.find((item) => item.semanticKey === "score-match-17-octobre");

    expect(contradiction).toMatchObject({
      status: "unresolved",
      formulations: ["Le score final est 1-2", "Le score final est 2-1"],
    });
    expect(contradiction?.factIds).toHaveLength(2);
    const facts = dossier.facts.filter((fact) => contradiction?.factIds.includes(fact.factId));
    expect(facts.every((fact) => !fact.usable)).toBe(true);
    expect(facts.every((fact) => fact.blockedByContradictionIds.includes(contradiction!.contradictionId))).toBe(true);
  });

  it("distinguishes historical validity from stale information", () => {
    const dossier = build();
    const palmares = dossier.facts.find((fact) => fact.sourceItemIds.includes("crm-palmares"));
    const oldNews = dossier.facts.find((fact) => fact.sourceItemIds.includes("old-news"));

    expect(palmares?.freshness.status).toBe("historical");
    expect(oldNews?.freshness.status).toBe("stale");
    expect(oldNews?.formulation).toBe("Annonce publiee en juin");
  });

  it("explains global confidence and never exceeds the weakest usable fact", () => {
    const dossier = build();
    const usableLevels = dossier.facts.filter((fact) => fact.usable).map((fact) => fact.confidence.level);

    expect(usableLevels).toContain("low");
    expect(dossier.confidence.level).toBe("low");
    expect(dossier.confidence.reasons.join(" ")).toContain("fait exploitable le plus faible");
    expect(dossier.confidence.usableFactIds.length).toBeGreaterThan(0);
  });

  it("lists missing information and allows non-factual editorial work without facts", () => {
    const dossier = buildEditorialDossier({
      collection: {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workspaceId: "workspace-1",
        items: [],
        createdAt: "2026-10-19T10:30:00.000Z",
      },
      authenticatedWorkspaceId: "workspace-1",
      subject: {
        type: "other",
        source: "temporary",
        displayName: "Sujet temporaire",
      },
      role: "media",
    });

    expect(dossier.missingInformation.map((item) => item.code)).toEqual([
      "SUBJECT_CANONICAL_ID",
      "SUBJECT_SPORT",
      "SUBJECT_ORGANIZATION",
      "SUBJECT_PUBLIC_ROLE",
      "NO_USABLE_FACTS",
      "NO_SOURCES",
    ]);
    expect(dossier.missingInformation.find((item) => item.code === "NO_USABLE_FACTS"))
      .toMatchObject({ blocksFactualGeneration: true });
    expect(dossier.confidence.reasons.join(" ")).toContain("angles restent possibles");
  });

  it("rejects cross-workspace and unauthorized role projections", () => {
    expect(() => buildEditorialDossier({
      collection: securedEditorialCollectionFixture,
      authenticatedWorkspaceId: "workspace-2",
      subject: editorialDossierSubject,
      role: "admin",
    })).toThrow("hors workspace");

    expect(() => projectEditorialDossier(build(), "athlete" as never)).toThrow("sans acces");
  });

  it("does not invent fact formulations beyond whitespace normalization", () => {
    const dossier = build();
    const normalizedInputs = new Set(editorialDossierItems.map((item) =>
      String(item.factualStatement || item.summary).replace(/\s+/g, " ").trim()));

    for (const fact of dossier.facts) {
      expect(normalizedInputs.has(fact.formulation)).toBe(true);
    }
    for (const lead of dossier.editorialLeads) {
      expect(normalizedInputs.has(lead.formulation)).toBe(true);
    }
  });
});
