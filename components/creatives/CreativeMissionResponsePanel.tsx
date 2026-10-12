import type {
  CreativeMissionResponse,
  CreativeMissionResponseDisplayState,
} from "@/lib/creative-missions";

const labels: Record<CreativeMissionResponseDisplayState, string> = {
  pending: "En attente de réponse",
  accepted: "Acceptée",
  refused: "Refusée",
  assignment_changed: "Affectation modifiée depuis la réponse",
  cancelled: "Mission annulée",
};

const actionLabels = {
  accepted: "Mission acceptée",
  refused: "Mission refusée",
} as const;

const formatTimestamp = (value: string): string => new Intl.DateTimeFormat("fr-CH", {
  timeZone: "Europe/Zurich",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));

export function CreativeMissionResponsePanel({
  response,
}: {
  response: CreativeMissionResponse;
}) {
  return (
    <section aria-label="Réponse créative" style={{ display: "grid", gap: "0.5rem" }}>
      <p style={{ margin: 0 }}>
        <strong>Réponse créative :</strong> {labels[response.state]}
      </p>
      {response.note ? <p style={{ margin: 0 }}><strong>Note :</strong> {response.note}</p> : null}
      {response.history.length > 0 ? (
        <details>
          <summary>Historique des réponses ({response.history.length})</summary>
          <ol>
            {response.history.map((event, index) => (
              <li key={`${event.createdAt}-${event.action}-${index}`}>
                {actionLabels[event.action]} · {formatTimestamp(event.createdAt)}
                {event.note ? ` · ${event.note}` : ""}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
