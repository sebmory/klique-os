import type { EcosystemListResponse, EcosystemResource } from "@/types/ecosystem";
import type { Partner, PartnerResponse } from "@/types/partner";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Une erreur est survenue.");
  }
  return data as T;
}

const normalize = (value: unknown): string => String(value ?? "").trim();

const toSlug = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ressource";

const isInvalidPlaceholderDate = (value: string): boolean => {
  const cleaned = normalize(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[./]/g, "-");

  if (!cleaned) return true;
  return cleaned === "30-12-1899" || cleaned === "1899-12-30";
};

const cleanDate = (value: string): string => {
  const raw = normalize(value);
  if (isInvalidPlaceholderDate(raw)) return "";
  return raw;
};

const typeFromPartner = (partner: Partner): string => {
  const relationType = normalize(partner.relationType ?? partner.type ?? "");
  if (relationType.includes("expert")) return "Expert";
  if (relationType.includes("media") || relationType.includes("média")) return "Média";
  if (relationType.includes("partenaire")) return "Partenaire";

  if (partner.expertKlique) return "Expert";

  const category = normalize(partner.category).toLowerCase();
  if (category.includes("média") || category.includes("media")) return "Média";

  return "Partenaire";
};

const isStatusLikeValue = (value: string): boolean => {
  const normalized = normalize(value).toLowerCase();
  return normalized === "actif" || normalized === "inactif" || normalized === "prospect";
};

const deriveMemberOffer = (partner: Partner): string => {
  const candidates = [
    normalize(partner.memberOffer ?? ""),
    normalize(partner.benefits ?? ""),
    normalize(partner.benefitDetails ?? ""),
    normalize(partner.services ?? ""),
    normalize(partner.counterparts ?? ""),
    normalize(partner.description ?? ""),
  ];

  const firstUseful = candidates.find((value) => value && !isStatusLikeValue(value));
  return firstUseful ?? candidates.find(Boolean) ?? "";
};

const toResource = (partner: Partner): EcosystemResource => {
  const name = normalize(partner.name) || "Ressource sans nom";
  const id = normalize(partner.id) || toSlug(name);

  const type = typeFromPartner(partner);
  const category = normalize(partner.category) || "Non renseigne";
  const status = normalize(partner.status) || "Non renseigne";

  const contactName = normalize(partner.contactName ?? partner.contact ?? "");
  const contactRole = normalize(partner.contactRole ?? "");

  const expertise = normalize(partner.expertise ?? partner.description ?? "");
  const services = normalize(partner.services ?? partner.counterparts ?? "");

  return {
    id,
    slug: normalize(partner.slug ?? "") || toSlug(name),
    name,
    type,
    category,
    status,
    contactName,
    contactRole,
    email: normalize(partner.email),
    phone: normalize(partner.phone),
    website: normalize(partner.website),
    instagram: normalize(partner.instagram),
    memberOffer: deriveMemberOffer(partner),
    expertise,
    services,
    nextAction: normalize(partner.nextAction ?? ""),
    nextFollowUp: cleanDate(normalize(partner.nextFollowUp ?? "")),
    lastContact: cleanDate(normalize(partner.lastContact ?? "")),
    estimatedValue: normalize(partner.estimatedValue ?? partner.estimatedValueChf ?? ""),
    strategicPriority: normalize(partner.strategicPriority ?? ""),
    potential: normalize(partner.potential ?? ""),
    contractSigned: normalize(partner.contractSigned ?? ""),
    collaborationStart: cleanDate(normalize(partner.collaborationStart ?? "")),
    collaborationEnd: cleanDate(normalize(partner.collaborationEnd ?? "")),
    deliverables: normalize(partner.deliverables ?? partner.counterparts ?? ""),
    notes: normalize(partner.notes),
    raw: {
      ...partner,
      category,
      contactName,
      contactRole,
      expertise,
      services,
      memberOffer: deriveMemberOffer(partner),
      type,
      slug: normalize(partner.slug ?? "") || toSlug(name),
      athletes: normalize(partner.athletes),
    },
  };
};

export const EcosystemService = {
  async listRaw(): Promise<PartnerResponse> {
    const response = await fetch("/api/partners", { cache: "no-store" });
    return parseResponse<PartnerResponse>(response);
  },

  async list(): Promise<EcosystemListResponse> {
    const payload = await this.listRaw();
    return {
      resources: payload.partners.map(toResource),
      source: payload.source,
      message: payload.message,
    };
  },
};
