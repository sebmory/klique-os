import { AlertTriangle } from "lucide-react";
import type { ProductionWorkflowInconsistency, ProductionWorkflowSeverity } from "@/services/production-workflow";

export type ProductionWarningItem = {
  code: string;
  severity: ProductionWorkflowSeverity;
  message: string;
  stepId?: string;
};

type ProductionWorkflowWarningsProps = {
  inconsistencies: Array<ProductionWorkflowInconsistency | ProductionWarningItem>;
  title?: string;
};

export function ProductionWorkflowWarnings({ inconsistencies, title = "Points a verifier" }: ProductionWorkflowWarningsProps) {
  if (!inconsistencies.length) return null;

  return (
    <article className="crm-person-card-shell production-workflow-warnings" aria-live="polite">
      <header>
        <h2>{title}</h2>
      </header>
      <ul>
        {inconsistencies.map((issue) => (
          <li key={`${issue.code}-${"stepId" in issue ? issue.stepId ?? "global" : "global"}`}>
            <span className={`production-warning-dot is-${issue.severity}`} aria-hidden>
              <AlertTriangle size={14} />
            </span>
            <div>
              <p>
                <strong>Etape/champ :</strong> {("stepId" in issue && issue.stepId) ? issue.stepId : issue.code}
              </p>
              <p>
                <strong>Message :</strong> {issue.message}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
