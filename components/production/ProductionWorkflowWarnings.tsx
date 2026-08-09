import { AlertTriangle } from "lucide-react";
import type { ProductionWorkflowInconsistency, ProductionWorkflowSeverity } from "@/services/production-workflow";

const friendlyLabelForIssue = (issue: ProductionWorkflowInconsistency | ProductionWarningItem): string => {
  if (issue.stepId) {
    const stepLabels: Record<string, string> = {
      import: "Étape Import",
      tri: "Étape Tri",
      retouche: "Étape Retouche",
      export: "Étape Export",
      publication: "Étape Publication",
    };
    return stepLabels[issue.stepId] ?? "Étape du workflow";
  }

  if (issue.code === "STATUS_COMPLETED_BUT_WORKFLOW_OPEN") return "Statut général";
  if (issue.code === "STATUS_NOT_STARTED_BUT_WORKFLOW_PROGRESS") return "Statut général";
  if (issue.code === "STATUS_READY_BUT_WORKFLOW_NOT_READY") return "Statut général";
  if (issue.code === "STATUS_IN_PROGRESS_BUT_WORKFLOW_EMPTY") return "Statut général";
  if (issue.code === "PROGRESS_COMPLETE_BUT_STATUS_INCOMPATIBLE") return "Statut général";
  return "Point à vérifier";
};

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
                <strong>Élément :</strong> {friendlyLabelForIssue(issue)}
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
