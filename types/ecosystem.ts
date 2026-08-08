export type EcosystemRaw = Record<string, unknown>;

export type EcosystemResource = {
  id: string;
  slug: string;
  name: string;
  type: string;
  category: string;
  status: string;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  website: string;
  instagram: string;
  memberOffer: string;
  expertise: string;
  services: string;
  nextAction: string;
  nextFollowUp: string;
  lastContact: string;
  estimatedValue: string;
  strategicPriority: string;
  potential: string;
  contractSigned: string;
  collaborationStart: string;
  collaborationEnd: string;
  deliverables: string;
  notes: string;
  raw: EcosystemRaw;
};

export type EcosystemListResponse = {
  resources: EcosystemResource[];
  source: "google-sheets" | "demo";
  message?: string;
};
