import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { getDefaultWorkspaceId } from "@/lib/content-storage/db";
import { getEcosystemPartnersFrom06Partenaires } from "@/lib/google-sheets";

export type PartnerBenefit = {
  id: string;
  name: string;
  category: string;
  memberOffer: string;
  benefitDetails: string;
  description: string;
  logoUrl: string;
  website: string;
};

const normalize = (value: unknown): string => String(value ?? "").trim();

export const loadPartnerBenefits = async (request: Request): Promise<PartnerBenefit[]> => {
  const profile = await getCurrentUserAccessProfile(request);
  if (!profile?.clerkUser?.id) {
    throw new Error("Unauthorized");
  }

  const access = profile.userAccess;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  if (
    access?.role !== "partner_expert"
    || access.status !== "active"
    || !workspaceId
    || workspaceId !== getDefaultWorkspaceId()
  ) {
    throw new Error("Forbidden");
  }

  const partners = await getEcosystemPartnersFrom06Partenaires();

  return partners
    .filter((partner) => normalize(partner.status).toLocaleLowerCase("fr") === "actif")
    .map((partner) => ({
      id: normalize(partner.id),
      name: normalize(partner.name),
      category: normalize(partner.category),
      memberOffer: normalize(partner.memberOffer),
      benefitDetails: normalize(partner.benefitDetails),
      description: normalize(partner.description),
      logoUrl: normalize(partner.logoUrl),
      website: normalize(partner.website),
    }));
};