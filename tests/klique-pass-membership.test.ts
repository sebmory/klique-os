import { describe, expect, it } from "vitest";
import type { AthleteMembership, CurrentAthleteMembership } from "@/lib/athlete-memberships";
import { buildKliquePassViewModel } from "@/lib/klique-pass";

const founderMembership: AthleteMembership = {
  id: "legacy-founder-klique-os-athlete-stable-id",
  workspaceId: "klique-os",
  athleteId: "athlete-stable-id",
  membershipKind: "founder",
  planCode: null,
  status: "active",
  startsAt: "2026-06-10T07:41:46.000Z",
  endsAt: "2027-06-10T07:41:46.000Z",
  autoRenew: false,
  paymentInstallments: null,
  source: "legacy_founder_migration",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const athlete = {
  key: "athlete-stable-id",
  name: "Athlète Test",
  sport: "Athlétisme",
  adhesionDate: "10/06/2026 09:41:46",
};

const neonMembership = (
  status: CurrentAthleteMembership["status"],
  isActive: boolean,
): CurrentAthleteMembership => ({
  origin: "neon",
  membership: founderMembership,
  status,
  isActive,
  startsAt: founderMembership.startsAt,
  endsAt: founderMembership.endsAt,
});

describe("buildKliquePassViewModel with athlete membership", () => {
  it("maps an active founder membership", () => {
    const viewModel = buildKliquePassViewModel({ athlete, athleteIndex: 0, membership: neonMembership("active", true) });

    expect(viewModel).toMatchObject({
      membershipLabel: "Membre fondateur",
      statusLabel: "Actif",
      adhesionLabel: "10/06/2026",
      validityLabel: "10/06/2027",
      renewalLabel: "Renouvellement non automatique",
      isActive: true,
    });
  });

  it("maps a future membership", () => {
    const viewModel = buildKliquePassViewModel({ athlete, athleteIndex: 0, membership: neonMembership("scheduled", false) });

    expect(viewModel.statusLabel).toBe("Futur");
    expect(viewModel.isActive).toBe(false);
  });

  it("maps an expired membership", () => {
    const viewModel = buildKliquePassViewModel({ athlete, athleteIndex: 0, membership: neonMembership("expired", false) });

    expect(viewModel.statusLabel).toBe("Expiré");
    expect(viewModel.isActive).toBe(false);
  });

  it("keeps the historical fallback when Neon has no membership", () => {
    const viewModel = buildKliquePassViewModel({
      athlete,
      athleteIndex: 0,
      membership: {
        origin: "historical",
        membership: null,
        status: "active",
        isActive: true,
        startsAt: athlete.adhesionDate,
        endsAt: "10/06/2027",
      },
      now: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(viewModel).toMatchObject({
      membershipLabel: "Membre KLIQUE",
      statusLabel: "Actif",
      adhesionLabel: "10/06/2026",
      validityLabel: "10/06/2027",
      renewalLabel: null,
      isActive: true,
    });
  });

  it("maps the state without any membership", () => {
    const viewModel = buildKliquePassViewModel({
      athlete,
      athleteIndex: 20,
      membership: {
        origin: "historical",
        membership: null,
        status: "unknown",
        isActive: false,
        startsAt: null,
        endsAt: null,
      },
    });

    expect(viewModel).toMatchObject({
      membershipLabel: "Aucune adhésion active",
      statusLabel: "Aucune adhésion active",
      adhesionLabel: "Non renseignée",
      validityLabel: null,
      renewalLabel: null,
      hasMembership: false,
      isActive: false,
    });
  });
});