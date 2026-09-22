"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, RotateCcw, XCircle } from "lucide-react";
import type {
  PartnerBenefitReservation,
  PartnerBenefitReservationGroups,
  PartnerBenefitReservationStatus,
} from "@/lib/partner-benefits/partner-reservation-service";
import { Button } from "@/src/design-system/components";

type TabId = PartnerBenefitReservationStatus;

type ReservationsPayload = {
  reservations?: PartnerBenefitReservationGroups;
  reservation?: PartnerBenefitReservation;
  error?: string;
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "reserved", label: "En attente" },
  { id: "used", label: "Utilisées" },
  { id: "cancelled", label: "Annulées" },
  { id: "expired", label: "Expirées" },
];

const emptyLabels: Record<TabId, string> = {
  reserved: "Aucune réservation en attente.",
  used: "Aucun avantage confirmé comme utilisé.",
  cancelled: "Aucune réservation annulée.",
  expired: "Aucune réservation expirée.",
};

const dateFormatter = new Intl.DateTimeFormat("fr-CH", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatDate = (value: string | null): string => {
  if (!value) return "Sans échéance";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date inconnue" : dateFormatter.format(date);
};

const emptyGroups = (): PartnerBenefitReservationGroups => ({
  reserved: [],
  used: [],
  cancelled: [],
  expired: [],
});

const errorFromResponse = async (response: Response, fallback: string): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as ReservationsPayload | null;
  return payload?.error || fallback;
};

export default function PartnerBenefitReservationsPage() {
  const [groups, setGroups] = useState<PartnerBenefitReservationGroups>(emptyGroups);
  const [activeTab, setActiveTab] = useState<TabId>("reserved");
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    const loadReservations = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/partner/benefit-reservations", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await errorFromResponse(response, "Impossible de charger les réservations d’avantages."));
        }
        const payload = (await response.json()) as ReservationsPayload;
        if (!payload.reservations) throw new Error("Réponse des réservations incomplète.");
        if (active) setGroups(payload.reservations);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Impossible de charger les réservations d’avantages.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadReservations();
    return () => { active = false; };
  }, [retryToken]);

  const visibleReservations = useMemo(() => groups[activeTab], [activeTab, groups]);

  const transition = async (
    reservation: PartnerBenefitReservation,
    action: "mark_used" | "cancel",
  ) => {
    const confirmed = window.confirm(
      action === "mark_used"
        ? `Confirmer que l’avantage « ${reservation.benefitTitle} » a été utilisé après prestation ?`
        : `Refuser ou annuler la réservation pour « ${reservation.benefitTitle} » ?`,
    );
    if (!confirmed) return;

    setPendingId(reservation.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/partner/benefit-reservations/${reservation.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        throw new Error(await errorFromResponse(
          response,
          action === "mark_used" ? "La confirmation d’utilisation a échoué." : "L’annulation a échoué.",
        ));
      }
      const payload = (await response.json()) as ReservationsPayload;
      if (!payload.reservation) throw new Error("Réponse de transition incomplète.");
      const updated = payload.reservation;
      setGroups((current) => ({
        ...current,
        reserved: current.reserved.filter((item) => item.id !== updated.id),
        [updated.status]: [updated, ...current[updated.status]],
      }));
      setSuccess(action === "mark_used"
        ? "L’avantage a été confirmé comme utilisé."
        : "La réservation a été annulée.");
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : "La transition a échoué.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <main className="partner-portal partner-benefit-reservations-page">
      <header className="partner-portal-hero">
        <p>Avantages membres</p>
        <h1>Réservations d’avantages</h1>
      </header>

      <section className="partner-benefit-guidance" aria-labelledby="benefit-validation-title">
        <CheckCircle2 size={20} aria-hidden />
        <div>
          <h2 id="benefit-validation-title">Validation après prestation</h2>
          <p>Confirmez un avantage comme utilisé uniquement après la réalisation effective de la prestation. Cette validation est définitive.</p>
        </div>
      </section>

      <div className="partner-benefit-tabs" role="tablist" aria-label="Statut des réservations">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="partner-benefit-reservations-panel"
            className={activeTab === tab.id ? "is-active" : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}<span>{groups[tab.id].length}</span>
          </button>
        ))}
      </div>

      {loading ? <section className="partner-portal-state" role="status">Chargement des réservations…</section> : null}
      {!loading && error ? (
        <section className="partner-portal-state partner-benefit-error" role="alert">
          <p>{error}</p>
          <Button
            type="button"
            style={{ background: "transparent", border: "1px solid currentColor", color: "inherit" }}
            onClick={() => setRetryToken((value) => value + 1)}
          >
            <RotateCcw size={15} aria-hidden /> Réessayer
          </Button>
        </section>
      ) : null}
      {success ? <p className="partner-benefit-success" role="status">{success}</p> : null}

      {!loading && !error ? (
        <section id="partner-benefit-reservations-panel" role="tabpanel" className="partner-benefit-panel">
          {visibleReservations.length === 0 ? (
            <p className="partner-benefit-empty">{emptyLabels[activeTab]}</p>
          ) : (
            <div className="partner-benefit-table-wrap">
              <table className="partner-benefit-table">
                <thead>
                  <tr>
                    <th>Athlète</th>
                    <th>Avantage</th>
                    <th>Date de réservation</th>
                    <th>Échéance</th>
                    {activeTab === "reserved" ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleReservations.map((reservation) => {
                    const pending = pendingId === reservation.id;
                    return (
                      <tr key={reservation.id}>
                        <td data-label="Athlète"><strong>{reservation.athleteId}</strong></td>
                        <td data-label="Avantage"><strong>{reservation.benefitTitle}</strong><small>{reservation.benefitDetails}</small></td>
                        <td data-label="Réservation">{formatDate(reservation.reservedAt)}</td>
                        <td data-label="Échéance"><Clock3 size={14} aria-hidden /> {formatDate(reservation.expiresAt)}</td>
                        {activeTab === "reserved" ? (
                          <td data-label="Actions" className="partner-benefit-actions">
                            <Button type="button" disabled={pending} onClick={() => void transition(reservation, "mark_used")}>
                              <CheckCircle2 size={15} aria-hidden /> {pending ? "Traitement…" : "Confirmer comme utilisée"}
                            </Button>
                            <Button
                              type="button"
                              style={{ background: "transparent", border: "1px solid currentColor", color: "inherit" }}
                              disabled={pending}
                              onClick={() => void transition(reservation, "cancel")}
                            >
                              <XCircle size={15} aria-hidden /> Refuser / Annuler
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}