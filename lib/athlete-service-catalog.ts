import { createContentStorageClient } from "@/lib/content-storage/db";
import {
  getAthleteServiceCreditRequirement,
  type AthleteCreditBalance,
  type AthleteCreditPurchase,
  type AthleteCreditType,
  type AthleteMembershipPlan,
  type AthleteServiceType,
} from "@/lib/athlete-credits";

export type AthleteServiceProductCode =
  | "photo_session_standard"
  | "match_coverage_individual"
  | "match_coverage_upgrade"
  | "editorial_interview"
  | "custom_content_single"
  | "custom_content_pack_5"
  | "simple_video_capsule";

export type AthleteServiceFulfillmentKind =
  | "photo_session"
  | "match_coverage"
  | "match_credit_upgrade"
  | "editorial_interview"
  | "custom_content"
  | "simple_video";

export type AthleteServiceProduct = {
  code: AthleteServiceProductCode;
  name: string;
  active: boolean;
  priceChf: number;
  fulfillmentKind: AthleteServiceFulfillmentKind;
  includedDeliverables: number;
  commercialScope: string;
  allowedPlanCodes: string[] | null;
  requiredProductionCredits: number;
  validityMonths: 12;
};

export type AthleteCreditPurchaseExecution = {
  id: string;
  purchaseId: string;
  quantity: number;
  executedAt: string;
  referenceId: string | null;
};

export type AthletePurchasedServiceBalance = {
  purchased: number;
  used: number;
  remaining: number;
  expired: boolean;
};

export type AthleteServicePurchaseCheck = {
  allowed: boolean;
  reason:
    | "allowed"
    | "inactive_membership"
    | "payment_required"
    | "inactive_product"
    | "plan_not_allowed"
    | "production_credit_required";
  productionCreditsRequired: number;
};

export type AthleteMemberService = {
  code: AthleteServiceProductCode;
  name: string;
  memberPriceChf: number;
  memberPriceLabel: string;
  description: string;
  validityLabel: string;
  includedDeliverables: number;
  creditOption: {
    creditType: AthleteCreditType;
    creditsRequired: number;
    availableBalance: number;
    eligibleWithPlan: boolean;
    sufficient: boolean;
  } | null;
  available: boolean;
  availabilityLabel: string;
};

export type AthleteMemberServicesProjection = {
  membership: {
    active: boolean;
    planName: string | null;
    productionCreditBalance: number;
    customContentCreditBalance: number;
  };
  services: AthleteMemberService[];
};

type AthleteServiceProductRow = {
  code: AthleteServiceProductCode;
  name: string;
  active: boolean;
  price_chf: string | number;
  fulfillment_kind: AthleteServiceFulfillmentKind;
  included_deliverables: number;
  commercial_scope: string;
  allowed_plan_codes: string[] | null;
  required_production_credits: number;
  validity_months: number;
};

const mapProduct = (row: AthleteServiceProductRow): AthleteServiceProduct => ({
  code: row.code,
  name: row.name,
  active: row.active,
  priceChf: Number(row.price_chf),
  fulfillmentKind: row.fulfillment_kind,
  includedDeliverables: Number(row.included_deliverables),
  commercialScope: row.commercial_scope,
  allowedPlanCodes: row.allowed_plan_codes,
  requiredProductionCredits: Number(row.required_production_credits),
  validityMonths: 12,
});

export const listActiveAthleteServiceProducts = async (): Promise<AthleteServiceProduct[]> => {
  const sql = createContentStorageClient();
  const rows = await sql`
    SELECT code, name, active, price_chf, fulfillment_kind, included_deliverables,
           commercial_scope, allowed_plan_codes, required_production_credits, validity_months
    FROM athlete_service_products
    WHERE active = TRUE
    ORDER BY price_chf ASC, code ASC
  `;
  return (rows as AthleteServiceProductRow[]).map(mapProduct);
};

export const canPurchaseAthleteService = ({
  product,
  membershipActive,
  paymentConfirmed,
  plan,
  productionCreditBalance,
}: {
  product: AthleteServiceProduct;
  membershipActive: boolean;
  paymentConfirmed: boolean;
  plan: AthleteMembershipPlan | null;
  productionCreditBalance: number;
}): AthleteServicePurchaseCheck => {
  const productionCreditsRequired = product.requiredProductionCredits;
  if (!membershipActive) return { allowed: false, reason: "inactive_membership", productionCreditsRequired };
  if (!paymentConfirmed) return { allowed: false, reason: "payment_required", productionCreditsRequired };
  if (!product.active) return { allowed: false, reason: "inactive_product", productionCreditsRequired };
  if (product.allowedPlanCodes && (!plan || !product.allowedPlanCodes.includes(plan.code))) {
    return { allowed: false, reason: "plan_not_allowed", productionCreditsRequired };
  }
  if (productionCreditBalance < productionCreditsRequired) {
    return { allowed: false, reason: "production_credit_required", productionCreditsRequired };
  }
  return { allowed: true, reason: "allowed", productionCreditsRequired };
};

const formatMemberPrice = (priceChf: number): string => `CHF ${priceChf.toFixed(2).replace(/\.00$/, "")}`;

const productOrder: AthleteServiceProductCode[] = [
  "photo_session_standard",
  "match_coverage_upgrade",
  "match_coverage_individual",
  "editorial_interview",
  "custom_content_single",
  "custom_content_pack_5",
  "simple_video_capsule",
];

const creditRuleForProduct = (
  product: AthleteServiceProduct,
): { creditType: AthleteCreditType; quantity: number } | null => {
  const serviceTypeByProduct: Partial<Record<AthleteServiceProductCode, AthleteServiceType>> = {
    photo_session_standard: "standard_photo",
    editorial_interview: "editorial_interview",
    custom_content_single: "custom_content",
    custom_content_pack_5: "custom_content",
    simple_video_capsule: "simple_video",
  };
  const serviceType = serviceTypeByProduct[product.code];
  if (serviceType) {
    const requirement = getAthleteServiceCreditRequirement(serviceType);
    return {
      creditType: requirement.creditType,
      quantity: product.code === "custom_content_pack_5"
        ? requirement.quantity * product.includedDeliverables
        : requirement.quantity,
    };
  }
  if (product.requiredProductionCredits > 0) {
    return { creditType: "production", quantity: product.requiredProductionCredits };
  }
  return null;
};

const memberDescriptionByProduct: Partial<Record<AthleteServiceProductCode, string>> = {
  custom_content_single: "Une création demandée par vous pour une communication particulière : annonce, résultat important, recherche de sponsor, événement, remerciement ou autre actualité que vous souhaitez spécialement mettre en avant. KLIQUE réalise, selon le besoin, une publication, un carrousel, une story ou un visuel à partir des éléments disponibles.",
  custom_content_pack_5: "Cinq demandes de contenus personnalisés à utiliser pendant 12 mois pour vos communications particulières. Chaque demande peut prendre la forme d’une publication, d’un carrousel, d’une story ou d’un visuel.",
  simple_video_capsule: "Création d’une courte vidéo avec un tournage léger et un montage simple. Les projets plus complexes sont réalisés sur devis.",
};

export const buildAthleteMemberServicesProjection = ({
  products,
  membershipActive,
  plan,
  balance,
}: {
  products: AthleteServiceProduct[];
  membershipActive: boolean;
  plan: AthleteMembershipPlan | null;
  balance: AthleteCreditBalance;
}): AthleteMemberServicesProjection => ({
  membership: {
    active: membershipActive,
    planName: plan?.name ?? null,
    productionCreditBalance: Math.max(0, Number(balance.production) || 0),
    customContentCreditBalance: Math.max(0, Number(balance.custom_content) || 0),
  },
  services: [...products]
    .sort((left, right) => productOrder.indexOf(left.code) - productOrder.indexOf(right.code))
    .map((product) => {
    const sanitizedBalance: AthleteCreditBalance = {
      production: Math.max(0, Number(balance.production) || 0),
      custom_content: Math.max(0, Number(balance.custom_content) || 0),
    };
    const check = canPurchaseAthleteService({
      product,
      membershipActive,
      paymentConfirmed: membershipActive,
      plan,
      productionCreditBalance: sanitizedBalance.production,
    });
    const isMatchUpgrade = product.code === "match_coverage_upgrade";
    const isCustomContentPack = product.code === "custom_content_pack_5";
    const isVideo = product.code === "simple_video_capsule";
    const creditRule = creditRuleForProduct(product);
    const availableBalance = creditRule ? sanitizedBalance[creditRule.creditType] : 0;
    const eligibleWithPlan = check.reason !== "plan_not_allowed";
    const creditOption = creditRule
      ? {
          creditType: creditRule.creditType,
          creditsRequired: creditRule.quantity,
          availableBalance,
          eligibleWithPlan,
          sufficient: membershipActive && eligibleWithPlan && availableBalance >= creditRule.quantity,
        }
      : null;

    const availabilityLabel = !membershipActive
      ? "Réservé aux membres actifs"
      : !eligibleWithPlan
        ? "Réservé à un autre abonnement"
        : isMatchUpgrade
          ? creditOption?.sufficient ? "Disponible" : "Solde insuffisant"
          : isCustomContentPack
            ? "Disponible"
          : creditOption
            ? creditOption.sufficient ? "Inclus" : "Solde insuffisant"
            : "Disponible";

    return {
      code: product.code,
      name: isMatchUpgrade ? "Conversion en couverture de match" : product.name,
      memberPriceChf: product.priceChf,
      memberPriceLabel: formatMemberPrice(product.priceChf),
      description: memberDescriptionByProduct[product.code] ?? product.commercialScope,
      validityLabel: `${product.validityMonths} mois après son achat`,
      includedDeliverables: product.includedDeliverables,
      creditOption,
      available: check.allowed,
      availabilityLabel,
    };
  }),
});

export const calculateAthletePurchasedServiceBalance = ({
  product,
  purchase,
  executions,
  at = new Date(),
}: {
  product: AthleteServiceProduct;
  purchase: AthleteCreditPurchase;
  executions: AthleteCreditPurchaseExecution[];
  at?: Date;
}): AthletePurchasedServiceBalance => {
  if (purchase.productCode !== product.code) {
    throw new Error("La prestation exécutée doit correspondre exactement au produit acheté.");
  }

  const purchased = purchase.quantity * product.includedDeliverables;
  const used = executions
    .filter((execution) => execution.purchaseId === purchase.id)
    .reduce((total, execution) => total + execution.quantity, 0);
  const expiresAt = new Date(purchase.expiresAt).getTime();
  const expired = !Number.isFinite(expiresAt) || expiresAt <= at.getTime();
  const available = purchase.status === "paid" && !expired;

  return {
    purchased,
    used,
    remaining: available ? Math.max(0, purchased - used) : 0,
    expired,
  };
};

export const assertAthletePurchasedServiceKind = (
  purchasedProduct: AthleteServiceProduct,
  requestedFulfillmentKind: AthleteServiceFulfillmentKind,
): void => {
  if (purchasedProduct.fulfillmentKind !== requestedFulfillmentKind) {
    throw new Error("Une prestation achetée ne peut pas être convertie en une autre prestation.");
  }
};