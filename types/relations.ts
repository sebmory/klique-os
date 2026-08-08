import type { LucideIcon } from "lucide-react";

export type EcosystemResource = {
  id: string;
  title: string;
  description: string;
  count: number;
  countLabel: string;
  icon: LucideIcon;
  href?: string;
  disabled?: boolean;
};

export type RelationsCardProps = {
  title?: string;
  resources: EcosystemResource[];
  emptyText?: string;
};
