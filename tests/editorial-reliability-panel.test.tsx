// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorialReliabilityPanel } from "@/components/contents/EditorialReliabilityPanel";

describe("EditorialReliabilityPanel", () => {
  it("renders an accessible compact French reliability block", () => {
    const html = renderToStaticMarkup(
      <EditorialReliabilityPanel
        metadata={{
          dossierRevision: 1,
          generationMode: "limited",
          confidence: {
            level: "medium",
            score: 65,
            explanation: ["Une source reste a confirmer."],
          },
          usedSources: [{
            name: "Federation officielle",
            url: "https://federation.example/resultat",
            official: true,
            confidence: "high",
          }],
          userProvidedMaterials: [{
            kind: "verbatim_quote",
            text: "Je veux progresser avec le groupe.",
            provenance: "Entretien KLIQUE",
            date: "2026-10-20T00:00:00.000Z",
            speaker: "Mila Martin",
          }],
          contradictions: ["Le score publie differe selon deux sources."],
          missingInformation: ["Role public non renseigne."],
          warnings: ["Verifier avant publication."],
        }}
      />,
    );

    expect(html).toContain("<button");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls=");
    expect(html).toContain("hidden=");
    expect(html).toContain("Fiabilité et sources");
    expect(html).toContain("Génération limitée");
    expect(html).toContain("Sources utilisées");
    expect(html).toContain("Matière fournie par l’utilisateur");
    expect(html).toContain("ne sont pas vérifiés indépendamment");
    expect(html).toContain("Mila Martin");
    expect(html).toContain("Informations manquantes");
    expect(html).toContain("Contradictions non tranchées");
    expect(html).toContain("Certains éléments restent à vérifier");
  });
});
