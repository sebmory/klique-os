export const creativeTypes = ["photographer", "videographer", "both"] as const;
export const creativeStatuses = ["active", "inactive"] as const;
export const creativeProvenances = ["form_application", "admin_manual"] as const;

export type CreativeType = typeof creativeTypes[number];
export type CreativeStatus = typeof creativeStatuses[number];
export type CreativeProvenance = typeof creativeProvenances[number];

export type CreativeProfile = {
  id: string;
  workspaceId: string;
  provenance: CreativeProvenance;
  applicationId: string | null;
  displayName: string;
  creativeType: CreativeType;
  contactEmail: string;
  phone: string | null;
  websiteUrl: string | null;
  portfolioUrl: string | null;
  instagram: string | null;
  city: string | null;
  country: string | null;
  coverageAreas: string[];
  specialties: string[];
  bio: string | null;
  status: CreativeStatus;
  sourceRow: number | null;
  approvedByClerkUserId: string;
  approvedAt: string;
  createdAt: string;
  updatedAt: string;
};

type CreativeProfileBusinessFields = Pick<
  CreativeProfile,
  | "displayName"
  | "creativeType"
  | "contactEmail"
  | "phone"
  | "websiteUrl"
  | "portfolioUrl"
  | "instagram"
  | "city"
  | "country"
  | "coverageAreas"
  | "specialties"
  | "bio"
  | "status"
  | "approvedByClerkUserId"
  | "approvedAt"
>;

export type CreateFormApplicationCreativeProfileInput = CreativeProfileBusinessFields & {
  provenance: "form_application";
  applicationId: string;
  sourceRow: number;
};

export type CreateAdminManualCreativeProfileInput = CreativeProfileBusinessFields & {
  provenance: "admin_manual";
  applicationId: null;
  sourceRow: null;
};

export type CreateCreativeProfileInput =
  | CreateFormApplicationCreativeProfileInput
  | CreateAdminManualCreativeProfileInput;

export type CreateManualCreativeProfileInput = Omit<
  CreateAdminManualCreativeProfileInput,
  | "provenance"
  | "applicationId"
  | "sourceRow"
  | "approvedByClerkUserId"
  | "approvedAt"
>;

export type UpdateCreativeProfileInput = Partial<
  Pick<
    CreativeProfile,
    | "displayName"
    | "creativeType"
    | "contactEmail"
    | "phone"
    | "websiteUrl"
    | "portfolioUrl"
    | "instagram"
    | "city"
    | "country"
    | "coverageAreas"
    | "specialties"
    | "bio"
    | "status"
  >
>;
