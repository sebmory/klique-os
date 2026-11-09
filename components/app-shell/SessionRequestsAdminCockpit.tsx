"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssignmentCreativeSummary } from "@/lib/athlete-service-creative-assignments";
import type { AthleteSessionRequest } from "@/lib/athlete-session-requests";
import type {
  CreativeAvailabilityConflict,
  CreativeAvailabilityOccurrence,
} from "@/lib/creative-availability";

type Payload = {
  requests?: AthleteSessionRequest[];
  creatives?: AssignmentCreativeSummary[];
  availability?: {
    occurrences: CreativeAvailabilityOccurrence[];
    conflicts: CreativeAvailabilityConflict[];
  };
  error?: string;
};

const statusLabels: Record<AthleteSessionRequest["workflowStatus"], string> = {
  draft: "Brouillon",
  submitted: "Nouvelle",
  admin_review: "En revue",
  accepted: "Acceptée",
  refused: "Refusée",
  changes_requested: "Complément demandé",
  production_linked: "Production créée",
  proposed_to_creatives: "Proposée",
  candidate_received: "Candidature reçue",
  assigned: "Attribuée",
  creative_agreed: "Accord créatif",
  confirmed: "Confirmée",
  completed: "Terminée",
  cancelled: "Annulée",
};

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("fr-CH", {
      timeZone: "Europe/Zurich",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))
  : "À convenir";

const requestDates = (request: AthleteSessionRequest) => [
  ...(request.eventStartsAt ? [request.eventStartsAt.slice(0, 10)] : []),
  ...request.periods.map((period) => period.startsAt.slice(0, 10)),
];

export function SessionRequestsAdminCockpit() {
  const [payload, setPayload] = useState<Payload>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [athleteFilter, setAthleteFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [creativeType, setCreativeType] = useState<"photo" | "video" | "photo_video">("photo");
  const [selectedPeriodStart, setSelectedPeriodStart] = useState("");
  const [deliveryDueDate, setDeliveryDueDate] = useState("");
  const [compensationType, setCompensationType] = useState<"unpaid_collaboration" | "paid_mandate">("unpaid_collaboration");
  const [amountChf, setAmountChf] = useState("");
  const [expensesCovered, setExpensesCovered] = useState(false);
  const [expenseTerms, setExpenseTerms] = useState("");
  const [creditsAndUsage, setCreditsAndUsage] = useState("");
  const [necessaryContactDetails, setNecessaryContactDetails] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/session-requests", { cache: "no-store" });
    const next = await response.json() as Payload;
    if (!response.ok) throw new Error(next.error || "Chargement impossible.");
    setPayload(next);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load)
      .catch((failure) => setError(failure instanceof Error ? failure.message : "Chargement impossible."))
      .finally(() => setLoading(false));
  }, [load]);

  const requests = useMemo(() => payload.requests ?? [], [payload.requests]);
  const pendingCount = requests.filter((request) =>
    ["submitted", "admin_review", "changes_requested", "creative_agreed"].includes(request.workflowStatus)
  ).length;
  const regions = useMemo(
    () => [...new Set(requests.map((request) => request.region))].sort(),
    [requests],
  );
  const athletes = useMemo(
    () => [...new Map(requests.map((request) => [
      request.athleteId,
      request.athleteName ?? request.athleteId,
    ])).entries()],
    [requests],
  );
  const visible = requests.filter((request) => {
    const dates = requestDates(request);
    return (!statusFilter || request.workflowStatus === statusFilter)
      && (!typeFilter || request.requestType === typeFilter)
      && (!regionFilter || request.region === regionFilter)
      && (!athleteFilter || request.athleteId === athleteFilter)
      && (!dateFilter || dates.includes(dateFilter));
  });

  const compatibilityFor = (request: AthleteSessionRequest) => {
    const dates = requestDates(request);
    const missionType = request.requestType;
    const occurrences = payload.availability?.occurrences ?? [];
    const conflicts = new Set((payload.availability?.conflicts ?? []).map((conflict) =>
      `${conflict.creativeProfileId}:${conflict.date}`
    ));
    return (payload.creatives ?? []).map((creative) => {
      const occurrence = occurrences.find((item) =>
        item.creativeProfileId === creative.id
        && dates.includes(item.date)
        && item.missionTypes.includes(missionType)
        && item.regions.some((region) => region.toLowerCase() === request.region.toLowerCase())
      );
      const hasConflict = dates.some((date) => conflicts.has(`${creative.id}:${date}`));
      return { creative, occurrence, hasConflict };
    }).sort((left, right) => (
      Number(Boolean(right.occurrence) && !right.hasConflict)
      - Number(Boolean(left.occurrence) && !left.hasConflict)
    ));
  };

  const mutate = async (requestId: string, action: string, extra: Record<string, unknown> = {}) => {
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/session-requests", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId,
        action,
        idempotencyKey: crypto.randomUUID(),
        ...extra,
      }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "Action impossible.");
    setMessage("Action enregistrée.");
    setReason("");
    await load();
  };

  const createProduction = async (request: AthleteSessionRequest) => {
    if (selectedRecipients.length === 0) {
      setError("Sélectionnez au moins un créatif destinataire.");
      return;
    }
    await mutate(request.id, "create_production", {
      production: {
        idempotencyKey: crypto.randomUUID(),
        creativeType,
        selectedPeriodStart: request.requestType === "media_day" ? selectedPeriodStart : null,
        deliveryDueDate: deliveryDueDate || null,
        compensation: compensationType === "paid_mandate"
          ? {
              type: "paid_mandate",
              amountMinor: Math.round(Number(amountChf) * 100),
              currency: "CHF",
            }
          : {
              type: "unpaid_collaboration",
              amountMinor: null,
              currency: null,
            },
        expensesCovered,
        expenseTerms,
        creditsAndUsage,
        necessaryContactDetails: necessaryContactDetails || null,
        recipientIds: selectedRecipients,
      },
    });
  };

  return (
    <section className="session-requests-admin" aria-labelledby="session-requests-admin-title">
      <header>
        <div>
          <p>Demandes Athlètes</p>
          <h2 id="session-requests-admin-title">Séances à examiner</h2>
        </div>
        <strong aria-label={`${pendingCount} demandes à traiter`}>{pendingCount}</strong>
      </header>

      <div className="session-requests-filters" aria-label="Filtres des demandes">
        <label>
          Statut
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tous</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Type
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">Tous</option>
            <option value="match_competition">Match / compétition</option>
            <option value="media_day">Media Day</option>
          </select>
        </label>
        <label>
          Région
          <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
            <option value="">Toutes</option>
            {regions.map((region) => <option key={region}>{region}</option>)}
          </select>
        </label>
        <label>
          Athlète
          <select value={athleteFilter} onChange={(event) => setAthleteFilter(event.target.value)}>
            <option value="">Tous</option>
            {athletes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>Date<input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} /></label>
      </div>

      {error ? <p className="form-message is-error" role="alert">{error}</p> : null}
      {message ? <p className="form-message is-success" role="status">{message}</p> : null}

      <div className="session-requests-admin-list">
        {loading ? <p>Chargement…</p> : visible.length === 0 ? <p>Aucune demande pour ces filtres.</p> : visible.map((request) => {
          const compatibility = compatibilityFor(request);
          const expanded = expandedId === request.id;
          return (
            <article key={request.id}>
              <button
                type="button"
                className="session-request-summary"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : request.id)}
              >
                <span>
                  <strong>{request.athleteName ?? request.athleteId}</strong>
                  <small>{request.requestType === "media_day" ? "Media Day" : `${request.eventType} · ${request.sport}`}</small>
                </span>
                <span>{formatDate(request.eventStartsAt ?? request.periods[0]?.startsAt ?? null)}</span>
                <mark>{statusLabels[request.workflowStatus]}</mark>
              </button>
              {expanded ? (
                <div className="session-request-detail">
                  <dl>
                    <div><dt>Objectif</dt><dd>{request.objective}</dd></div>
                    <div><dt>Livrables</dt><dd>{request.deliverables}</dd></div>
                    <div><dt>Lieu</dt><dd>{[request.locationName, request.region].filter(Boolean).join(" · ")}</dd></div>
                    <div><dt>Informations pratiques</dt><dd>{request.practicalInformation || "Aucune"}</dd></div>
                    <div><dt>Contraintes</dt><dd>{request.constraintsComment || "Aucune"}</dd></div>
                    <div><dt>Droit / coût Athlète</dt><dd>
                      {request.commercialMode === "included_right"
                        ? `${request.snapshotCreditQuantity} droit de production prévu`
                        : request.commercialMode === "paid_extra"
                          ? `CHF ${request.snapshotPriceChf}`
                          : "Décision Admin requise"}
                    </dd></div>
                  </dl>

                  {["submitted", "admin_review"].includes(request.workflowStatus) ? (
                    <div className="session-request-actions">
                      {request.workflowStatus === "submitted" ? <button type="button" className="secondary-button" onClick={() => void mutate(request.id, "start_review").catch((failure) => setError(failure.message))}>Commencer la revue</button> : null}
                      <button type="button" className="primary-button" onClick={() => void mutate(request.id, "accept").catch((failure) => setError(failure.message))}>Accepter</button>
                      <label>Motif ou complément<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
                      <button type="button" className="secondary-button" disabled={!reason.trim()} onClick={() => void mutate(request.id, "request_changes", { reason }).catch((failure) => setError(failure.message))}>Demander un complément</button>
                      <button type="button" className="secondary-button" disabled={!reason.trim()} onClick={() => void mutate(request.id, "refuse", { reason }).catch((failure) => setError(failure.message))}>Refuser</button>
                    </div>
                  ) : null}

                  {request.workflowStatus === "accepted" ? (
                    <div className="session-production-form">
                      <h3>Créer explicitement le brief Production</h3>
                      <p>Les conditions Athlète ci-dessus restent séparées des conditions proposées au créatif.</p>
                      <label>Type créatif<select value={creativeType} onChange={(event) => setCreativeType(event.target.value as typeof creativeType)}><option value="photo">Photo</option><option value="video">Vidéo</option><option value="photo_video">Photo + vidéo</option></select></label>
                      {request.requestType === "media_day" ? (
                        <label>Date retenue
                          <select required value={selectedPeriodStart} onChange={(event) => setSelectedPeriodStart(event.target.value)}>
                            <option value="">Choisir parmi les propositions</option>
                            {request.periods.map((period) => <option key={period.id} value={period.startsAt}>{formatDate(period.startsAt)} – {formatDate(period.endsAt)}</option>)}
                          </select>
                        </label>
                      ) : null}
                      <label>Échéance de livraison<input type="date" value={deliveryDueDate} onChange={(event) => setDeliveryDueDate(event.target.value)} /></label>
                      <label>Conditions<select value={compensationType} onChange={(event) => setCompensationType(event.target.value as typeof compensationType)}><option value="unpaid_collaboration">Collaboration non rémunérée</option><option value="paid_mandate">Mandat rémunéré</option></select></label>
                      {compensationType === "paid_mandate" ? <label>Montant CHF<input type="number" min="0" step="0.05" value={amountChf} onChange={(event) => setAmountChf(event.target.value)} /></label> : null}
                      <label className="session-request-checkbox"><input type="checkbox" checked={expensesCovered} onChange={(event) => setExpensesCovered(event.target.checked)} />Frais pris en charge</label>
                      <label>Conditions de frais<textarea required value={expenseTerms} onChange={(event) => setExpenseTerms(event.target.value)} /></label>
                      <label>Crédits et utilisation<textarea required value={creditsAndUsage} onChange={(event) => setCreditsAndUsage(event.target.value)} /></label>
                      <label>Contact communiqué après accord<textarea value={necessaryContactDetails} onChange={(event) => setNecessaryContactDetails(event.target.value)} /></label>
                      <fieldset>
                        <legend>Créatifs compatibles à solliciter</legend>
                        {compatibility.map(({ creative, occurrence, hasConflict }) => (
                          <label key={creative.id}>
                            <input type="checkbox" checked={selectedRecipients.includes(creative.id)} onChange={(event) => setSelectedRecipients(event.target.checked ? [...selectedRecipients, creative.id] : selectedRecipients.filter((id) => id !== creative.id))} />
                            {creative.displayName} — {occurrence ? "disponible" : "aucune disponibilité correspondante"}{hasConflict ? " · conflit confirmé" : ""}
                          </label>
                        ))}
                      </fieldset>
                      <button type="button" className="primary-button" disabled={!expenseTerms.trim() || !creditsAndUsage.trim() || (request.requestType === "media_day" && !selectedPeriodStart)} onClick={() => void createProduction(request).catch((failure) => setError(failure.message))}>Créer le brief sans le publier</button>
                    </div>
                  ) : null}

                  {request.workflowStatus === "production_linked" ? (
                    <button type="button" className="primary-button" onClick={() => void mutate(request.id, "publish_production").catch((failure) => setError(failure.message))}>Proposer aux créatifs sélectionnés</button>
                  ) : null}

                  {["candidate_received", "proposed_to_creatives"].includes(request.workflowStatus) && request.applications.some((application) => application.status === "interested") ? (
                    <div className="session-request-candidates">
                      <h3>Candidatures</h3>
                      {request.applications.filter((application) => application.status === "interested").map((application) => (
                        <article key={application.creativeProfileId}>
                          <strong>{application.displayName}</strong>
                          <p>{application.message || "Sans message"}</p>
                          <button type="button" className="primary-button" onClick={() => void mutate(request.id, "assign_creative", { creativeProfileId: application.creativeProfileId }).catch((failure) => setError(failure.message))}>Attribuer explicitement</button>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {request.workflowStatus === "creative_agreed" ? (
                    <button type="button" className="primary-button" onClick={() => void mutate(request.id, "final_confirm").catch((failure) => setError(failure.message))}>Confirmer définitivement la séance</button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
