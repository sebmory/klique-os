"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  no_charge: "Prise en charge KLIQUE",
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

const formatPaymentStatus = (request: AdminAthleteServiceRequest) => {
  if (request.purchaseStatus === "paid") {
    return `Paiement reçu${request.paymentUpdatedAt ? ` le ${formatDate(request.paymentUpdatedAt)}` : ""}${request.paymentReference ? ` · Référence ${request.paymentReference}` : ""}`;
  }
  if (request.purchaseStatus === "pending") return "Accord membre enregistré · Paiement en attente de réception";
  if (request.purchaseStatus === "cancelled") return "Achat annulé";
  if (request.purchaseStatus === "refunded") return "Paiement remboursé";
  return "Accord membre attendu";
};

const formatDeliveryProgress = (request: AdminAthleteServiceRequest) =>
  request.purchasedQuantity && request.purchasedQuantity > 1
    ? `Livraisons : ${request.deliveredQuantity}/${request.purchasedQuantity}`
    : null;

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
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [refusalOpen, setRefusalOpen] = useState(false);
  const [refusalReason, setRefusalReason] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [noChargeOpen, setNoChargeOpen] = useState(false);
  const [noChargeReasonInput, setNoChargeReasonInput] = useState("");
  // Kept across retries of the same click so a lost response never records a second delivery.
  const pendingDeliveryKeyRef = useRef<string | null>(null);

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
  const selectedRequestIsPaid = selectedRequest?.fulfillmentMode === "paid_extra"
    || selectedRequest?.fulfillmentMode === "paid_with_right";
  const selectedRequestCanBeScheduled = !selectedRequestIsPaid
    || (selectedRequest?.memberConfirmed === true
      && (selectedRequest.purchaseStatus === "pending" || selectedRequest.purchaseStatus === "paid"));
  const selectedRequestCanBeStarted = selectedRequest?.fulfillmentMode === "included_right"
    || (selectedRequestIsPaid && selectedRequest?.purchaseStatus === "paid");
  const selectedRequestIsPack = (selectedRequest?.purchasedQuantity ?? 0) > 1;
  const selectedRequestDeliveryLabel = selectedRequestIsPack
    ? (selectedRequest!.deliveredQuantity + 1 >= (selectedRequest!.purchasedQuantity ?? 0)
      ? "Terminer la dernière livraison"
      : "Enregistrer une livraison")
    : "Terminer";
  const selectedRequestCanAssumeNoCharge = selectedRequest !== null
    && (selectedRequest.status === "received" || selectedRequest.status === "to_confirm")
    && selectedRequest.fulfillmentMode !== "no_charge"
    && !selectedRequest.memberConfirmed;

  const closeDetails = () => {
    if (updating) return;
    setSelectedRequestId(null);
    setScheduleOpen(false);
    setScheduledAt("");
    setRefusalOpen(false);
    setRefusalReason("");
    setPaymentOpen(false);
    setPaymentReference("");
    setPaymentReceived(false);
    setNoChargeOpen(false);
    setNoChargeReasonInput("");
    pendingDeliveryKeyRef.current = null;
    setErrorMessage(null);
  };

  const transition = async (action: "take_over" | "schedule" | "start" | "complete" | "confirm_payment" | "assume_no_charge" | "refuse") => {
    if (!selectedRequest
      || (action === "refuse" && !refusalReason.trim())
      || (action === "schedule" && !scheduledAt)
      || (action === "assume_no_charge" && !noChargeReasonInput.trim())
      || (action === "confirm_payment" && (!paymentReference.trim() || !paymentReceived))) return;
    setUpdating(true);
    setErrorMessage(null);
    if (action === "complete") pendingDeliveryKeyRef.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/athlete-service-requests", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          action,
          ...(action === "schedule" ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
          ...(action === "refuse" ? { refusalReason: refusalReason.trim() } : {}),
          ...(action === "complete" ? { deliveryKey: pendingDeliveryKeyRef.current } : {}),
          ...(action === "assume_no_charge" ? { reason: noChargeReasonInput.trim() } : {}),
          ...(action === "confirm_payment" ? {
            paymentReference: paymentReference.trim(),
            paymentReceived,
          } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as RequestsPayload | null;
      if (!response.ok || !payload?.request) {
        throw new Error(payload?.error || "La demande n’a pas pu être mise à jour.");
      }
      setRequests((current) => current.map((request) => (
        request.id === payload.request!.id ? payload.request! : request
      )));
      if (action === "complete") pendingDeliveryKeyRef.current = null;
      setScheduleOpen(false);
      setScheduledAt("");
      setRefusalOpen(false);
      setRefusalReason("");
      setPaymentOpen(false);
      setPaymentReference("");
      setPaymentReceived(false);
      setNoChargeOpen(false);
      setNoChargeReasonInput("");
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
          <span>Athlète</span><span>Prestation</span><span>Mode</span><span>Date</span><span>Statut</span><span>Détail</span>
        </div>
        <ul className="crm-list-body">
          {sortedRequests.map((request) => (
            <li key={request.id}>
              <div className="athlete-service-requests-row">
                <span><strong>{resolveAthleteLabel(request.athleteId)}</strong></span>
                <span>{request.productName || getAthleteServiceRequestProductLabel(request.productCode)}</span>
                <span>{modeLabels[request.fulfillmentMode]}</span>
                <span>{request.scheduledAt ? `Planifiée : ${formatDate(request.scheduledAt)}` : `Demandée : ${formatDate(request.requestedAt)}`}</span>
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
            <div><dt>Date planifiée</dt><dd>{formatDate(selectedRequest.scheduledAt)}</dd></div>
            <div><dt>Démarrée le</dt><dd>{formatDate(selectedRequest.startedAt)}</dd></div>
            <div><dt>Terminée le</dt><dd>{formatDate(selectedRequest.completedAt)}</dd></div>
            <div><dt>Prix prévu</dt><dd>{formatPrice(selectedRequest)}</dd></div>
            <div><dt>Droits prévus</dt><dd>{formatRights(selectedRequest)}</dd></div>
            <div><dt>Demandée le</dt><dd>{formatDate(selectedRequest.requestedAt)}</dd></div>
            <div className="is-wide"><dt>Message</dt><dd>{selectedRequest.message || "Aucun message"}</dd></div>
            {selectedRequest.refusalReason ? <div className="is-wide"><dt>Motif du refus</dt><dd>{selectedRequest.refusalReason}</dd></div> : null}
            {selectedRequestIsPaid ? <div className="is-wide athlete-service-payment-notice"><dt>Accord et paiement</dt><dd>{formatPaymentStatus(selectedRequest)}</dd></div> : null}
            {formatDeliveryProgress(selectedRequest) ? <div className="is-wide"><dt>Progression</dt><dd>{formatDeliveryProgress(selectedRequest)}</dd></div> : null}
            {selectedRequest.fulfillmentMode === "no_charge" ? <div className="is-wide"><dt>Motif de la prise en charge KLIQUE</dt><dd>{selectedRequest.noChargeReason || "Non renseigné"}</dd></div> : null}
          </dl>
          {errorMessage ? <p className="crm-requests-inline-error" role="alert">{errorMessage}</p> : null}
          {scheduleOpen ? (
            <label className="athlete-service-schedule-date">Date et heure de planification<input autoFocus type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>
          ) : null}
          {refusalOpen ? (
            <label className="athlete-service-refusal-reason">Motif du refus<textarea autoFocus value={refusalReason} maxLength={2000} onChange={(event) => setRefusalReason(event.target.value)} /></label>
          ) : null}
          {paymentOpen ? (
            <section className="athlete-service-payment-form" aria-labelledby="payment-confirmation-title">
              <strong id="payment-confirmation-title">Confirmer le paiement reçu</strong>
              <p>Montant attendu : <b>{formatPrice(selectedRequest)}</b></p>
              <label>Référence de paiement<input autoFocus value={paymentReference} maxLength={200} onChange={(event) => setPaymentReference(event.target.value)} /></label>
              <label className="athlete-service-payment-checkbox"><input type="checkbox" checked={paymentReceived} onChange={(event) => setPaymentReceived(event.target.checked)} /><span>Je confirme que le paiement de {formatPrice(selectedRequest)} a été reçu.</span></label>
              <p>Aucun débit externe ne sera déclenché.</p>
            </section>
          ) : null}
          <footer>
            {(selectedRequest.status === "received" || selectedRequest.status === "to_confirm" || selectedRequest.status === "scheduled") && selectedRequest.purchaseStatus !== "paid" ? (
              <button type="button" className="crm-partner-reject" disabled={updating || scheduleOpen || paymentOpen || noChargeOpen || (refusalOpen && !refusalReason.trim())} onClick={() => refusalOpen ? void transition("refuse") : setRefusalOpen(true)}>Refuser</button>
            ) : null}
            {selectedRequest.purchaseStatus === "paid" && selectedRequest.status !== "refused" ? <span className="athlete-service-paid-refusal-note">Refus simple indisponible · remboursement hors périmètre</span> : null}
            {selectedRequest.status === "received" ? (
              <button type="button" className="crm-partner-approve" disabled={updating || refusalOpen || paymentOpen} onClick={() => void transition("take_over")}><Check size={16} aria-hidden /> {updating ? "Mise à jour..." : "Prendre en charge"}</button>
            ) : null}
            {selectedRequestCanAssumeNoCharge ? (
              noChargeOpen ? (
                <span className="athlete-service-no-charge-form">
                  <label>Motif de la prise en charge KLIQUE<textarea autoFocus value={noChargeReasonInput} maxLength={2000} onChange={(event) => setNoChargeReasonInput(event.target.value)} /></label>
                  <button type="button" className="crm-partner-approve" disabled={updating || !noChargeReasonInput.trim()} onClick={() => void transition("assume_no_charge")}><Check size={16} aria-hidden /> {updating ? "Mise à jour..." : "Confirmer la prise en charge"}</button>
                </span>
              ) : (
                <button type="button" className="crm-secondary-action-link" disabled={updating || refusalOpen || paymentOpen || scheduleOpen} onClick={() => setNoChargeOpen(true)}>Prise en charge par KLIQUE</button>
              )
            ) : null}
            {selectedRequest.status === "to_confirm" ? (
              <button type="button" className="crm-partner-approve" disabled={updating || refusalOpen || paymentOpen || !selectedRequestCanBeScheduled || (scheduleOpen && !scheduledAt)} onClick={() => scheduleOpen ? void transition("schedule") : setScheduleOpen(true)}><Check size={16} aria-hidden /> {updating ? "Mise à jour..." : selectedRequestCanBeScheduled ? "Planifier" : "Accord membre attendu"}</button>
            ) : null}
            {selectedRequestIsPaid && selectedRequest.purchaseStatus === "pending" && selectedRequest.status !== "refused" ? (
              <button type="button" className="crm-partner-approve" disabled={updating || refusalOpen || scheduleOpen || (paymentOpen && (!paymentReference.trim() || !paymentReceived))} onClick={() => paymentOpen ? void transition("confirm_payment") : setPaymentOpen(true)}><Check size={16} aria-hidden /> {updating ? "Mise à jour..." : paymentOpen ? "Enregistrer le paiement reçu" : "Confirmer le paiement reçu"}</button>
            ) : null}
            {selectedRequest.status === "scheduled" && selectedRequestCanBeStarted ? (
              <button type="button" className="crm-partner-approve" disabled={updating || refusalOpen} onClick={() => void transition("start")}><Check size={16} aria-hidden /> {updating ? "Mise à jour..." : "Démarrer"}</button>
            ) : null}
            {selectedRequest.status === "in_progress" && selectedRequestCanBeStarted ? (
              <button type="button" className="crm-partner-approve" disabled={updating} onClick={() => void transition("complete")}><Check size={16} aria-hidden /> {updating ? "Mise à jour..." : selectedRequestDeliveryLabel}</button>
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
        .athlete-service-schedule-date { display: grid; gap: 8px; font-weight: 700; }
        .athlete-service-schedule-date input { max-width: 320px; border: 1px solid #ddd; border-radius: 6px; padding: 10px; font: inherit; }
        .athlete-service-payment-notice dd { color: #9a6700; font-weight: 700; }
        .athlete-service-payment-form { display: grid; gap: 10px; padding: 14px; border: 1px solid #d8c28e; border-radius: 8px; background: #fffaf0; }
        .athlete-service-payment-form p { margin: 0; }
        .athlete-service-payment-form label:not(.athlete-service-payment-checkbox) { display: grid; gap: 8px; font-weight: 700; }
        .athlete-service-payment-form input[type="text"], .athlete-service-payment-form input:not([type]) { max-width: 420px; border: 1px solid #ccc; border-radius: 6px; padding: 10px; font: inherit; }
        .athlete-service-payment-checkbox { display: flex; gap: 8px; align-items: flex-start; }
        .athlete-service-paid-refusal-note { color: #8a5b00; font-size: .82rem; font-weight: 700; }
        .athlete-service-no-charge-form { display: flex; flex-direction: column; gap: 8px; }
        .athlete-service-no-charge-form label { display: grid; gap: 8px; font-weight: 700; }
        .athlete-service-no-charge-form textarea { min-height: 72px; resize: vertical; border: 1px solid #ddd; border-radius: 6px; padding: 10px; font: inherit; }
        @media (max-width: 900px) { .athlete-service-request-list { overflow-x: auto; } .athlete-service-requests-head, .athlete-service-requests-row { min-width: 860px; } }
        @media (max-width: 600px) { .athlete-service-request-data { grid-template-columns: 1fr; } .athlete-service-request-data .is-wide { grid-column: auto; } }
      `}</style>
    </>
  );
}