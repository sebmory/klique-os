"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Eye, Inbox, X } from "lucide-react";
import {
  getAthleteServiceRequestProductLabel,
  getAthleteServiceRequestStatusLabel,
} from "@/lib/athlete-service-request-presentation";
import type {
  AdminAthleteServiceRequest,
  AthleteServiceRequestFulfillmentMode,
} from "@/lib/athlete-service-requests";

type RequestsPayload = {
  requests?: AdminAthleteServiceRequest[];
  request?: AdminAthleteServiceRequest;
  error?: string;
};

const modeLabels: Record<AthleteServiceRequestFulfillmentMode, string> = {
  included_right: "Droit inclus",
  paid_extra: "Prestation supplémentaire",
  paid_with_right: "Droit inclus avec supplément",
  no_charge: "Sans facturation",
};

const dateFormatter = new Intl.DateTimeFormat("fr-CH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatDate = (value: string | null) => {
  if (!value) return "Non renseignée";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Non renseignée" : dateFormatter.format(parsed);
};

const formatPrice = (request: AdminAthleteServiceRequest) =>
  request.snapshotPriceChf === null ? "Aucun prix prévu" : `CHF ${request.snapshotPriceChf}`;

const formatRights = (request: AdminAthleteServiceRequest) => {
  if (!request.snapshotCreditType || request.snapshotCreditQuantity === null) return "Aucun droit prévu";
  const label = request.snapshotCreditType === "production" ? "production" : "contenu personnalisé";
  return `${request.snapshotCreditQuantity} ${label}${request.snapshotCreditQuantity === 1 ? "" : "s"}`;
};

export function AthleteServiceRequestsCrmSection({
  resolveAthleteLabel,
}: {
  resolveAthleteLabel: (athleteId: string) => string;
}) {
  const [requests, setRequests] = useState<AdminAthleteServiceRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [refusalOpen, setRefusalOpen] = useState(false);
  const [refusalReason, setRefusalReason] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/admin/athlete-service-requests", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as RequestsPayload | null;
        if (!response.ok) throw new Error(payload?.error || "Impossible de charger les demandes de services.");
        if (active) setRequests(payload?.requests ?? []);
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Impossible de charger les demandes de services.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const sortedRequests = useMemo(() => [...requests].sort((left, right) => {
    const statusRank = Number(left.status !== "received") - Number(right.status !== "received");
    if (statusRank !== 0) return statusRank;
    return new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime();
  }), [requests]);

  const selectedRequest = requests.find((request) => request.id === selectedRequestId) ?? null;

  const closeDetails = () => {
    if (updating) return;
    setSelectedRequestId(null);
    setRefusalOpen(false);
    setRefusalReason("");
    setErrorMessage(null);
  };

  const transition = async (action: "take_over" | "refuse") => {
    if (!selectedRequest || (action === "refuse" && !refusalReason.trim())) return;
    setUpdating(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/athlete-service-requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          action,
          ...(action === "refuse" ? { refusalReason: refusalReason.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as RequestsPayload | null;
      if (!response.ok || !payload?.request) {
        throw new Error(payload?.error || "La demande n’a pas pu être mise à jour.");
      }
      setRequests((current) => current.map((request) => (
        request.id === payload.request!.id ? payload.request! : request
      )));
      setRefusalOpen(false);
      setRefusalReason("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "La demande n’a pas pu être mise à jour.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <section className="crm-skeleton-shell" aria-live="polite" aria-busy="true"><div className="crm-skeleton-row" /><div className="crm-skeleton-row" /><span className="crm-skeleton-label">Chargement des demandes de services...</span></section>;
  }

  if (!selectedRequest && errorMessage) {
    return <section className="crm-error-state" role="alert"><h2>Impossible de charger les demandes de services</h2><p>{errorMessage}</p></section>;
  }

  if (sortedRequests.length === 0) {
    return <section className="crm-empty-state" aria-live="polite"><div className="crm-empty-icon" aria-hidden><Inbox size={20} /></div><h2>Aucune demande de service</h2><p>Les prestations demandées depuis l’espace Athlète apparaîtront ici.</p></section>;
  }

  return (
    <>
      <section className="crm-list-shell athlete-service-request-list">
        <div className="athlete-service-requests-head" role="row">
          <span>Athlète</span><span>Prestation</span><span>Mode</span><span>Demandée le</span><span>Statut</span><span>Détail</span>
        </div>
        <ul className="crm-list-body">
          {sortedRequests.map((request) => (
            <li key={request.id}>
              <div className="athlete-service-requests-row">
                <span><strong>{resolveAthleteLabel(request.athleteId)}</strong></span>
                <span>{request.productName || getAthleteServiceRequestProductLabel(request.productCode)}</span>
                <span>{modeLabels[request.fulfillmentMode]}</span>
                <span>{formatDate(request.requestedAt)}</span>
                <span><small className={`crm-status-badge ${request.status === "received" ? "is-prospect" : request.status === "refused" ? "is-inactif" : "is-actif"}`}>{getAthleteServiceRequestStatusLabel(request.status)}</small></span>
                <span><button type="button" className="crm-secondary-action-link" onClick={() => setSelectedRequestId(request.id)}><Eye size={15} aria-hidden /> Consulter</button></span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {selectedRequest ? (
        <section className="crm-partner-review athlete-service-request-detail" role="dialog" aria-modal="true" aria-labelledby="service-request-detail-title">
          <header>
            <div><p>Demande de service Athlète</p><h2 id="service-request-detail-title">{selectedRequest.productName}</h2></div>
            <button type="button" className="crm-partner-close" onClick={closeDetails} aria-label="Fermer"><X size={18} /></button>
          </header>
          <dl className="athlete-service-request-data">
            <div><dt>Athlète</dt><dd>{resolveAthleteLabel(selectedRequest.athleteId)}</dd></div>
            <div><dt>Statut</dt><dd>{getAthleteServiceRequestStatusLabel(selectedRequest.status)}</dd></div>
            <div><dt>Mode choisi</dt><dd>{modeLabels[selectedRequest.fulfillmentMode]}</dd></div>
            <div><dt>Date souhaitée</dt><dd>{formatDate(selectedRequest.preferredDate)}</dd></div>
            <div><dt>Prix prévu</dt><dd>{formatPrice(selectedRequest)}</dd></div>
            <div><dt>Droits prévus</dt><dd>{formatRights(selectedRequest)}</dd></div>
            <div><dt>Demandée le</dt><dd>{formatDate(selectedRequest.requestedAt)}</dd></div>
            <div className="is-wide"><dt>Message</dt><dd>{selectedRequest.message || "Aucun message"}</dd></div>
            {selectedRequest.refusalReason ? <div className="is-wide"><dt>Motif du refus</dt><dd>{selectedRequest.refusalReason}</dd></div> : null}
          </dl>
          {errorMessage ? <p className="crm-requests-inline-error" role="alert">{errorMessage}</p> : null}
          {refusalOpen ? (
            <label className="athlete-service-refusal-reason">Motif du refus<textarea autoFocus value={refusalReason} maxLength={2000} onChange={(event) => setRefusalReason(event.target.value)} /></label>
          ) : null}
          <footer>
            {(selectedRequest.status === "received" || selectedRequest.status === "to_confirm") ? (
              <button type="button" className="crm-partner-reject" disabled={updating || (refusalOpen && !refusalReason.trim())} onClick={() => refusalOpen ? void transition("refuse") : setRefusalOpen(true)}>Refuser</button>
            ) : null}
            {selectedRequest.status === "received" ? (
              <button type="button" className="crm-partner-approve" disabled={updating || refusalOpen} onClick={() => void transition("take_over")}><Check size={16} aria-hidden /> {updating ? "Mise à jour..." : "Prendre en charge"}</button>
            ) : null}
          </footer>
        </section>
      ) : null}

      <style>{`
        .athlete-service-requests-head, .athlete-service-requests-row { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(170px, 1.4fr) minmax(150px, 1fr) 145px 105px 110px; gap: 10px; align-items: center; }
        .athlete-service-requests-head { min-height: 52px; padding: 0 18px; border-bottom: 1px solid #f1f1f1; color: #818181; font-size: .75rem; text-transform: uppercase; }
        .athlete-service-requests-row { width: 100%; min-height: 74px; padding: 12px 10px; border-radius: 8px; background: #fff; font-size: .86rem; }
        .athlete-service-request-data { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 0; }
        .athlete-service-request-data div { display: grid; gap: 4px; }
        .athlete-service-request-data .is-wide { grid-column: 1 / -1; }
        .athlete-service-request-data dt { color: #777; font-size: .75rem; text-transform: uppercase; }
        .athlete-service-request-data dd { margin: 0; white-space: pre-wrap; }
        .athlete-service-refusal-reason { display: grid; gap: 8px; font-weight: 700; }
        .athlete-service-refusal-reason textarea { min-height: 96px; resize: vertical; border: 1px solid #ddd; border-radius: 6px; padding: 10px; font: inherit; }
        @media (max-width: 900px) { .athlete-service-request-list { overflow-x: auto; } .athlete-service-requests-head, .athlete-service-requests-row { min-width: 860px; } }
        @media (max-width: 600px) { .athlete-service-request-data { grid-template-columns: 1fr; } .athlete-service-request-data .is-wide { grid-column: auto; } }
      `}</style>
    </>
  );
}