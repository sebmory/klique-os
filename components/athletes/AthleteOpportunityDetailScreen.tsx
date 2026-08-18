"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const KLIQUE_GOLD = "#e8b84b";
const SURFACE_BORDER = "rgba(255, 255, 255, 0.09)";
const SURFACE_BG = "rgba(255, 255, 255, 0.035)";
const TEXT_MUTED = "#9ca3af";

type OpportunityRecord = {
  id: string;
  title: string;
  type: string;
  organization: string;
  targetAudience: string;
  sportOrDomain: string;
  location: string;
  date: string;
  deadline: string;
  description: string;
  requirements: string;
  practicalInfo: string;
  status: string;
};

type SlotRecord = {
  id: string;
  opportunityId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: string;
};

type SlotRequestRecord = {
  id: string;
  slotId: string;
  opportunityId: string;
  status: "requested" | "confirmed" | "declined" | "cancelled";
};

const requestStatusLabels: Record<SlotRequestRecord["status"], string> = {
  requested: "En attente",
  confirmed: "Confirmée",
  declined: "Refusée",
  cancelled: "Annulée",
};

const publishedStatuses = ["Ouverte", "Bientôt", "Fermée"];

const normalize = (value: unknown): string => String(value ?? "").trim();

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date inconnue" : dateFormatter.format(parsed);
};

const formatTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "--:--" : timeFormatter.format(parsed);
};

type AthleteOpportunityDetailScreenProps = {
  id: string;
};

export function AthleteOpportunityDetailScreen({ id }: AthleteOpportunityDetailScreenProps) {
  const [opportunity, setOpportunity] = useState<OpportunityRecord | null>(null);
  const [slots, setSlots] = useState<SlotRecord[]>([]);
  const [requests, setRequests] = useState<SlotRequestRecord[]>([]);
  const [confirmedBySlot, setConfirmedBySlot] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    const response = await fetch(`/api/hub-opportunity-slots?opportunityId=${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) throw new Error("Unable to load slots");

    const payload = (await response.json()) as { slots?: SlotRecord[]; requests?: SlotRequestRecord[] };
    setSlots(Array.isArray(payload.slots) ? payload.slots : []);
    setRequests(Array.isArray(payload.requests) ? payload.requests : []);
  }, [id]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      setActionError(null);

      try {
        const opportunitiesResponse = await fetch("/api/hub-opportunities", { credentials: "include", cache: "no-store" });
        if (!opportunitiesResponse.ok) throw new Error("Unable to load opportunity");

        const payload = (await opportunitiesResponse.json()) as { opportunities?: Array<Record<string, unknown>> };
        const found = (payload.opportunities ?? []).find((item) => normalize(item.id) === id) ?? null;

        if (!active) return;

        if (!found || !publishedStatuses.includes(normalize(found.status))) {
          setOpportunity(null);
          setErrorMessage("Cette opportunité n’est pas disponible.");
          return;
        }

        setOpportunity({
          id: normalize(found.id),
          title: normalize(found.title),
          type: normalize(found.type) || "Autre",
          organization: normalize(found.organization),
          targetAudience: normalize(found.targetAudience),
          sportOrDomain: normalize(found.sportOrDomain),
          location: normalize(found.location),
          date: normalize(found.date),
          deadline: normalize(found.deadline),
          description: normalize(found.description),
          requirements: normalize(found.requirements),
          practicalInfo: normalize(found.practicalInfo),
          status: normalize(found.status),
        });

        await loadSlots();
      } catch {
        if (!active) return;
        setErrorMessage("Cette opportunité n’a pas pu être chargée.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [id, loadSlots]);

  const ownRequest = requests.find((item) => item.opportunityId === id) ?? null;
  const hasBlockingRequest = Boolean(ownRequest && (ownRequest.status === "requested" || ownRequest.status === "confirmed"));
  const openSlots = slots.filter((slot) => slot.status === "open");

  const handleRequestSlot = async (slotId: string) => {
    setActionError(null);
    setPendingSlotId(slotId);

    try {
      const response = await fetch("/api/hub-opportunity-slots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-slot", slotId }),
      });

      if (response.status === 409) {
        setActionError("Ce créneau est complet ou une demande confirmée existe déjà.");
        return;
      }

      if (!response.ok) throw new Error("Unable to request slot");

      const payload = (await response.json()) as { request?: SlotRequestRecord };
      if (payload.request) {
        setRequests((current) => [payload.request as SlotRequestRecord, ...current.filter((item) => item.id !== payload.request?.id)]);
      }

      await loadSlots();
    } catch {
      setActionError("Votre demande n’a pas pu être envoyée.");
    } finally {
      setPendingSlotId(null);
    }
  };

  useEffect(() => {
    setConfirmedBySlot(
      requests.reduce<Record<string, number>>((accumulator, item) => {
        if (item.status === "confirmed") {
          accumulator[item.slotId] = (accumulator[item.slotId] ?? 0) + 1;
        }
        return accumulator;
      }, {}),
    );
  }, [requests]);

  return (
    <section
      style={{
        padding: "1.5rem",
        maxWidth: "1180px",
        margin: "0 auto",
        display: "grid",
        gap: "1.25rem",
        background: "#0a0b0f",
        borderRadius: "24px",
      }}
    >
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <Link href="/athlete/opportunities" style={{ color: TEXT_MUTED, fontSize: "0.85rem", textDecoration: "none" }}>
          ← Retour aux opportunités
        </Link>
        <p style={{ margin: 0, fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: "0.14em", color: TEXT_MUTED, fontWeight: 700 }}>
          Opportunité
        </p>
        <h1 style={{ margin: 0, fontSize: "1.5rem", color: "#f8fafc" }}>{opportunity?.title ?? "Opportunité"}</h1>
      </header>

      {loading ? (
        <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.92rem" }} aria-live="polite">Chargement de l’opportunité…</p>
      ) : errorMessage ? (
        <p role="alert" style={{ margin: 0, borderRadius: "14px", border: "1px solid rgba(248, 113, 113, 0.35)", background: "rgba(248, 113, 113, 0.12)", color: "#fecaca", padding: "0.8rem 0.9rem", fontSize: "0.92rem" }}>
          {errorMessage}
        </p>
      ) : opportunity ? (
        <>
          <article
            style={{
              border: `1px solid ${SURFACE_BORDER}`,
              borderRadius: "20px",
              background: "linear-gradient(160deg, #14151a 0%, #0e0f13 60%, #0a0b0f 100%)",
              padding: "1.25rem",
              display: "grid",
              gap: "0.9rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "0.68rem", color: KLIQUE_GOLD, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700 }}>
                {opportunity.type}
              </span>
              <span style={{ borderRadius: "999px", padding: "0.16rem 0.55rem", fontSize: "0.68rem", fontWeight: 700, background: "rgba(255, 255, 255, 0.06)", color: "#d1d5db", border: `1px solid ${SURFACE_BORDER}` }}>
                {opportunity.status}
              </span>
            </div>

            <div style={{ display: "grid", gap: "0.35rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", color: TEXT_MUTED, fontSize: "0.9rem" }}>
              <span>Organisation : {opportunity.organization || "Non renseignée"}</span>
              <span>Public concerné : {opportunity.targetAudience || "Non renseigné"}</span>
              <span>Sport / domaine : {opportunity.sportOrDomain || "Non renseigné"}</span>
              <span>Lieu : {opportunity.location || "Non renseigné"}</span>
              <span>Date : {opportunity.date || "Non renseignée"}</span>
              <span>Deadline : {opportunity.deadline || "Non renseignée"}</span>
            </div>

            <div style={{ display: "grid", gap: "0.6rem", color: "#d1d5db", lineHeight: 1.6, fontSize: "0.94rem" }}>
              <div>
                <h2 style={{ margin: "0 0 0.2rem", fontSize: "0.95rem", color: "#f8fafc" }}>Description</h2>
                <p style={{ margin: 0 }}>{opportunity.description || "Non renseignée"}</p>
              </div>
              <div>
                <h2 style={{ margin: "0 0 0.2rem", fontSize: "0.95rem", color: "#f8fafc" }}>Conditions / prérequis</h2>
                <p style={{ margin: 0 }}>{opportunity.requirements || "Non renseignés"}</p>
              </div>
              <div>
                <h2 style={{ margin: "0 0 0.2rem", fontSize: "0.95rem", color: "#f8fafc" }}>Informations pratiques</h2>
                <p style={{ margin: 0 }}>{opportunity.practicalInfo || "Non renseignées"}</p>
              </div>
            </div>
          </article>

          <section style={{ display: "grid", gap: "0.8rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.05rem", color: "#f8fafc" }}>Créneaux disponibles</h2>

            {ownRequest ? (
              <p style={{ margin: 0, borderRadius: "14px", border: "1px solid rgba(232, 184, 75, 0.45)", background: "rgba(232, 184, 75, 0.14)", color: KLIQUE_GOLD, padding: "0.75rem 0.9rem", fontSize: "0.9rem" }}>
                Votre demande pour cette opportunité est : {requestStatusLabels[ownRequest.status]}.
              </p>
            ) : null}

            {actionError ? (
              <p role="alert" style={{ margin: 0, borderRadius: "14px", border: "1px solid rgba(248, 113, 113, 0.35)", background: "rgba(248, 113, 113, 0.12)", color: "#fecaca", padding: "0.75rem 0.9rem", fontSize: "0.9rem" }}>
                {actionError}
              </p>
            ) : null}

            {openSlots.length === 0 ? (
              <p style={{ margin: 0, color: TEXT_MUTED, fontSize: "0.92rem", background: SURFACE_BG, borderRadius: "14px", padding: "0.75rem 0.9rem" }}>
                Aucun créneau ouvert n’est disponible pour le moment.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                {openSlots.map((slot) => {
                  const confirmed = confirmedBySlot[slot.id] ?? 0;
                  const isPending = pendingSlotId === slot.id;

                  return (
                    <article
                      key={slot.id}
                      style={{
                        border: `1px solid ${SURFACE_BORDER}`,
                        borderRadius: "16px",
                        background: SURFACE_BG,
                        padding: "0.9rem",
                        display: "grid",
                        gap: "0.5rem",
                        alignContent: "start",
                      }}
                    >
                      <strong style={{ color: "#f8fafc", fontSize: "0.98rem" }}>{formatDate(slot.startsAt)}</strong>
                      <span style={{ color: TEXT_MUTED, fontSize: "0.88rem" }}>
                        {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
                      </span>
                      <span style={{ color: TEXT_MUTED, fontSize: "0.85rem" }}>
                        {confirmed} / {slot.capacity} place(s) confirmée(s)
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRequestSlot(slot.id)}
                        disabled={hasBlockingRequest || isPending}
                        style={{
                          marginTop: "0.2rem",
                          borderRadius: "999px",
                          border: "1px solid rgba(232, 184, 75, 0.45)",
                          background: hasBlockingRequest || isPending ? "rgba(232, 184, 75, 0.18)" : KLIQUE_GOLD,
                          color: hasBlockingRequest || isPending ? "#f8fafc" : "#0a0b0f",
                          fontWeight: 800,
                          fontSize: "0.88rem",
                          padding: "0.6rem 1rem",
                          cursor: hasBlockingRequest || isPending ? "not-allowed" : "pointer",
                          opacity: hasBlockingRequest || isPending ? 0.75 : 1,
                        }}
                      >
                        {isPending ? "Envoi en cours…" : hasBlockingRequest ? "Demande déjà envoyée" : "Demander ce créneau"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
