import { describe, expect, it } from "vitest";
import type { AthleteMemberService } from "@/lib/athlete-service-catalog";
import {
  getAthleteServiceRequestOptions,
  getAthleteServiceRequestStatusLabel,
} from "@/lib/athlete-service-request-presentation";

const service = (overrides: Partial<AthleteMemberService> = {}): AthleteMemberService => ({
  code: "photo_session_standard",
  name: "Session photo KLIQUE",
  memberPriceChf: 149,
  memberPriceLabel: "CHF 149",
  description: "Session photo standard.",
  validityLabel: "12 mois après son achat",
  includedDeliverables: 1,
  creditOption: {
    creditType: "production",
    creditsRequired: 1,
    availableBalance: 1,
    eligibleWithPlan: true,
    sufficient: true,
  },
  available: true,
  availabilityLabel: "Inclus",
  ...overrides,
});

describe("athlete service request presentation", () => {
  it("offers an explicit included-right or paid-extra choice when both are possible", () => {
    expect(getAthleteServiceRequestOptions(service(), true).map((option) => option.mode)).toEqual([
      "included_right",
      "paid_extra",
    ]);
  });

  it("never exposes no_charge and keeps a paid extra available when rights are exhausted", () => {
    const options = getAthleteServiceRequestOptions(service({
      creditOption: {
        creditType: "production",
        creditsRequired: 1,
        availableBalance: 0,
        eligibleWithPlan: true,
        sufficient: false,
      },
      available: false,
      availabilityLabel: "Solde insuffisant",
    }), true);

    expect(options.map((option) => option.mode)).toEqual(["paid_extra"]);
  });

  it("uses only the hybrid mode for an available match conversion", () => {
    const options = getAthleteServiceRequestOptions(service({
      code: "match_coverage_upgrade",
      name: "Conversion en couverture de match",
      memberPriceChf: 30,
      memberPriceLabel: "CHF 30",
    }), true);

    expect(options).toEqual([{
      mode: "paid_with_right",
      label: "Utiliser une production incluse",
      description: "1 production incluse + CHF 30",
    }]);
  });

  it("does not offer a restricted service or match conversion without the required right", () => {
    expect(getAthleteServiceRequestOptions(service({
      creditOption: {
        creditType: "production",
        creditsRequired: 2,
        availableBalance: 2,
        eligibleWithPlan: false,
        sufficient: false,
      },
    }), true)).toEqual([]);
    expect(getAthleteServiceRequestOptions(service({
      code: "match_coverage_upgrade",
      creditOption: {
        creditType: "production",
        creditsRequired: 1,
        availableBalance: 0,
        eligibleWithPlan: true,
        sufficient: false,
      },
    }), true)).toEqual([]);
  });

  it("translates every workflow status", () => {
    expect(getAthleteServiceRequestStatusLabel("received")).toBe("Reçue");
    expect(getAthleteServiceRequestStatusLabel("to_confirm")).toBe("À confirmer");
    expect(getAthleteServiceRequestStatusLabel("scheduled")).toBe("Planifiée");
    expect(getAthleteServiceRequestStatusLabel("in_progress")).toBe("En cours");
    expect(getAthleteServiceRequestStatusLabel("completed")).toBe("Terminée");
    expect(getAthleteServiceRequestStatusLabel("refused")).toBe("Refusée");
  });
});