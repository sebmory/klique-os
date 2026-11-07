import type { ProductionCreativeCompensation } from "@/types/production-creative";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const requireUuid = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !uuidPattern.test(value.trim())) {
    throw new Error(`${field} invalide.`);
  }
  return value.trim().toLowerCase();
};

export const parseApplicationInput = (value: unknown): {
  briefId: string;
  action: "apply" | "withdraw";
  message: string | null;
} => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Requête invalide.");
  }
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).every((key) => ["briefId", "action", "message"].includes(key))) {
    throw new Error("Requête invalide.");
  }
  const action = input.action;
  if (action !== "apply" && action !== "withdraw") throw new Error("Action invalide.");
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length > 500) throw new Error("Le message ne peut pas dépasser 500 caractères.");
  return { briefId: requireUuid(input.briefId, "briefId"), action, message: message || null };
};

export const parseDeliveryInput = (value: unknown): {
  briefId: string;
  action: "confirm" | "deliver" | "refuse";
  conditionsVersion: number | null;
  links: string[];
  comment: string | null;
} => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Requête invalide.");
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).every((key) =>
    ["briefId", "action", "conditionsVersion", "links", "comment"].includes(key)
  )) throw new Error("Requête invalide.");
  if (!["confirm", "deliver", "refuse"].includes(String(input.action))) {
    throw new Error("Action invalide.");
  }
  const links = Array.isArray(input.links) ? input.links.map((link) => String(link).trim()).filter(Boolean) : [];
  if (links.length > 10) throw new Error("Dix liens de livraison au maximum.");
  for (const link of links) {
    const url = new URL(link);
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("Chaque lien de livraison doit être une URL HTTPS valide.");
    }
  }
  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (comment.length > 2000) throw new Error("Le commentaire ne peut pas dépasser 2000 caractères.");
  if (input.action === "deliver" && links.length === 0) throw new Error("Ajoutez au moins un lien HTTPS.");
  if (input.action === "refuse" && !comment) throw new Error("Le motif du refus est obligatoire.");
  const conditionsVersion = input.action === "confirm" && Number.isInteger(input.conditionsVersion)
    ? Number(input.conditionsVersion)
    : null;
  if (input.action === "confirm" && (!conditionsVersion || conditionsVersion < 1)) {
    throw new Error("Version des conditions invalide.");
  }
  return {
    briefId: requireUuid(input.briefId, "briefId"),
    action: input.action as "confirm" | "deliver" | "refuse",
    conditionsVersion,
    links,
    comment: comment || null,
  };
};

export const parseCompensation = (value: unknown): ProductionCreativeCompensation => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Conditions financières obligatoires.");
  }
  const input = value as Record<string, unknown>;
  if (input.type === "unpaid_collaboration") {
    if (input.amountMinor !== null || input.currency !== null) {
      throw new Error("Une collaboration non rémunérée ne comporte aucun montant.");
    }
    return { type: "unpaid_collaboration", amountMinor: null, currency: null };
  }
  if (
    input.type !== "paid_mandate"
    || !Number.isInteger(input.amountMinor)
    || Number(input.amountMinor) < 0
    || typeof input.currency !== "string"
    || !/^[A-Z]{3}$/.test(input.currency)
  ) {
    throw new Error("Le montant et la devise du mandat rémunéré sont obligatoires.");
  }
  return {
    type: "paid_mandate",
    amountMinor: Number(input.amountMinor),
    currency: input.currency,
  };
};
