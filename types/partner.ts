export type Partner = {
  row?: number;
  id: string;
  slug?: string;
  name: string;
  type?: string;
  relationType?: string;
  category: string;
  expertKlique: boolean;
  contactName?: string;
  contact: string;
  contactRole?: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  memberOffer?: string;
  benefitType?: string;
  benefitDetails?: string;
  collaboration?: string;
  communicationConsent?: string;
  logoUrl?: string;
  expertise?: string;
  services?: string;
  description: string;
  benefits: string;
  firstContactDate?: string;
  lastContact?: string;
  nextFollowUp?: string;
  nextAction?: string;
  estimatedValue?: string;
  estimatedValueChf?: string;
  contractSigned?: string;
  collaborationStart?: string;
  collaborationEnd?: string;
  deliverables?: string;
  counterparts?: string;
  notes: string;
  status: "Actif" | "Inactif" | "Prospect" | string;
  usageType?: "once" | "limited" | "unlimited";
  usageLimit?: number;
  strategicPriority?: string;
  potential?: string;
  nextContactObjective?: string;
  raw?: Record<string, string | number | boolean | null | undefined>;
  athletes: string;
};

export type NewPartner = Omit<Partner, "row" | "id">;

export type PartnerUpdate = Pick<Partner, "row"> &
  Partial<
    Pick<
      Partner,
      | "name"
      | "category"
      | "expertKlique"
      | "contact"
      | "email"
      | "phone"
      | "website"
      | "instagram"
      | "description"
      | "benefits"
      | "notes"
      | "status"
      | "athletes"
    >
  >;

export type PartnerResponse = {
  partners: Partner[];
  source: "google-sheets" | "demo";
  message?: string;
};
