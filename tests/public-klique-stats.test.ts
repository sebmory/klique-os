import { describe, expect, it } from "vitest";
import { calculatePublicKliqueStats } from "@/lib/public-klique-stats";

describe("public KLIQUE statistics", () => {
  it("counts only canonical public athletes and deduplicates normalized sports", () => {
    const stats = calculatePublicKliqueStats(
      [
        { row: 4, athleteId: "athlete-1", name: "Mila", sport: "Football", status: "Actif" },
        { row: 5, athleteId: "athlete-2", name: "Noa", sport: "Foot U17", status: "Membre" },
        { row: 6, athleteId: "athlete-3", name: "Alex", sport: "Basket U18", status: "Actif" },
        { row: 7, athleteId: "athlete-4", name: "Sam", sport: "", status: "Actif" },
        { row: 0, athleteId: "virtual-form", name: "Formulaire", sport: "Tennis", status: "Actif" },
        { row: 8, athleteId: "seb-mory", name: "Profil masqué", sport: "Badminton", status: "Actif" },
        { row: 9, athleteId: "inactive", name: "Ancien membre", sport: "Judo", status: "Inactif" },
        { row: 10, athleteId: "prospect", name: "Prospect", sport: "Handball", status: "Prospect" },
      ],
      [],
    );

    expect(stats).toEqual({ athleteCount: 4, partnerExpertCount: 0, sportCount: 2 });
  });

  it("counts only active canonical partner and expert records", () => {
    const stats = calculatePublicKliqueStats(
      [],
      [
        { row: 4, name: "Partenaire actif", status: "Actif", relationType: "Partenaire", category: "Conseil", expertKlique: false },
        { row: 5, name: "Expert actif", status: "ACTIF", type: "Expert KLIQUE", category: "Mental", expertKlique: true },
        { row: 6, name: "Média actif", status: "Actif", relationType: "Média", category: "Média", expertKlique: false },
        { row: 7, name: "Partenaire inactif", status: "Inactif", relationType: "Partenaire", category: "Conseil", expertKlique: false },
        { row: 0, name: "Demande en attente", status: "Actif", relationType: "Partenaire", category: "Conseil", expertKlique: false },
      ],
    );

    expect(stats).toEqual({ athleteCount: 0, partnerExpertCount: 2, sportCount: 0 });
  });

  it.each(["Test", " test ", "TEST"])("excludes active partner and expert records in the %j category", (category) => {
    const athletes = [
      { row: 4, athleteId: "athlete-1", name: "Mila", sport: "Football", status: "Actif" },
      { row: 5, athleteId: "athlete-2", name: "Noa", sport: "Basketball", status: "Actif" },
    ];
    const testPartner = {
      row: 6,
      name: "Fiche interne",
      status: "Actif",
      relationType: "Expert",
      category,
      expertKlique: true,
    };
    const partners = [
      { row: 4, name: "Partenaire public", status: "Actif", relationType: "Partenaire", category: "Conseil", expertKlique: false },
      { row: 5, name: "Expert public", status: "Actif", relationType: "Expert", category: "Performance", expertKlique: true },
      testPartner,
    ];

    const stats = calculatePublicKliqueStats(athletes, partners);

    expect(stats).toEqual({ athleteCount: 2, partnerExpertCount: 2, sportCount: 2 });
    expect(testPartner).toEqual({
      row: 6,
      name: "Fiche interne",
      status: "Actif",
      relationType: "Expert",
      category,
      expertKlique: true,
    });
    expect(partners).toContain(testPartner);
  });

  it("keeps counting an active partner when its category is absent", () => {
    const stats = calculatePublicKliqueStats([], [
      { row: 4, name: "Partenaire sans catégorie", status: "Actif", relationType: "Partenaire", expertKlique: false },
    ]);

    expect(stats.partnerExpertCount).toBe(1);
  });
});