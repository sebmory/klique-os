"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildMissionWhatsAppAnnouncement,
  formatMissionDateZurich,
  type AthleteServiceMission,
  type AthleteServiceMissionCompensationType,
  type AthleteServiceMissionContext,
  type AthleteServiceMissionInput,
  type AthleteServiceMissionRecord,
  type AthleteServiceMissionStatus,
  type AthleteServiceMissionType,
} from "@/lib/athlete-service-mission-domain";
import { CreativeMissionResponsePanel } from "@/components/creatives/CreativeMissionResponsePanel";

type Payload = {
  records?: AthleteServiceMissionRecord[];
  record?: AthleteServiceMissionRecord;
  error?: string;
};

type FormState = Omit<
  AthleteServiceMissionInput,
  "compensationAmountChfCents" | "locationDetails" | "startTime" | "endTime"
  | "deliveryDueDate" | "expenseDetails" | "internalAdminNotes"
> & {
  compensationAmountChf: string;
  locationDetails: string;
  startTime: string;
  endTime: string;
  deliveryDueDate: string;
  expenseDetails: string;
  internalAdminNotes: string;
};

const emptyForm = (): FormState => ({
  title: "",
  brief: "",
  sportDiscipline: "",
  missionType: "photo",
  missionContext: "match",
  locationName: "",
  locationDetails: "",
  missionDate: "",
  startTime: "",
  endTime: "",
  deliveryDueDate: "",
  deliverables: "",
  compensationType: "unpaid_collaboration",
  compensationAmountChf: "",
  expenseDetails: "",
  internalAdminNotes: "",
  status: "draft",
});

const toForm = (mission: AthleteServiceMission): FormState => ({
  title: mission.title,
  brief: mission.brief,
  sportDiscipline: mission.sportDiscipline,
  missionType: mission.missionType,
  missionContext: mission.missionContext,
  locationName: mission.locationName,
  locationDetails: mission.locationDetails ?? "",
  missionDate: mission.missionDate,
  startTime: mission.startTime ?? "",
  endTime: mission.endTime ?? "",
  deliveryDueDate: mission.deliveryDueDate ?? "",
  deliverables: mission.deliverables,
  compensationType: mission.compensationType,
  compensationAmountChf: mission.compensationAmountChfCents === null
    ? ""
    : (mission.compensationAmountChfCents / 100).toFixed(2),
  expenseDetails: mission.expenseDetails ?? "",
  internalAdminNotes: mission.internalAdminNotes ?? "",
  status: mission.status === "cancelled" ? "draft" : mission.status,
});

const statusLabels: Record<AthleteServiceMissionStatus, string> = {
  draft: "Brouillon",
  ready: "Prête",
  cancelled: "Annulée",
};

const typeLabels: Record<AthleteServiceMissionType, string> = {
  photo: "Photo",
  video: "Vidéo",
  photo_video: "Photo + vidéo",
};

const contextLabels: Record<AthleteServiceMissionContext, string> = {
  match: "Match",
  competition: "Compétition",
  training: "Entraînement",
  posed_portraits: "Portraits posés",
  event: "Événement",
  other: "Autre",
};

const compensationLabels: Record<AthleteServiceMissionCompensationType, string> = {
  unpaid_collaboration: "Collaboration non rémunérée",
  expenses_only: "Défraiement uniquement",
  paid_mandate: "Mandat rémunéré",
  internal_klique: "Mission interne KLIQUE",
};

const historyActionLabels = {
  created: "Création",
  updated: "Modification",
  cancelled: "Annulation",
} as const;

const formatTimestamp = (value: string) => new Intl.DateTimeFormat("fr-CH", {
  timeZone: "Europe/Zurich",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));

const toNullable = (value: string): string | null => value.trim() || null;

const amountToCents = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  const [francs, cents = ""] = normalized.split(".");
  return Number(francs) * 100 + Number(cents.padEnd(2, "0"));
};

const buildInput = (form: FormState): AthleteServiceMissionInput => ({
  title: form.title,
  brief: form.brief,
  sportDiscipline: form.sportDiscipline,
  missionType: form.missionType,
  missionContext: form.missionContext,
  locationName: form.locationName,
  locationDetails: toNullable(form.locationDetails),
  missionDate: form.missionDate,
  startTime: toNullable(form.startTime),
  endTime: toNullable(form.endTime),
  deliveryDueDate: toNullable(form.deliveryDueDate),
  deliverables: form.deliverables,
  compensationType: form.compensationType,
  compensationAmountChfCents: form.compensationType === "paid_mandate"
    ? amountToCents(form.compensationAmountChf)
    : null,
  expenseDetails: toNullable(form.expenseDetails),
  internalAdminNotes: toNullable(form.internalAdminNotes),
  status: form.status,
});

const MissionSummary = ({
  record,
  onCopy,
}: {
  record: AthleteServiceMissionRecord;
  onCopy?: () => void;
}) => {
  const mission = record.mission;
  if (!mission) return <p style={{ margin: 0 }}>Aucune fiche mission.</p>;
  return (
    <div style={{ display: "grid", gap: "0.45rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <strong>{mission.title}</strong>
        <span className={`crm-status-badge ${mission.status === "cancelled" ? "is-inactif" : mission.status === "ready" ? "is-actif" : "is-prospect"}`}>
          {statusLabels[mission.status]}
        </span>
      </div>
      <span>
        {typeLabels[mission.missionType]} · {mission.sportDiscipline} · {formatMissionDateZurich(mission.missionDate)}
        {mission.startTime ? ` · ${mission.startTime}${mission.endTime ? `–${mission.endTime}` : ""}` : ""}
      </span>
      <span>{mission.locationName}</span>
      <small>Référence {mission.referenceCode}</small>
      {onCopy && mission.status !== "cancelled" ? (
        <button type="button" className="crm-secondary-action-link" onClick={onCopy}>
          Copier l’annonce WhatsApp
        </button>
      ) : null}
    </div>
  );
};

export function AthleteServiceMissionPanel({
  requestId,
  athleteId,
  editable = false,
}: {
  requestId?: string;
  athleteId?: string;
  editable?: boolean;
}) {
  const [records, setRecords] = useState<AthleteServiceMissionRecord[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = requestId
        ? `requestId=${encodeURIComponent(requestId)}`
        : `athleteId=${encodeURIComponent(athleteId ?? "")}`;
      const response = await fetch(`/api/admin/athlete-service-missions?${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok) throw new Error(payload?.error || "Impossible de charger les fiches mission.");
      const nextRecords = payload?.records ?? [];
      setRecords(nextRecords);
      if (requestId) {
        const mission = nextRecords[0]?.mission;
        setForm(mission ? toForm(mission) : emptyForm());
        setEditorOpen(!mission);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Impossible de charger les fiches mission.");
    } finally {
      setLoading(false);
    }
  }, [athleteId, requestId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const record = requestId ? records[0] ?? null : null;

  const replaceRecord = (next: AthleteServiceMissionRecord) => {
    setRecords((current) => current.some((item) => item.requestId === next.requestId)
      ? current.map((item) => item.requestId === next.requestId ? next : item)
      : [next, ...current]);
  };

  const mutate = async (action: "save" | "cancel") => {
    if (!requestId || submittingRef.current) return;
    const input = action === "save" ? buildInput(form) : null;
    if (
      action === "save"
      && input?.compensationType === "paid_mandate"
      && !Number.isSafeInteger(input.compensationAmountChfCents)
    ) {
      setError("Le montant CHF doit contenir au maximum deux décimales.");
      return;
    }
    if (action === "cancel" && !window.confirm("Confirmer l’annulation de cette mission ?")) return;

    submittingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    const fingerprint = JSON.stringify({ action, input });
    idempotencyRef.current = idempotencyRef.current?.fingerprint === fingerprint
      ? idempotencyRef.current
      : { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/admin/athlete-service-missions", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          requestId,
          idempotencyKey: idempotencyRef.current.key,
          ...(action === "save" ? { mission: input } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !payload?.record) {
        throw new Error(payload?.error || "Impossible de modifier la fiche mission.");
      }
      replaceRecord(payload.record);
      if (payload.record.mission) setForm(toForm(payload.record.mission));
      setEditorOpen(false);
      setMessage(action === "cancel" ? "Mission annulée." : "Fiche mission enregistrée.");
      idempotencyRef.current = null;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Impossible de modifier la fiche mission.");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const copyAnnouncement = async (mission: AthleteServiceMission) => {
    try {
      await navigator.clipboard.writeText(buildMissionWhatsAppAnnouncement(mission));
      setMessage("Annonce WhatsApp copiée dans le presse-papiers.");
      setError("");
    } catch {
      setError("Impossible de copier l’annonce dans le presse-papiers.");
    }
  };

  if (loading) {
    return <section aria-busy="true" aria-live="polite"><p>Chargement de la fiche mission…</p></section>;
  }
  if (error && records.length === 0) {
    return (
      <section role="alert">
        <p>{error}</p>
        <button type="button" className="crm-secondary-action-link" onClick={() => void load()}>
          Réessayer
        </button>
      </section>
    );
  }

  if (!requestId) {
    return (
      <article className="crm-person-card-shell" aria-labelledby={`missions-${athleteId}`}>
        <header><h2 id={`missions-${athleteId}`}>Missions créatives</h2></header>
        {records.some((item) => item.mission) ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            {records.filter((item) => item.mission).map((item) => (
              <section key={item.requestId} style={{ display: "grid", gap: "0.45rem" }}>
                <h3 style={{ margin: 0, fontSize: "1rem" }}>{item.productName}</h3>
                <MissionSummary record={item} />
                {item.creativeResponse ? (
                  <CreativeMissionResponsePanel response={item.creativeResponse} />
                ) : null}
              </section>
            ))}
          </div>
        ) : <p>Aucune fiche mission pour cet Athlète.</p>}
      </article>
    );
  }

  if (!record) return <p role="alert">Demande de prestation introuvable.</p>;
  const mission = record.mission;
  const readyWithoutCreative = (editorOpen ? form.status : mission?.status) === "ready"
    && !record.assignedCreativeProfileId;

  return (
    <section aria-labelledby={`mission-${requestId}`} style={{ display: "grid", gap: "0.85rem", borderTop: "1px solid #e5e7eb", paddingTop: "0.85rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.65rem", alignItems: "center" }}>
        <h3 id={`mission-${requestId}`} style={{ margin: 0 }}>Fiche mission</h3>
        {editable && mission?.status !== "cancelled" ? (
          <button type="button" className="crm-secondary-action-link" onClick={() => setEditorOpen((value) => !value)}>
            {editorOpen ? "Fermer le formulaire" : mission ? "Modifier" : "Créer la mission"}
          </button>
        ) : null}
      </div>

      {!editorOpen ? (
        <>
          <MissionSummary
            record={record}
            onCopy={mission ? () => void copyAnnouncement(mission) : undefined}
          />
          {mission && record.creativeResponse ? (
            <CreativeMissionResponsePanel response={record.creativeResponse} />
          ) : null}
        </>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); void mutate("save"); }} style={{ display: "grid", gap: "0.8rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <label style={{ display: "grid", gap: "0.3rem" }}>Titre<input required maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Discipline sportive<input required maxLength={100} value={form.sportDiscipline} onChange={(event) => setForm({ ...form, sportDiscipline: event.target.value })} /></label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Type de mission<select value={form.missionType} onChange={(event) => setForm({ ...form, missionType: event.target.value as AthleteServiceMissionType })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Contexte<select value={form.missionContext} onChange={(event) => setForm({ ...form, missionContext: event.target.value as AthleteServiceMissionContext })}>{Object.entries(contextLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Lieu<input required maxLength={180} value={form.locationName} onChange={(event) => setForm({ ...form, locationName: event.target.value })} /></label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Date<input required type="date" value={form.missionDate} onChange={(event) => setForm({ ...form, missionDate: event.target.value })} /></label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Heure de début<input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Heure de fin<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Date limite de livraison<input type="date" value={form.deliveryDueDate} onChange={(event) => setForm({ ...form, deliveryDueDate: event.target.value })} /></label>
            <label style={{ display: "grid", gap: "0.3rem" }}>Conditions<select value={form.compensationType} onChange={(event) => setForm({ ...form, compensationType: event.target.value as AthleteServiceMissionCompensationType, compensationAmountChf: event.target.value === "paid_mandate" ? form.compensationAmountChf : "" })}>{Object.entries(compensationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {form.compensationType === "paid_mandate" ? <label style={{ display: "grid", gap: "0.3rem" }}>Montant CHF<input required inputMode="decimal" placeholder="250.00" value={form.compensationAmountChf} onChange={(event) => setForm({ ...form, compensationAmountChf: event.target.value })} /></label> : null}
            <label style={{ display: "grid", gap: "0.3rem" }}>Statut éditorial<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState["status"] })}><option value="draft">Brouillon</option><option value="ready">Prête</option></select></label>
          </div>
          <label style={{ display: "grid", gap: "0.3rem" }}>Brief<textarea required maxLength={5000} rows={5} value={form.brief} onChange={(event) => setForm({ ...form, brief: event.target.value })} /></label>
          <label style={{ display: "grid", gap: "0.3rem" }}>Adresse / indications<textarea maxLength={1500} rows={2} value={form.locationDetails} onChange={(event) => setForm({ ...form, locationDetails: event.target.value })} /></label>
          <label style={{ display: "grid", gap: "0.3rem" }}>Livrables attendus<textarea required maxLength={3000} rows={3} value={form.deliverables} onChange={(event) => setForm({ ...form, deliverables: event.target.value })} /></label>
          <label style={{ display: "grid", gap: "0.3rem" }}>Détails de défraiement<textarea maxLength={1500} rows={2} value={form.expenseDetails} onChange={(event) => setForm({ ...form, expenseDetails: event.target.value })} /></label>
          <label style={{ display: "grid", gap: "0.3rem" }}>Notes internes Admin<textarea maxLength={4000} rows={3} value={form.internalAdminNotes} onChange={(event) => setForm({ ...form, internalAdminNotes: event.target.value })} /></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
            <button type="submit" className="crm-partner-approve" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer la mission"}</button>
            {mission && mission.status !== "cancelled" ? <button type="button" className="crm-partner-reject" disabled={saving} onClick={() => void mutate("cancel")}>Annuler la mission</button> : null}
          </div>
        </form>
      )}

      {readyWithoutCreative ? (
        <p role="status" style={{ margin: 0, color: "#92400e" }}>
          Cette mission est prête mais aucun créatif n’est actuellement affecté.
        </p>
      ) : null}
      {mission ? (
        <details>
          <summary>Historique de la mission ({record.history.length})</summary>
          <ol style={{ display: "grid", gap: "0.45rem", paddingLeft: "1.25rem" }}>
            {record.history.map((event) => (
              <li key={event.id}>
                <strong>{historyActionLabels[event.action]}</strong>
                {" · "}
                {event.changedFields.join(", ")}
                <br />
                <small>{formatTimestamp(event.createdAt)} · Admin {event.authoredByClerkUserId}</small>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <div aria-live="polite" aria-atomic="true">
        {message ? <p style={{ color: "#166534", margin: 0 }}>{message}</p> : null}
        {error ? <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
      </div>
    </section>
  );
}
