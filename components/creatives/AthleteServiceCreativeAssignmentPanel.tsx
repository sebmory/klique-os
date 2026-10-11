"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssignmentCreativeSummary,
  AthleteServiceCreativeAssignment,
} from "@/lib/athlete-service-creative-assignments";

type Payload = {
  creatives?: AssignmentCreativeSummary[];
  assignments?: AthleteServiceCreativeAssignment[];
  assignment?: AthleteServiceCreativeAssignment;
  error?: string;
};

const typeLabels: Record<AssignmentCreativeSummary["creativeType"], string> = {
  photographer: "Photographe",
  videographer: "Vidéaste",
  both: "Photo & vidéo",
};

const actionLabels: Record<AthleteServiceCreativeAssignment["history"][number]["action"], string> = {
  assigned: "Affectation",
  replaced: "Remplacement",
  unassigned: "Retrait",
};

const formatDate = (value: string) => new Intl.DateTimeFormat("fr-CH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(new Date(value));

const creativeLabel = (creative: AssignmentCreativeSummary) =>
  `${creative.displayName} — ${typeLabels[creative.creativeType]} — ${creative.area}`;

export function AthleteServiceCreativeAssignmentPanel({
  requestId,
  athleteId,
  editable = false,
}: {
  requestId?: string;
  athleteId?: string;
  editable?: boolean;
}) {
  const [creatives, setCreatives] = useState<AssignmentCreativeSummary[]>([]);
  const [assignments, setAssignments] = useState<AthleteServiceCreativeAssignment[]>([]);
  const [selectedCreativeId, setSelectedCreativeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const idempotencyRef = useRef<{ desiredId: string; key: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = requestId
        ? `requestId=${encodeURIComponent(requestId)}`
        : `athleteId=${encodeURIComponent(athleteId ?? "")}`;
      const response = await fetch(`/api/admin/athlete-service-creative-assignments?${query}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok) throw new Error(payload?.error || "Impossible de charger les affectations.");
      const nextAssignments = payload?.assignments ?? [];
      setCreatives(payload?.creatives ?? []);
      setAssignments(nextAssignments);
      if (requestId) setSelectedCreativeId(nextAssignments[0]?.creative?.id ?? "");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Impossible de charger les affectations.");
    } finally {
      setLoading(false);
    }
  }, [athleteId, requestId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const assignment = requestId ? assignments[0] ?? null : null;

  const save = async () => {
    if (!requestId || !assignment || submittingRef.current) return;
    const currentId = assignment.creative?.id ?? "";
    if (selectedCreativeId === currentId) return;
    if (
      currentId
      && !window.confirm(
        selectedCreativeId
          ? "Confirmer le remplacement du créatif affecté ?"
          : "Confirmer le retrait du créatif affecté ?",
      )
    ) {
      setSelectedCreativeId(currentId);
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    idempotencyRef.current = idempotencyRef.current?.desiredId === selectedCreativeId
      ? idempotencyRef.current
      : { desiredId: selectedCreativeId, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/admin/athlete-service-creative-assignments", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId,
          creativeProfileId: selectedCreativeId || null,
          idempotencyKey: idempotencyRef.current.key,
        }),
      });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok || !payload?.assignment) {
        throw new Error(payload?.error || "Impossible de modifier l’affectation.");
      }
      setAssignments([payload.assignment]);
      setSelectedCreativeId(payload.assignment.creative?.id ?? "");
      setMessage(selectedCreativeId ? "Affectation enregistrée." : "Affectation retirée.");
      idempotencyRef.current = null;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Impossible de modifier l’affectation.");
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return <section aria-busy="true" aria-live="polite"><p>Chargement des affectations créatives…</p></section>;
  }

  if (error && assignments.length === 0) {
    return (
      <section role="alert">
        <p>{error}</p>
        <button type="button" className="crm-secondary-action-link" onClick={() => void load()}>
          Réessayer
        </button>
      </section>
    );
  }

  const renderAssignment = (item: AthleteServiceCreativeAssignment, showProduct: boolean) => (
    <section key={item.requestId} style={{ display: "grid", gap: "0.65rem" }}>
      {showProduct ? <h4 style={{ margin: 0 }}>{item.productName}</h4> : null}
      <p style={{ margin: 0 }}>
        <strong>Créatif actuel : </strong>
        {item.creative ? creativeLabel(item.creative) : "Aucun créatif affecté"}
      </p>
      <details>
        <summary>Historique ({item.history.length})</summary>
        {item.history.length > 0 ? (
          <ol style={{ display: "grid", gap: "0.45rem", paddingLeft: "1.25rem" }}>
            {item.history.map((event) => (
              <li key={event.id}>
                <strong>{actionLabels[event.action]}</strong>
                {" · "}
                {event.creative
                  ? creativeLabel(event.creative)
                  : `Aucun créatif${event.previousCreative ? ` (après ${event.previousCreative.displayName})` : ""}`}
                <br />
                <small>{formatDate(event.createdAt)} · Admin {event.authoredByClerkUserId}</small>
              </li>
            ))}
          </ol>
        ) : <p>Aucune modification enregistrée.</p>}
      </details>
    </section>
  );

  if (!requestId) {
    return (
      <article className="crm-person-card-shell" aria-labelledby={`creative-assignments-${athleteId}`}>
        <header><h2 id={`creative-assignments-${athleteId}`}>Créatifs affectés</h2></header>
        {assignments.length > 0 ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            {assignments.map((item) => renderAssignment(item, true))}
          </div>
        ) : <p>Aucune demande de prestation avec affectation.</p>}
      </article>
    );
  }

  if (!assignment) return <p role="alert">Demande de prestation introuvable.</p>;

  return (
    <section aria-labelledby={`creative-assignment-${requestId}`} style={{ display: "grid", gap: "0.75rem" }}>
      <h3 id={`creative-assignment-${requestId}`} style={{ margin: 0 }}>Affectation créative</h3>
      {renderAssignment(assignment, false)}
      {editable ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.65rem", alignItems: "end" }}>
          <label style={{ display: "grid", gap: "0.3rem" }}>
            Créatif
            <select
              value={selectedCreativeId}
              onChange={(event) => {
                setSelectedCreativeId(event.target.value);
                setMessage("");
                setError("");
              }}
              disabled={saving}
            >
              <option value="">Aucun créatif affecté</option>
              {creatives.map((creative) => (
                <option key={creative.id} value={creative.id}>{creativeLabel(creative)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="crm-partner-approve"
            disabled={saving || selectedCreativeId === (assignment.creative?.id ?? "")}
            onClick={() => void save()}
          >
            {saving ? "Enregistrement…" : "Enregistrer l’affectation"}
          </button>
        </div>
      ) : null}
      <div aria-live="polite" aria-atomic="true">
        {message ? <p style={{ color: "#166534", margin: 0 }}>{message}</p> : null}
        {error ? <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
      </div>
    </section>
  );
}
