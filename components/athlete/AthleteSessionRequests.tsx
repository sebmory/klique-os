"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  AthleteSessionRequest,
  AthleteSessionRequestType,
} from "@/lib/athlete-session-requests";

type FormState = {
  requestType: AthleteSessionRequestType;
  sport: string;
  eventType: string;
  date: string;
  startTime: string;
  endTime: string;
  scheduleToConfirm: boolean;
  locationName: string;
  region: string;
  clubOrTeam: string;
  opponentOrEvent: string;
  objective: string;
  deliverables: string;
  practicalInformation: string;
  desiredDurationMinutes: string;
  constraintsComment: string;
  periods: Array<{ date: string; startTime: string; endTime: string }>;
};

const emptyForm = (): FormState => ({
  requestType: "match_competition",
  sport: "",
  eventType: "Match",
  date: "",
  startTime: "",
  endTime: "",
  scheduleToConfirm: false,
  locationName: "",
  region: "",
  clubOrTeam: "",
  opponentOrEvent: "",
  objective: "",
  deliverables: "",
  practicalInformation: "",
  desiredDurationMinutes: "120",
  constraintsComment: "",
  periods: [
    { date: "", startTime: "", endTime: "" },
    { date: "", startTime: "", endTime: "" },
  ],
});

const statusLabels: Record<AthleteSessionRequest["workflowStatus"], string> = {
  draft: "Brouillon",
  submitted: "À examiner",
  admin_review: "À examiner",
  accepted: "À organiser",
  refused: "Classée sans suite",
  changes_requested: "À examiner — complément demandé",
  production_linked: "À organiser",
  proposed_to_creatives: "Proposition envoyée",
  candidate_received: "Proposition envoyée",
  assigned: "Confirmation en attente",
  creative_agreed: "Confirmation en attente",
  confirmed: "Confirmée",
  completed: "Terminée",
  cancelled: "Annulée",
};

const formatZurich = (value: string | null) => value
  ? new Intl.DateTimeFormat("fr-CH", {
      timeZone: "Europe/Zurich",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))
  : "À convenir";

export function AthleteSessionRequests() {
  const [requests, setRequests] = useState<AthleteSessionRequest[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [complements, setComplements] = useState<Record<string, string>>({});
  const submissionKey = useRef(crypto.randomUUID());
  const pendingRef = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/athlete/session-requests", {
      credentials: "include",
      cache: "no-store",
    });
    const payload = await response.json() as { requests?: AthleteSessionRequest[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Impossible de charger vos demandes.");
    setRequests(payload.requests ?? []);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load)
      .catch((failure) => setError(failure instanceof Error ? failure.message : "Chargement impossible."))
      .finally(() => setLoading(false));
  }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const body = form.requestType === "match_competition"
        ? {
            idempotencyKey: submissionKey.current,
            requestType: form.requestType,
            sport: form.sport,
            eventType: form.eventType,
            date: form.date,
            startTime: form.startTime,
            endTime: form.endTime,
            scheduleToConfirm: form.scheduleToConfirm,
            locationName: form.locationName,
            region: form.region,
            clubOrTeam: form.clubOrTeam,
            opponentOrEvent: form.opponentOrEvent,
            objective: form.objective,
            deliverables: form.deliverables,
            practicalInformation: form.practicalInformation,
            constraintsComment: form.constraintsComment,
          }
        : {
            idempotencyKey: submissionKey.current,
            requestType: form.requestType,
            locationName: form.locationName,
            region: form.region,
            objective: form.objective,
            deliverables: form.deliverables,
            desiredDurationMinutes: Number(form.desiredDurationMinutes),
            constraintsComment: form.constraintsComment,
            practicalInformation: form.practicalInformation,
            periods: form.periods,
          };
      const response = await fetch("/api/athlete/session-requests", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { request?: AthleteSessionRequest; error?: string };
      if (!response.ok || !payload.request) {
        throw new Error(payload.error || "Impossible d’envoyer la demande.");
      }
      setRequests((current) => [
        payload.request!,
        ...current.filter((item) => item.id !== payload.request!.id),
      ]);
      submissionKey.current = crypto.randomUUID();
      setForm(emptyForm());
      setOpen(false);
      setMessage("Votre demande a été envoyée à KLIQUE. La disponibilité reste à confirmer.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Envoi impossible.");
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  };

  const mutate = async (
    requestId: string,
    action: "cancel" | "respond_complement",
  ) => {
    setError("");
    const response = await fetch("/api/athlete/session-requests", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId,
        action,
        complement: complements[requestId],
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const payload = await response.json() as { request?: AthleteSessionRequest; error?: string };
    if (!response.ok) throw new Error(payload.error || "Action impossible.");
    await load();
    setComplements((current) => ({ ...current, [requestId]: "" }));
  };

  return (
    <section className="athlete-session-requests" aria-labelledby="athlete-session-title">
      <header>
        <div>
          <p>Production KLIQUE</p>
          <h2 id="athlete-session-title">Demander une séance</h2>
          <span>
            Proposez votre besoin. KLIQUE doit l’accepter, trouver un créatif puis confirmer
            définitivement la séance.
          </span>
        </div>
        <button type="button" className="primary-button" onClick={() => setOpen((value) => !value)}>
          {open ? "Fermer" : "Nouvelle demande"}
        </button>
      </header>

      {open ? (
        <form className="athlete-session-form" onSubmit={submit}>
          <fieldset className="athlete-session-kind">
            <legend>Type de séance</legend>
            <label>
              <input
                type="radio"
                name="requestType"
                value="match_competition"
                checked={form.requestType === "match_competition"}
                onChange={() => setForm({ ...emptyForm(), requestType: "match_competition" })}
              />
              Match ou compétition
            </label>
            <label>
              <input
                type="radio"
                name="requestType"
                value="media_day"
                checked={form.requestType === "media_day"}
                onChange={() => setForm({ ...emptyForm(), requestType: "media_day" })}
              />
              Media Day
            </label>
          </fieldset>

          {form.requestType === "match_competition" ? (
            <>
              <label>Sport<input required value={form.sport} onChange={(event) => setForm({ ...form, sport: event.target.value })} /></label>
              <label>Type d’événement<input required value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })} /></label>
              <label>Date<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              <label>Début<input type="time" required value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
              <label>Fin<input type="time" required value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
              <label className="athlete-session-checkbox"><input type="checkbox" checked={form.scheduleToConfirm} onChange={(event) => setForm({ ...form, scheduleToConfirm: event.target.checked })} />Horaire encore à confirmer</label>
              <label>Équipe ou club<input value={form.clubOrTeam} onChange={(event) => setForm({ ...form, clubOrTeam: event.target.value })} /></label>
              <label>Adversaire ou événement<input value={form.opponentOrEvent} onChange={(event) => setForm({ ...form, opponentOrEvent: event.target.value })} /></label>
            </>
          ) : (
            <>
              <label>Durée souhaitée
                <select value={form.desiredDurationMinutes} onChange={(event) => setForm({ ...form, desiredDurationMinutes: event.target.value })}>
                  <option value="60">1 heure</option>
                  <option value="90">1 h 30</option>
                  <option value="120">2 heures</option>
                  <option value="180">3 heures</option>
                  <option value="240">4 heures</option>
                </select>
              </label>
              {form.periods.map((period, index) => (
                <fieldset key={index} className="athlete-session-period">
                  <legend>Période souhaitée {index + 1}</legend>
                  <label>Date<input type="date" required value={period.date} onChange={(event) => setForm({ ...form, periods: form.periods.map((item, position) => position === index ? { ...item, date: event.target.value } : item) })} /></label>
                  <label>Début<input type="time" required value={period.startTime} onChange={(event) => setForm({ ...form, periods: form.periods.map((item, position) => position === index ? { ...item, startTime: event.target.value } : item) })} /></label>
                  <label>Fin<input type="time" required value={period.endTime} onChange={(event) => setForm({ ...form, periods: form.periods.map((item, position) => position === index ? { ...item, endTime: event.target.value } : item) })} /></label>
                </fieldset>
              ))}
              <button type="button" className="secondary-button" disabled={form.periods.length >= 5} onClick={() => setForm({ ...form, periods: [...form.periods, { date: "", startTime: "", endTime: "" }] })}>Ajouter une période</button>
            </>
          )}

          <label>Lieu<input value={form.locationName} onChange={(event) => setForm({ ...form, locationName: event.target.value })} /></label>
          <label>Région<input required value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} /></label>
          <label>Objectif<textarea required value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} /></label>
          <label>Livrables souhaités<textarea required value={form.deliverables} onChange={(event) => setForm({ ...form, deliverables: event.target.value })} /></label>
          <label>Informations pratiques<textarea value={form.practicalInformation} onChange={(event) => setForm({ ...form, practicalInformation: event.target.value })} /></label>
          <label>Contraintes ou commentaire<textarea value={form.constraintsComment} onChange={(event) => setForm({ ...form, constraintsComment: event.target.value })} /></label>
          <p className="athlete-session-notice">
            L’envoi ne réserve aucun créatif et ne garantit pas encore la séance.
          </p>
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? "Envoi…" : "Envoyer la demande"}
          </button>
        </form>
      ) : null}

      {error ? <p className="form-message is-error" role="alert">{error}</p> : null}
      {message ? <p className="form-message is-success" role="status">{message}</p> : null}

      <div className="athlete-session-history">
        <h3>Mes demandes</h3>
        {loading ? <p>Chargement…</p> : requests.length === 0 ? (
          <p>Aucune demande de séance pour le moment.</p>
        ) : requests.map((request) => (
          <article key={request.id}>
            <header>
              <div>
                <strong>{request.requestType === "media_day" ? "Media Day" : `${request.eventType} · ${request.sport}`}</strong>
                <span>{formatZurich(request.eventStartsAt ?? request.periods[0]?.startsAt ?? null)}</span>
              </div>
              <mark>{statusLabels[request.workflowStatus]}</mark>
            </header>
            <p>{request.objective}</p>
            <dl>
              <div><dt>Région</dt><dd>{request.region}</dd></div>
              <div><dt>Prochaine étape</dt><dd>{request.nextAction}</dd></div>
            </dl>
            {request.adminReason ? <p className="athlete-session-reason"><strong>Message de KLIQUE :</strong> {request.adminReason}</p> : null}
            {request.workflowStatus === "changes_requested" ? (
              <div className="athlete-session-complement">
                <label>Votre complément<textarea value={complements[request.id] ?? ""} onChange={(event) => setComplements({ ...complements, [request.id]: event.target.value })} /></label>
                <button type="button" className="primary-button" disabled={!complements[request.id]?.trim()} onClick={() => void mutate(request.id, "respond_complement").catch((failure) => setError(failure.message))}>Envoyer le complément</button>
              </div>
            ) : null}
            {!["confirmed", "completed", "cancelled", "refused"].includes(request.workflowStatus) ? (
              <button type="button" className="secondary-button" onClick={() => void mutate(request.id, "cancel").catch((failure) => setError(failure.message))}>Annuler ma demande</button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
