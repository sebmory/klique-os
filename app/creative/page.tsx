"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreativeMissionResponseDisplayState,
  CreativePortalMission,
} from "@/lib/creative-missions";

type MissionsPayload = {
  missions?: CreativePortalMission[];
  error?: string;
};

const typeLabels: Record<string, string> = {
  photo: "Photo",
  video: "Vidéo",
  photo_video: "Photo + vidéo",
};

const contextLabels: Record<string, string> = {
  match: "Match",
  competition: "Compétition",
  training: "Entraînement",
  posed_portraits: "Portraits posés",
  event: "Événement",
  other: "Autre",
};

const compensationLabels: Record<string, string> = {
  unpaid_collaboration: "Collaboration non rémunérée",
  expenses_only: "Défraiement uniquement",
  paid_mandate: "Mandat rémunéré",
  internal_klique: "Mission interne KLIQUE",
};

const responseLabels: Record<CreativeMissionResponseDisplayState, string> = {
  pending: "En attente de réponse",
  accepted: "Acceptée",
  refused: "Refusée",
  assignment_changed: "Affectation modifiée depuis la réponse",
  cancelled: "Mission annulée",
};

const formatDate = (value: string | null): string => {
  if (!value) return "Non renseignée";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
};

const formatMoney = (cents: number | null): string | null =>
  cents === null
    ? null
    : new Intl.NumberFormat("fr-CH", {
        style: "currency",
        currency: "CHF",
      }).format(cents / 100);

function MissionCard({
  mission,
  onResponded,
}: {
  mission: CreativePortalMission;
  onResponded: () => Promise<void>;
}) {
  const [action, setAction] = useState<"accepted" | "refused" | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const canRespond = mission.missionStatus !== "cancelled";

  const submit = async () => {
    if (!action || pendingRef.current || (action === "refused" && !note.trim())) return;
    pendingRef.current = true;
    setSubmitting(true);
    setError("");
    const fingerprint = JSON.stringify({ action, note: note.trim() || null });
    idempotencyRef.current = idempotencyRef.current?.fingerprint === fingerprint
      ? idempotencyRef.current
      : { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/creative/missions", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reference: mission.reference,
          action,
          note: note.trim() || null,
          idempotencyKey: idempotencyRef.current.key,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Impossible d’enregistrer votre réponse.");
      }
      idempotencyRef.current = null;
      setAction(null);
      setNote("");
      await onResponded();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Impossible d’enregistrer votre réponse.",
      );
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <article style={{
      border: "1px solid var(--border-color, #d1d5db)",
      borderRadius: 16,
      padding: 20,
      display: "grid",
      gap: 14,
    }}>
      <header>
        <small>Référence {mission.reference}</small>
        <h2 style={{ margin: "0.35rem 0" }}>{mission.title}</h2>
        <strong>{responseLabels[mission.response.state]}</strong>
      </header>
      <dl style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        margin: 0,
      }}>
        <div><dt>Discipline</dt><dd>{mission.discipline}</dd></div>
        <div>
          <dt>Type et contexte</dt>
          <dd>{typeLabels[mission.missionType] ?? mission.missionType} · {contextLabels[mission.missionContext] ?? mission.missionContext}</dd>
        </div>
        <div>
          <dt>Date et horaires (Europe/Zurich)</dt>
          <dd>
            {formatDate(mission.missionDate)}
            {mission.startTime ? ` · ${mission.startTime}${mission.endTime ? `–${mission.endTime}` : ""}` : ""}
          </dd>
        </div>
        <div>
          <dt>Lieu</dt>
          <dd>{mission.locationName}{mission.locationDetails ? ` · ${mission.locationDetails}` : ""}</dd>
        </div>
        <div><dt>Échéance de livraison</dt><dd>{formatDate(mission.deliveryDueDate)}</dd></div>
        <div>
          <dt>Conditions</dt>
          <dd>
            {compensationLabels[mission.compensationType] ?? mission.compensationType}
            {formatMoney(mission.compensationAmountChfCents) ? ` · ${formatMoney(mission.compensationAmountChfCents)}` : ""}
            {mission.expenseDetails ? ` · ${mission.expenseDetails}` : ""}
          </dd>
        </div>
        <div style={{ gridColumn: "1 / -1" }}><dt>Brief</dt><dd>{mission.brief}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt>Livrables</dt><dd>{mission.deliverables}</dd></div>
      </dl>

      {mission.response.note ? <p style={{ margin: 0 }}><strong>Votre note :</strong> {mission.response.note}</p> : null}
      {canRespond ? (
        <section aria-label={`Répondre à la mission ${mission.reference}`} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" disabled={submitting} onClick={() => setAction("accepted")}>
              Accepter la mission
            </button>
            <button type="button" disabled={submitting} onClick={() => setAction("refused")}>
              Refuser la mission
            </button>
          </div>
          {action ? (
            <>
              <label style={{ display: "grid", gap: 4 }}>
                {action === "refused" ? "Motif du refus (obligatoire)" : "Note (facultative)"}
                <textarea
                  maxLength={500}
                  required={action === "refused"}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={submitting || (action === "refused" && !note.trim())}
                  onClick={() => void submit()}
                >
                  {submitting ? "Enregistrement…" : "Confirmer ma réponse"}
                </button>
                <button type="button" disabled={submitting} onClick={() => { setAction(null); setNote(""); }}>
                  Annuler
                </button>
              </div>
            </>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
        </section>
      ) : (
        <p>Cette mission est annulée et ne peut plus être acceptée.</p>
      )}
    </article>
  );
}

export default function CreativePortalPage() {
  const [missions, setMissions] = useState<CreativePortalMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/creative/missions", {
      credentials: "include",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as MissionsPayload | null;
    if (!response.ok || !Array.isArray(payload?.missions)) {
      throw new Error(payload?.error || "Accès créatif refusé.");
    }
    setMissions(payload.missions);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load)
      .catch((failure) => setError(
        failure instanceof Error ? failure.message : "Impossible de charger les missions.",
      ))
      .finally(() => setLoading(false));
  }, [load]);

  return (
    <section style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 20 }}>
      <header>
        <p style={{ margin: 0 }}>Espace créatif</p>
        <h1 style={{ margin: "0.25rem 0" }}>Mes missions</h1>
        <p>Uniquement les missions qui vous sont personnellement affectées.</p>
      </header>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <p role="status">Chargement des missions…</p> : null}
      {!loading && !error && missions.length === 0 ? (
        <p>Aucune mission affectée pour le moment.</p>
      ) : null}
      {!loading && !error ? missions.map((mission) => (
        <MissionCard key={mission.reference} mission={mission} onResponded={load} />
      )) : null}
    </section>
  );
}
