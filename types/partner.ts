export type Partner = {
  row?: number;
  id: string;
  name: string;
  category: string;
  expertKlique: boolean;
  contact: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  description: string;
  benefits: string;
  notes: string;
  status: "Actif" | "Inactif";
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
