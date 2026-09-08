import Link from "next/link";
import { WorkspaceLanding } from "@/components/app-shell/WorkspaceLanding";

export default function AnalyticsPage() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "24px 24px 0" }}>
        <Link href="/analytics/visibilite" className="crm-primary-action" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          Visibilité KLIQUE
        </Link>
      </div>
      <WorkspaceLanding sectionTitle="Analytics" />
    </>
  );
}
