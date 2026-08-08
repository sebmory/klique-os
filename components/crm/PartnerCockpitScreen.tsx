"use client";

import { EcosystemResourceScreen } from "@/components/ecosystem/EcosystemResourceScreen";

type PartnerCockpitScreenProps = {
  id: string;
};

// Temporary compatibility wrapper. The ecosystem resource screen now handles all resource types.
export function PartnerCockpitScreen({ id }: PartnerCockpitScreenProps) {
  return <EcosystemResourceScreen id={id} />;
}
