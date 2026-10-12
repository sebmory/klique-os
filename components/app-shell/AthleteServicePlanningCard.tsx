import Link from "next/link";
import { Card } from "@/src/design-system/components";
import type {
  AthleteServicePlanningPriority,
  AthleteServicePlanningPriorityLevel,
} from "@/lib/athlete-service-planning-priorities";

export type AthleteServicePlanningPriorityView = AthleteServicePlanningPriority & {
  athleteName: string;
};

const levelLabels: Record<AthleteServicePlanningPriorityLevel, string> = {
  urgent: "Urgent",
  plan: "À planifier",
  anticipate: "À anticiper",
  future: "À venir",
};

const levelClasses: Record<AthleteServicePlanningPriorityLevel, string> = {
  urgent: "priority-urgent",
  plan: "priority-haute",
  anticipate: "priority-normale",
  future: "priority-normale",
};

const missionLabels: Record<AthleteServicePlanningPriority["missionState"], string> = {
  absent: "Mission absente",
  draft: "Mission en brouillon",
  ready: "Mission prête",
};

const responseLabels = {
  pending: "En attente de réponse",
  accepted: "Acceptée",
  refused: "Refusée",
  assignment_changed: "Affectation modifiée depuis la réponse",
  cancelled: "Mission annulée",
} as const;

const formatDate = (value: string): string => new Intl.DateTimeFormat("fr-CH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
}).format(new Date(value));

export function AthleteServicePlanningCard({
  priorities,
}: {
  priorities: AthleteServicePlanningPriorityView[];
}) {
  return (
    <Card className="workspace-dashboard-card card-priorities dashboard-service-planning-card">
      <header className="dashboard-card-head">
        <h2>Prestations à planifier</h2>
        <div className="dashboard-card-head-right">
          <span className="card-pill">{priorities.length} priorité{priorities.length === 1 ? "" : "s"}</span>
        </div>
      </header>

      {priorities.length > 0 ? (
        <ul className="priority-list service-planning-list">
          {priorities.map((priority) => (
            <li key={priority.membershipId} className="priority-item service-planning-item">
              <div className="priority-main">
                <strong>{priority.athleteName}</strong>
                <small>
                  {priority.remainingServices
                    .map((service) => `${service.available} ${service.label.toLowerCase()}`)
                    .join(" · ")}
                </small>
                <small>
                  Créatif : {priority.assignedCreatives.length > 0
                    ? priority.assignedCreatives.map((creative) => creative.displayName).join(", ")
                    : "Non affecté"}
                </small>
                <small>{missionLabels[priority.missionState]}</small>
                {priority.creativeResponseStates?.length ? (
                  <small>
                    Réponse créative : {priority.creativeResponseStates
                      .map((state) => responseLabels[state])
                      .join(", ")}
                  </small>
                ) : null}
              </div>
              <div className="service-planning-deadline">
                <span className={`priority-badge ${levelClasses[priority.level]}`}>
                  {levelLabels[priority.level]}
                </span>
                <small>
                  Fin le {formatDate(priority.endsAt)} · {priority.daysRemaining} jour{priority.daysRemaining === 1 ? "" : "s"}
                </small>
              </div>
              <Link
                href={`/crm/personnes/${encodeURIComponent(priority.athleteId)}`}
                className="card-link-button"
              >
                Ouvrir
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Aucune prestation incluse à planifier.</p>
      )}
    </Card>
  );
}
