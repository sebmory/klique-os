"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CreativeMissionExecutionStatus } from "@/lib/creative-mission-execution";
import type {
  CreativeMissionResponseDisplayState,
  CreativePortalMission,
} from "@/lib/creative-missions";

type MissionsPayload = {
  missions?: CreativePortalMission[];
  error?: string;
};

type MissionFilter = "to_respond" | "to_do" | "delivered" | "completed";

const filterLabels: Record<MissionFilter, string> = {
  to_respond: "À répondre",
  to_do: "À réaliser",
  delivered: "Livrées",
  completed: "Terminées",
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

const executionLabels: Record<CreativeMissionExecutionStatus, string> = {
  accepted: "Acceptée",
  in_progress: "En cours",
  delivered: "Livrée",
  changes_requested: "Modifications demandées",
  completed: "Terminée",
};

export const categorizeCreativeMission = (mission: CreativePortalMission): MissionFilter => {
  if (mission.execution?.status === "completed") return "completed";
  if (mission.execution?.status === "delivered") return "delivered";
  if (
    mission.execution
    && ["accepted", "in_progress", "changes_requested"].includes(mission.execution.status)
  ) {
    return "to_do";
  }
  return "to_respond";
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
  onReload,
  onDelivered,
}: {
  mission: CreativePortalMission;
  onReload: () => Promise<void>;
  onDelivered: () => void;
}) {
  const [responseAction, setResponseAction] = useState<"accepted" | "refused" | null>(null);
  const [note, setNote] = useState("");
  const [deliveryLinks, setDeliveryLinks] = useState<string[]>(() =>
    mission.execution?.deliveryLinks.length
      ? [...mission.execution.deliveryLinks]
      : [""]
  );
  const [deliveryNote, setDeliveryNote] = useState(
    mission.execution?.deliveryNote ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const canRespond = mission.missionStatus !== "cancelled"
    && (mission.response.state === "pending" || mission.response.state === "refused");
  const canDeliver = mission.execution?.status === "in_progress"
    || mission.execution?.status === "changes_requested";

  useEffect(() => {
    if (!canDeliver) return;
    setDeliveryLinks(
      mission.execution?.deliveryLinks.length
        ? [...mission.execution.deliveryLinks]
        : [""],
    );
    setDeliveryNote(mission.execution?.deliveryNote ?? "");
  }, [
    canDeliver,
    mission.execution?.deliveredAt,
    mission.execution?.deliveryLinks,
    mission.execution?.deliveryNote,
  ]);

  const submitResponse = async () => {
    if (
      !responseAction
      || pendingRef.current
      || (responseAction === "refused" && !note.trim())
    ) return;
    pendingRef.current = true;
    setSubmitting(true);
    setError("");
    const fingerprint = JSON.stringify({ action: responseAction, note: note.trim() || null });
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
          action: responseAction,
          note: note.trim() || null,
          idempotencyKey: idempotencyRef.current.key,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Impossible d’enregistrer votre réponse.");
      }
      idempotencyRef.current = null;
      setResponseAction(null);
      setNote("");
      await onReload();
    } catch (failure) {
      setError(failure instanceof Error
        ? failure.message
        : "Impossible d’enregistrer votre réponse.");
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  };

  const startMission = async () => {
    if (pendingRef.current || mission.execution?.status !== "accepted") return;
    pendingRef.current = true;
    setSubmitting(true);
    setError("");
    const fingerprint = JSON.stringify({ action: "started" });
    idempotencyRef.current = idempotencyRef.current?.fingerprint === fingerprint
      ? idempotencyRef.current
      : { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/creative/missions", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reference: mission.reference,
          action: "started",
          note: null,
          deliveryLinks: [],
          idempotencyKey: idempotencyRef.current.key,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Impossible de commencer la mission.");
      }
      idempotencyRef.current = null;
      await onReload();
    } catch (failure) {
      setError(failure instanceof Error
        ? failure.message
        : "Impossible de commencer la mission.");
    } finally {
      pendingRef.current = false;
      setSubmitting(false);
    }
  };

  const updateDeliveryLink = (index: number, value: string) => {
    setDeliveryLinks((current) => current.map((link, position) =>
      position === index ? value : link
    ));
  };

  const addDeliveryLink = () => {
    setDeliveryLinks((current) => current.length >= 10 ? current : [...current, ""]);
  };

  const removeDeliveryLink = (index: number) => {
    setDeliveryLinks((current) => {
      const next = current.filter((_, position) => position !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const submitDelivery = async () => {
    if (pendingRef.current || !canDeliver) return;
    const links = deliveryLinks.map((link) => link.trim()).filter(Boolean);
    const normalizedNote = deliveryNote.trim();
    if (links.length === 0 && !normalizedNote) {
      setError("Ajoutez au moins un lien HTTPS ou une note de livraison.");
      return;
    }
    const hasInvalidLink = links.some((link) => {
      try {
        const parsed = new URL(link);
        return parsed.protocol !== "https:" || Boolean(parsed.username || parsed.password);
      } catch {
        return true;
      }
    });
    if (hasInvalidLink) {
      setError("Chaque lien de livraison doit être une URL HTTPS valide.");
      return;
    }

    pendingRef.current = true;
    setSubmitting(true);
    setError("");
    const payload = {
      action: "delivered" as const,
      note: normalizedNote || null,
      deliveryLinks: links,
    };
    const fingerprint = JSON.stringify(payload);
    idempotencyRef.current = idempotencyRef.current?.fingerprint === fingerprint
      ? idempotencyRef.current
      : { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/creative/missions", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reference: mission.reference,
          ...payload,
          idempotencyKey: idempotencyRef.current.key,
        }),
      });
      const responsePayload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(responsePayload?.error || "Impossible d’envoyer la livraison.");
      }
      idempotencyRef.current = null;
      await onReload();
      onDelivered();
    } catch (failure) {
      setError(failure instanceof Error
        ? failure.message
        : "Impossible d’envoyer la livraison.");
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <strong>{responseLabels[mission.response.state]}</strong>
          {mission.execution ? <span>{executionLabels[mission.execution.status]}</span> : null}
        </div>
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
        <div><dt>Lieu</dt><dd>{mission.locationName}{mission.locationDetails ? ` · ${mission.locationDetails}` : ""}</dd></div>
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
      {mission.execution?.changeRequestNote ? (
        <p role="status" style={{ margin: 0 }}>
          <strong>Modifications demandées :</strong> {mission.execution.changeRequestNote}
        </p>
      ) : null}
      {mission.execution?.deliveryLinks.length ? (
        <section aria-label="Livraison actuelle" style={{ display: "grid", gap: 6 }}>
          <strong>Liens livrés</strong>
          <ul style={{ margin: 0 }}>
            {mission.execution.deliveryLinks.map((link) => (
              <li key={link}>
                <a href={link} target="_blank" rel="noreferrer">Ouvrir le livrable</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {mission.execution?.deliveryNote ? (
        <p style={{ margin: 0 }}><strong>Note de livraison :</strong> {mission.execution.deliveryNote}</p>
      ) : null}
      {mission.execution?.status === "accepted" ? (
        <button type="button" disabled={submitting} onClick={() => void startMission()}>
          {submitting ? "Démarrage…" : "Commencer la mission"}
        </button>
      ) : null}
      {canDeliver ? (
        <section aria-labelledby={`delivery-${mission.reference}`} style={{ display: "grid", gap: 10 }}>
          <h3 id={`delivery-${mission.reference}`} style={{ margin: 0 }}>Livrer la mission</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {deliveryLinks.map((link, index) => (
              <div key={`${mission.reference}-link-${index}`} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <label style={{ display: "grid", gap: 4, flex: "1 1 280px" }}>
                  Lien HTTPS {index + 1}
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    value={link}
                    onChange={(event) => updateDeliveryLink(index, event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={submitting}
                  aria-label={`Supprimer le lien ${index + 1}`}
                  onClick={() => removeDeliveryLink(index)}
                >
                  Supprimer
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={submitting || deliveryLinks.length >= 10}
              onClick={addDeliveryLink}
            >
              Ajouter un lien
            </button>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            Note de livraison (facultative si un lien est fourni)
            <textarea
              maxLength={2000}
              value={deliveryNote}
              onChange={(event) => setDeliveryNote(event.target.value)}
            />
          </label>
          <button type="button" disabled={submitting} onClick={() => void submitDelivery()}>
            {submitting ? "Envoi…" : "Envoyer la livraison"}
          </button>
        </section>
      ) : null}
      {canRespond ? (
        <section aria-label={`Répondre à la mission ${mission.reference}`} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" disabled={submitting} onClick={() => setResponseAction("accepted")}>
              Accepter la mission
            </button>
            <button type="button" disabled={submitting} onClick={() => setResponseAction("refused")}>
              Refuser la mission
            </button>
          </div>
          {responseAction ? (
            <>
              <label style={{ display: "grid", gap: 4 }}>
                {responseAction === "refused" ? "Motif du refus (obligatoire)" : "Note (facultative)"}
                <textarea
                  maxLength={500}
                  required={responseAction === "refused"}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={submitting || (responseAction === "refused" && !note.trim())}
                  onClick={() => void submitResponse()}
                >
                  {submitting ? "Enregistrement…" : "Confirmer ma réponse"}
                </button>
                <button type="button" disabled={submitting} onClick={() => { setResponseAction(null); setNote(""); }}>
                  Annuler
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </article>
  );
}

export function CreativeMissionContent({
  missions,
  onReload,
}: {
  missions: CreativePortalMission[];
  onReload: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<MissionFilter>("to_do");
  const counts = missions.reduce<Record<MissionFilter, number>>((result, mission) => {
    result[categorizeCreativeMission(mission)] += 1;
    return result;
  }, { to_respond: 0, to_do: 0, delivered: 0, completed: 0 });
  const visibleMissions = missions
    .filter((mission) => categorizeCreativeMission(mission) === filter)
    .sort((left, right) => left.missionDate.localeCompare(right.missionDate));

  return (
    <>
      <nav aria-label="Filtrer les missions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(Object.keys(filterLabels) as MissionFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {filterLabels[value]} ({counts[value]})
          </button>
        ))}
      </nav>
      {visibleMissions.length === 0 ? <p>Aucune mission dans cette section.</p> : null}
      {visibleMissions.map((mission) => (
        <MissionCard
          key={mission.reference}
          mission={mission}
          onReload={onReload}
          onDelivered={() => setFilter("delivered")}
        />
      ))}
    </>
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
      {!loading && !error && missions.length > 0 ? (
        <CreativeMissionContent missions={missions} onReload={load} />
      ) : null}
    </section>
  );
}