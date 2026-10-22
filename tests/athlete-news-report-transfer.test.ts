import { describe, expect, it } from "vitest";
import { buildAthleteNewsEditorialMaterial } from "@/services/athlete-news-reports";

describe("athlete news report Article transfer", () => {
  it("transfers the exact message as an unverified note, never a quote", () => {
    const material = buildAthleteNewsEditorialMaterial({
      reportId: "11111111-1111-4111-8111-111111111111",
      athleteId: "athlete-1",
      message: "Je participe au tournoi samedi.",
      eventDate: "2026-10-24",
      externalUrl: "https://example.test/source",
      photoHref: "/api/athlete-news-reports/report/photo",
      provenance: "Déclaration directe de l’athlète — non vérifiée indépendamment.",
    });

    expect(material).toEqual({
      id: "athlete-news-report-11111111-1111-4111-8111-111111111111",
      kind: "note",
      text: "Je participe au tournoi samedi.",
      provenance: "Déclaration directe de l’athlète — non vérifiée indépendamment.",
      sourceDate: "2026-10-24",
    });
    expect(material).not.toHaveProperty("speaker");
  });
});
