"use client";

import { useCallback, useEffect, useState } from "react";
import type { Production } from "@/types/production";

type Creative = { id: string; displayName: string; status: string };
type Application = {
  creativeProfileId: string;
  displayName: string;
  message: string | null;
  status: string;
};
type Brief = {
  id: string;
  title: string;
  status: string;
  conditionsVersion: number;
  compensationType: "unpaid_collaboration" | "paid_mandate";
  compensationAmountMinor: number | null;
  compensationCurrency: string | null;
  expensesCovered: boolean;
  expenseTerms: string;
  deliverables: string;
  creditsAndUsage: string;
  scheduledDate: string | null;
  dateToAgree: boolean;
  region: string;
  locationDetails: string | null;
  deliveryDueDate: string | null;
  sourceLinkStatus: "exact" | "source_changed";
  applications: Application[];
  confirmationStatus: string | null;
  deliveryStatus: string | null;
  deliveryLinks: string[];
  deliveryComment: string | null;
  reviewComment: string | null;
  assignmentHistory: Array<{
    id: string;
    displayName: string;
    status: string;
    refusalReason: string | null;
    conditionsVersion: number;
    deliveryStatus: string;
  }>;
};

const sourceValue = (value: string) => {
  const normalized = value.trim();
  return normalized === "—" ? "" : normalized;
};

const sourceSnapshot = (production: Production) => ({
  date: sourceValue(production.date),
  type: sourceValue(production.type),
  athlete: sourceValue(production.athlete),
  sport: sourceValue(production.sport),
  location: sourceValue(production.lieu),
  objective: sourceValue(production.objectif),
});

const sourceFingerprint = async (production: Production): Promise<string> => {
  const bytes = new TextEncoder().encode(JSON.stringify(sourceSnapshot(production)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export function ProductionCreativeBriefPanel({
  production,
  athleteId,
}: {
  production: Production;
  athleteId: string | null;
}) {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedCreative, setSelectedCreative] = useState("");
  const [sourceState, setSourceState] = useState<"exact" | "source_changed" | "source_missing" | "ambiguous">("exact");

  const load = useCallback(async () => {
    if (!production.row) return;
    const fingerprint = await sourceFingerprint(production);
    const [briefsResponse, creativesResponse] = await Promise.all([
      fetch(`/api/admin/production-creative-briefs?productionSourceRow=${production.row}&productionSourceFingerprint=${fingerprint}`, { cache: "no-store" }),
      fetch("/api/admin/creatives", { cache: "no-store" }),
    ]);
    const briefsPayload = await briefsResponse.json();
    const creativesPayload = await creativesResponse.json();
    if (!briefsResponse.ok) throw new Error(briefsPayload.error);
    if (!creativesResponse.ok) throw new Error(creativesPayload.error);
    setBriefs(briefsPayload.briefs ?? []);
    setSourceState(briefsPayload.sourceAnchorState ?? "source_changed");
    setCreatives((creativesPayload.creatives ?? creativesPayload.profiles ?? []).filter((item: Creative) => item.status === "active"));
  }, [production]);

  useEffect(() => {
    void Promise.resolve().then(load)
      .catch((failure) => setError(failure.message || "Chargement impossible."));
  }, [load]);

  const transition = async (briefId: string, action: string, creativeProfileId?: string, comment?: string) => {
    const response = await fetch("/api/admin/production-creative-briefs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ briefId, action, creativeProfileId, comment }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    await load();
  };

  if (!production.row) return null;

  return (
    <article className="crm-person-card-shell">
      <header><h2>Brief créatif</h2></header>
      {error ? <p role="alert" className="form-message is-error">{error}</p> : null}
      {sourceState !== "exact" ? (
        <p role="alert" className="form-message is-error">
          Le rattachement Sheets n’est plus vérifiable ({sourceState}). Aucune création ou association automatique n’est autorisée.
        </p>
      ) : null}
      {message ? <p className="form-message is-success">{message}</p> : null}
      {briefs.map((brief) => (
        <section key={brief.id}>
          <h3>{brief.title}</h3>
          <p>État : {brief.status}</p>
          <p>Version des conditions : {brief.conditionsVersion}</p>
          {brief.sourceLinkStatus !== "exact" ? (
            <p role="alert">La production source a changé. Vérification manuelle requise.</p>
          ) : null}
          {brief.status === "draft" ? (
            <button type="button" className="primary-button" onClick={() => void transition(brief.id, "publish").catch((failure) => setError(failure.message))}>Publier volontairement</button>
          ) : null}
          {brief.status === "published" ? (
            <>
              <h4>Candidatures</h4>
              {brief.applications.filter((application) => application.status === "interested").map((application) => (
                <label key={application.creativeProfileId}>
                  <input type="radio" name={`candidate-${brief.id}`} value={application.creativeProfileId} onChange={() => setSelectedCreative(application.creativeProfileId)} />
                  {application.displayName} — {application.message || "Sans message"}
                </label>
              ))}
              <button type="button" disabled={!selectedCreative} onClick={() => void transition(brief.id, "assign", selectedCreative).catch((failure) => setError(failure.message))}>Attribuer explicitement</button>
            </>
          ) : null}
          {brief.deliveryStatus === "delivered" || brief.deliveryStatus === "changes_requested" ? (
            <div>
              <p>{brief.deliveryComment}</p>
              <ul>{(brief.deliveryLinks ?? []).map((link) => <li key={link}><a href={link} target="_blank" rel="noreferrer">Ouvrir la livraison</a></li>)}</ul>
              <textarea aria-label="Retour de livraison" onChange={(event) => setMessage(event.target.value)} />
              <button type="button" onClick={() => void transition(brief.id, "request_changes", undefined, message).catch((failure) => setError(failure.message))}>Demander un complément</button>
              <button type="button" onClick={() => void transition(brief.id, "validate_delivery").catch((failure) => setError(failure.message))}>Valider la livraison</button>
            </div>
          ) : null}
          {brief.status === "published" || brief.status === "assigned" ? (
            <details>
              <summary>Modifier les conditions substantielles</summary>
              <p>Rémunération, frais, livrables, droits, date, lieu ou échéance. Toute modification demande un nouvel accord.</p>
              <form onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const paid = data.get("compensationType") === "paid_mandate";
                const amount = String(data.get("amount") ?? "").trim();
                fetch("/api/admin/production-creative-briefs", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    briefId: brief.id,
                    action: "update_conditions",
                    conditions: {
                      compensation: paid
                        ? { type: "paid_mandate", amountMinor: amount ? Math.round(Number(amount) * 100) : null, currency: String(data.get("currency") ?? "") }
                        : { type: "unpaid_collaboration", amountMinor: null, currency: null },
                      expensesCovered: data.get("expensesCovered") === "on",
                      expenseTerms: String(data.get("expenseTerms") ?? ""),
                      deliverables: String(data.get("deliverables") ?? ""),
                      creditsAndUsage: String(data.get("creditsAndUsage") ?? ""),
                      scheduledDate: String(data.get("scheduledDate") ?? "") || null,
                      dateToAgree: data.get("dateToAgree") === "on",
                      region: String(data.get("region") ?? ""),
                      locationDetails: String(data.get("locationDetails") ?? "") || null,
                      deliveryDueDate: String(data.get("deliveryDueDate") ?? "") || null,
                    },
                  }),
                }).then(async (response) => {
                  const payload = await response.json();
                  if (!response.ok) throw new Error(payload.error);
                }).then(load).catch((failure) => setError(failure.message));
              }}>
                <label>Cadre financier<select name="compensationType" defaultValue={brief.compensationType}><option value="unpaid_collaboration">Collaboration non rémunérée</option><option value="paid_mandate">Mandat rémunéré</option></select></label>
                <label>Montant<input name="amount" type="number" min="0" step="0.01" defaultValue={brief.compensationAmountMinor === null ? "" : brief.compensationAmountMinor / 100} /></label>
                <label>Devise<input name="currency" defaultValue={brief.compensationCurrency ?? ""} maxLength={3} /></label>
                <label><input name="expensesCovered" type="checkbox" defaultChecked={brief.expensesCovered} /> Frais pris en charge</label>
                <label>Conditions des frais<textarea name="expenseTerms" defaultValue={brief.expenseTerms} required /></label>
                <label>Livrables<textarea name="deliverables" defaultValue={brief.deliverables} required /></label>
                <label>Crédits et utilisation<textarea name="creditsAndUsage" defaultValue={brief.creditsAndUsage} required /></label>
                <label>Date<input name="scheduledDate" type="date" defaultValue={brief.scheduledDate ?? ""} /></label>
                <label><input name="dateToAgree" type="checkbox" defaultChecked={brief.dateToAgree} /> Date à convenir</label>
                <label>Région<input name="region" defaultValue={brief.region} required /></label>
                <label>Lieu<input name="locationDetails" defaultValue={brief.locationDetails ?? ""} /></label>
                <label>Échéance<input name="deliveryDueDate" type="date" defaultValue={brief.deliveryDueDate ?? ""} /></label>
                <button type="submit">Enregistrer et demander un nouvel accord</button>
              </form>
            </details>
          ) : null}
          {brief.assignmentHistory.length > 0 ? (
            <details>
              <summary>Historique des attributions</summary>
              <ul>{brief.assignmentHistory.map((assignment) => (
                <li key={assignment.id}>
                  {assignment.displayName} — {assignment.status} — conditions v{assignment.conditionsVersion}
                  {assignment.refusalReason ? ` — ${assignment.refusalReason}` : ""}
                  {assignment.deliveryStatus !== "pending" ? ` — livraison ${assignment.deliveryStatus}` : ""}
                </li>
              ))}</ul>
            </details>
          ) : null}
        </section>
      ))}
      {briefs.length === 0 ? (
        <form onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const recipientIds = data.getAll("recipientIds").map(String);
          const paid = data.get("compensationType") === "paid_mandate";
          const amount = String(data.get("amount") ?? "").trim();
          const body = {
            productionSourceRow: production.row,
            productionSnapshot: sourceSnapshot(production),
            title: String(data.get("title") ?? ""),
            creativeType: data.get("creativeType"),
            athletes: athleteId ? [{ id: athleteId, name: production.athlete }] : [],
            scheduledDate: production.date.match(/^\d{4}-\d{2}-\d{2}$/) ? production.date : null,
            dateToAgree: data.get("dateToAgree") === "on",
            region: String(data.get("region") ?? ""),
            locationDetails: production.lieu,
            objective: String(data.get("objective") ?? ""),
            deliverables: String(data.get("deliverables") ?? ""),
            deliveryDueDate: String(data.get("deliveryDueDate") ?? "") || null,
            compensation: paid
              ? { type: "paid_mandate", amountMinor: amount ? Math.round(Number(amount) * 100) : null, currency: String(data.get("currency") ?? "") }
              : { type: "unpaid_collaboration", amountMinor: null, currency: null },
            expensesCovered: data.get("expensesCovered") === "on",
            expenseTerms: String(data.get("expenseTerms") ?? ""),
            creditsAndUsage: String(data.get("creditsAndUsage") ?? ""),
            necessaryContactDetails: String(data.get("necessaryContactDetails") ?? "") || null,
            recipientIds,
          };
          fetch("/api/admin/production-creative-briefs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }).then(async (response) => {
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error);
          }).then(load).catch((failure) => setError(failure.message));
        }}>
          {!athleteId ? <p className="form-message is-error">Associez d’abord un athlète disposant d’un identifiant fiable.</p> : null}
          <label>Titre<input name="title" defaultValue={`${production.type} — ${production.athlete}`} required /></label>
          <label>Type<select name="creativeType"><option value="photo">Photo</option><option value="video">Vidéo</option><option value="photo_video">Photo + vidéo</option></select></label>
          <label><input name="dateToAgree" type="checkbox" defaultChecked={!production.date.match(/^\d{4}-\d{2}-\d{2}$/)} /> Date à convenir</label>
          <label>Région<input name="region" required /></label>
          <label>Objectif<textarea name="objective" defaultValue={production.objectif === "—" ? "" : production.objectif} required /></label>
          <label>Livrables<textarea name="deliverables" required /></label>
          <label>Échéance<input name="deliveryDueDate" type="date" /></label>
          <label>Cadre financier<select name="compensationType"><option value="unpaid_collaboration">Collaboration non rémunérée</option><option value="paid_mandate">Mandat rémunéré</option></select></label>
          <label>Montant (si rémunéré)<input name="amount" type="number" min="0" step="0.01" /></label>
          <label>Devise<input name="currency" maxLength={3} placeholder="CHF" /></label>
          <label><input name="expensesCovered" type="checkbox" /> Frais pris en charge</label>
          <label>Conditions des frais<textarea name="expenseTerms" required /></label>
          <label>Crédits et utilisation<textarea name="creditsAndUsage" required /></label>
          <label>Coordonnées utiles après confirmation<textarea name="necessaryContactDetails" /></label>
          <fieldset><legend>Destinataires</legend>{creatives.map((creative) => <label key={creative.id}><input type="checkbox" name="recipientIds" value={creative.id} />{creative.displayName}</label>)}</fieldset>
          <button type="submit" className="primary-button" disabled={!athleteId || sourceState !== "exact"}>Préparer le brief</button>
        </form>
      ) : null}
    </article>
  );
}
