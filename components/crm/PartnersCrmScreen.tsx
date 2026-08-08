"use client";

import { EcosystemScreen } from "@/components/ecosystem/EcosystemScreen";

// Temporary compatibility wrapper. The ecosystem module is now the single source of truth.
export function PartnersCrmScreen() {
  return <EcosystemScreen />;
}
