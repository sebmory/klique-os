import { describe, expect, it } from "vitest";
import {
  assertAthletePurchasedServiceKind,
  buildAthleteMemberServicesProjection,
  calculateAthletePurchasedServiceBalance,
  canPurchaseAthleteService,
  type AthleteServiceProduct,
} from "@/lib/athlete-service-catalog";
import type { AthleteCreditPurchase, AthleteMembershipPlan } from "@/lib/athlete-credits";

const product = (overrides: Partial<AthleteServiceProduct>): AthleteServiceProduct => ({
  code: "photo_session_standard",
  name: "Session photo KLIQUE",
  active: true,
  priceChf: 149,
  fulfillmentKind: "photo_session",
  includedDeliverables: 1,
  commercialScope: "Hors match ou compétition.",
  allowedPlanCodes: null,
  requiredProductionCredits: 0,
  validityMonths: 12,
  ...overrides,
});

const purchase = (overrides: Partial<AthleteCreditPurchase> = {}): AthleteCreditPurchase => ({
  id: "purchase-1",
  workspaceId: "klique-os",
  athleteId: "athlete-1",
  productCode: "photo_session_standard",
  quantity: 1,
  amountChf: 149,
  status: "paid",
  purchasedAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2027-09-01T00:00:00.000Z",
  paymentReference: "offline-payment-1",
  ...overrides,
});

const essentialPlan: AthleteMembershipPlan = {
  code: "essential",
  name: "Essentiel",
  active: true,
  durationMonths: 12,
  annualPriceChf: 249,
  monthlyInstallmentChf: 21,
  productionCredits: 1,
  customContentCredits: 2,
  videoAllowed: false,
  metadata: {},
};

const catalogProducts = (): AthleteServiceProduct[] => [
  product({}),
  product({ code: "match_coverage_individual", name: "Couverture individuelle d’un match", priceChf: 179, fulfillmentKind: "match_coverage" }),
  product({ code: "match_coverage_upgrade", name: "Conversion d’un crédit production en couverture de match", priceChf: 30, fulfillmentKind: "match_credit_upgrade", requiredProductionCredits: 1 }),
  product({ code: "editorial_interview", name: "Interview éditoriale", priceChf: 89, fulfillmentKind: "editorial_interview" }),
  product({ code: "custom_content_single", name: "Contenu personnalisé", priceChf: 39, fulfillmentKind: "custom_content" }),
  product({ code: "custom_content_pack_5", name: "Pack de 5 contenus", priceChf: 169, fulfillmentKind: "custom_content", includedDeliverables: 5 }),
  product({ code: "simple_video_capsule", name: "Capsule vidéo simple", priceChf: 349, fulfillmentKind: "simple_video", allowedPlanCodes: ["impact", "signature"] }),
];

describe("Athlete à-la-carte service catalog", () => {
  it("keeps purchased services separate from other fulfillment kinds", () => {
    const interview = product({
      code: "editorial_interview",
      name: "Interview éditoriale",
      priceChf: 89,
      fulfillmentKind: "editorial_interview",
    });

    expect(() => assertAthletePurchasedServiceKind(interview, "photo_session")).toThrow(
      "Une prestation achetée ne peut pas être convertie en une autre prestation.",
    );
    expect(() => assertAthletePurchasedServiceKind(product({}), "simple_video")).toThrow();
  });

  it("derives five available deliverables for the custom content pack", () => {
    const pack = product({
      code: "custom_content_pack_5",
      name: "Pack de 5 contenus",
      priceChf: 169,
      fulfillmentKind: "custom_content",
      includedDeliverables: 5,
    });
    const packPurchase = purchase({ productCode: pack.code, amountChf: 169 });

    expect(calculateAthletePurchasedServiceBalance({
      product: pack,
      purchase: packPurchase,
      executions: [{ id: "execution-1", purchaseId: packPurchase.id, quantity: 2, executedAt: "2026-10-01T00:00:00.000Z", referenceId: null }],
      at: new Date("2026-10-02T00:00:00.000Z"),
    })).toEqual({ purchased: 5, used: 2, remaining: 3, expired: false });
  });

  it("makes a paid purchase unavailable after its 12-month expiration", () => {
    expect(calculateAthletePurchasedServiceBalance({
      product: product({}),
      purchase: purchase({ expiresAt: "2027-09-01T00:00:00.000Z" }),
      executions: [],
      at: new Date("2027-09-01T00:00:00.000Z"),
    })).toEqual({ purchased: 1, used: 0, remaining: 0, expired: true });
  });

  it("forbids the simple video capsule with Essential", () => {
    const video = product({
      code: "simple_video_capsule",
      name: "Capsule vidéo simple",
      priceChf: 349,
      fulfillmentKind: "simple_video",
      allowedPlanCodes: ["impact", "signature"],
    });

    expect(canPurchaseAthleteService({
      product: video,
      membershipActive: true,
      paymentConfirmed: true,
      plan: essentialPlan,
      productionCreditBalance: 10,
    })).toMatchObject({ allowed: false, reason: "plan_not_allowed" });
  });

  it("requires exactly one valid production credit for the CHF 30 match upgrade", () => {
    const upgrade = product({
      code: "match_coverage_upgrade",
      name: "Conversion d’un crédit production en couverture de match",
      priceChf: 30,
      fulfillmentKind: "match_credit_upgrade",
      requiredProductionCredits: 1,
    });
    const input = { product: upgrade, membershipActive: true, paymentConfirmed: true, plan: essentialPlan };

    expect(canPurchaseAthleteService({ ...input, productionCreditBalance: 0 })).toEqual({
      allowed: false,
      reason: "production_credit_required",
      productionCreditsRequired: 1,
    });
    expect(canPurchaseAthleteService({ ...input, productionCreditBalance: 1 })).toEqual({
      allowed: true,
      reason: "allowed",
      productionCreditsRequired: 1,
    });
    expect(canPurchaseAthleteService({ ...input, productionCreditBalance: 2 })).toEqual({
      allowed: true,
      reason: "allowed",
      productionCreditsRequired: 1,
    });
  });

  it("projects only public service fields", () => {
    const projection = buildAthleteMemberServicesProjection({
      products: catalogProducts(),
      membershipActive: true,
      plan: essentialPlan,
      balance: { production: 1, custom_content: 5 },
    });

    expect(projection.services).toHaveLength(7);
    expect(projection.membership).toEqual({
      active: true,
      planName: "Essentiel",
      productionCreditBalance: 1,
      customContentCreditBalance: 5,
    });
    expect(projection.services.map((service) => service.code)).toEqual([
      "photo_session_standard",
      "match_coverage_upgrade",
      "match_coverage_individual",
      "editorial_interview",
      "custom_content_single",
      "custom_content_pack_5",
      "simple_video_capsule",
    ]);
    expect(projection.services[0]).toEqual(expect.objectContaining({
      code: "photo_session_standard",
      name: "Session photo KLIQUE",
      memberPriceChf: 149,
      validityLabel: "12 mois après son achat",
    }));
    expect(projection.services[0]).not.toHaveProperty("fulfillmentKind");
    expect(projection.services[0]).not.toHaveProperty("allowedPlanCodes");
    expect(projection.services[0]).not.toHaveProperty("requiredProductionCredits");

    expect(projection.services.find((service) => service.code === "custom_content_single")?.description).toBe(
      "Une création demandée par vous pour une communication particulière : annonce, résultat important, recherche de sponsor, événement, remerciement ou autre actualité que vous souhaitez spécialement mettre en avant. KLIQUE réalise, selon le besoin, une publication, un carrousel, une story ou un visuel à partir des éléments disponibles.",
    );
    expect(projection.services.find((service) => service.code === "custom_content_pack_5")?.description).toBe(
      "Cinq demandes de contenus personnalisés à utiliser pendant 12 mois pour vos communications particulières. Chaque demande peut prendre la forme d’une publication, d’un carrousel, d’une story ou d’un visuel.",
    );
    expect(projection.services.find((service) => service.code === "simple_video_capsule")?.description).toBe(
      "Création d’une courte vidéo avec un tournage léger et un montage simple. Les projets plus complexes sont réalisés sur devis.",
    );
  });

  it("shows the video to Essential members as locked for Impact or Signature", () => {
    const projection = buildAthleteMemberServicesProjection({
      products: catalogProducts(),
      membershipActive: true,
      plan: essentialPlan,
      balance: { production: 1, custom_content: 0 },
    });
    const video = projection.services.find((service) => service.code === "simple_video_capsule");

    expect(video).toMatchObject({
      available: false,
      availabilityLabel: "Réservé à un autre abonnement",
    });
  });

  it("reflects match upgrade availability from the current production credit balance", () => {
    const withoutCredit = buildAthleteMemberServicesProjection({
      products: catalogProducts(), membershipActive: true, plan: essentialPlan, balance: { production: 0, custom_content: 0 },
    }).services.find((service) => service.code === "match_coverage_upgrade");
    const withCredit = buildAthleteMemberServicesProjection({
      products: catalogProducts(), membershipActive: true, plan: essentialPlan, balance: { production: 1, custom_content: 0 },
    }).services.find((service) => service.code === "match_coverage_upgrade");

    expect(withoutCredit).toMatchObject({
      available: false,
      memberPriceLabel: "CHF 30",
      availabilityLabel: "Solde insuffisant",
    });
    expect(withCredit).toMatchObject({
      name: "Conversion en couverture de match",
      available: true,
      availabilityLabel: "Disponible",
    });
  });

  it("keeps the catalog visible but reserves every service without an active membership", () => {
    const projection = buildAthleteMemberServicesProjection({
      products: catalogProducts(),
      membershipActive: false,
      plan: null,
      balance: { production: 0, custom_content: 0 },
    });

    expect(projection.services).toHaveLength(7);
    expect(projection.services.every((service) => !service.available)).toBe(true);
    expect(projection.services.every((service) => service.availabilityLabel === "Réservé aux membres actifs")).toBe(true);
  });

  it("projects the exact shared credit costs for every member service", () => {
    const services = buildAthleteMemberServicesProjection({
      products: catalogProducts(),
      membershipActive: true,
      plan: essentialPlan,
      balance: { production: 2, custom_content: 5 },
    }).services;
    const byCode = Object.fromEntries(services.map((service) => [service.code, service]));

    expect(byCode.photo_session_standard.creditOption).toMatchObject({ creditType: "production", creditsRequired: 1, sufficient: true });
    expect(byCode.match_coverage_upgrade.creditOption).toMatchObject({ creditType: "production", creditsRequired: 1, sufficient: true });
    expect(byCode.match_coverage_individual.creditOption).toBeNull();
    expect(byCode.editorial_interview.creditOption).toMatchObject({ creditType: "production", creditsRequired: 1, sufficient: true });
    expect(byCode.custom_content_single.creditOption).toMatchObject({ creditType: "custom_content", creditsRequired: 1, sufficient: true });
    expect(byCode.custom_content_pack_5.creditOption).toMatchObject({ creditType: "custom_content", creditsRequired: 5, sufficient: true });
    expect(byCode.simple_video_capsule.creditOption).toMatchObject({
      creditType: "production",
      creditsRequired: 2,
      eligibleWithPlan: false,
      sufficient: false,
    });
    expect(byCode.photo_session_standard.availabilityLabel).toBe("Inclus");
    expect(byCode.match_coverage_individual.availabilityLabel).toBe("Disponible");
    expect(byCode.custom_content_pack_5.availabilityLabel).toBe("Disponible");
    expect(byCode.simple_video_capsule.availabilityLabel).toBe("Réservé à un autre abonnement");
  });
});