import type { ProductionMediaStatus } from "@/services/production-media";

type ProductionMediaStatusBadgeProps = {
  status: ProductionMediaStatus;
  label: string;
};

const toneByStatus: Record<ProductionMediaStatus, "neutral" | "warning" | "success" | "danger"> = {
  empty: "neutral",
  needs_storage: "warning",
  storage_linked: "warning",
  exported: "success",
  published: "success",
  needs_review: "danger",
};

export function ProductionMediaStatusBadge({ status, label }: ProductionMediaStatusBadgeProps) {
  return <small className={`production-status-badge is-${toneByStatus[status]}`}>{label}</small>;
}
