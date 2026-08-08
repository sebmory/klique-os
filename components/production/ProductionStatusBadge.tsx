import type { ProductionWorkflowStatusTone } from "@/services/production-workflow";

type ProductionStatusBadgeProps = {
  label: string;
  tone: ProductionWorkflowStatusTone;
};

const toneClassMap: Record<ProductionWorkflowStatusTone, string> = {
  neutral: "is-neutral",
  warning: "is-warning",
  success: "is-success",
  danger: "is-danger",
};

export function ProductionStatusBadge({ label, tone }: ProductionStatusBadgeProps) {
  return <small className={`production-status-badge ${toneClassMap[tone]}`}>{label}</small>;
}
