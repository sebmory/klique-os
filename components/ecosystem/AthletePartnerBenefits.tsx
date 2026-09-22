"use client";

import Link from "next/link";
import { CalendarClock, Gift, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AthletePartnerBenefit,
  AthletePartnerBenefitPersonalStatus,
  AthletePartnerBenefitReservation,
  AthletePartnerBenefitUsagePolicy,
} from "@/lib/partner-benefits/athlete-service";
import { Button } from "@/src/design-system/components";

type AthletePartnerBenefitsProps = {
  mode: "partner" | "summary";
  partnerId?: string;
};

type BenefitsPayload = {
  benefits?: AthletePartnerBenefit[];
  error?: string;
};

type ReservationPayload = {
  reservation?: AthletePartnerBenefitReservation;
  error?: string;
};

const statusLabels: Record<AthletePartnerBenefitPersonalStatus, string> = {
  available: "Disponible",
  reserved: "Réservé",
  used: "Utilisé",
  cancelled: "Annulé",
  expired: "Expiré",
};

const policyLabels: Record<AthletePartnerBenefitUsagePolicy, string> = {
  once_lifetime: "Une fois pendant votre parcours KLIQUE",
  once_per_membership: "Une fois par adhésion",
  unlimited: "Utilisation illimitée",
};

const statusColors: Record<AthletePartnerBenefitPersonalStatus, { background: string; color: string }> = {
  available: { background: "#dcfce7", color: "#166534" },
  reserved: { background: "#fef3c7", color: "#92400e" },
  used: { background: "#e0f2fe", color: "#075985" },
  cancelled: { background: "#f5f5f4", color: "#57534e" },
  expired: { background: "#fee2e2", color: "#991b1b" },
};

const formatDate = (value: string | null): string => {
  if (!value) return "Sans échéance";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("fr-CH", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Zurich",
      });
};

const responseError = async (response: Response, fallback: string): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
};

export function AthletePartnerBenefits({ mode, partnerId }: AthletePartnerBenefitsProps) {
  const [benefits, setBenefits] = useState<AthletePartnerBenefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingBenefitId, setPendingBenefitId] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    const loadBenefits = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/athlete/partner-benefits", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await responseError(response, "Impossible de charger vos avantages partenaires."));
        }
        const payload = (await response.json()) as BenefitsPayload;
        if (!Array.isArray(payload.benefits)) throw new Error("Réponse des avantages partenaires incomplète.");
        if (active) setBenefits(payload.benefits);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Impossible de charger vos avantages partenaires.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadBenefits();
    return () => { active = false; };
  }, [retryToken]);

  const visibleBenefits = useMemo(() => {
    if (mode === "partner") {
      const normalizedPartnerId = partnerId?.trim().toLowerCase() ?? "";
      return benefits.filter((benefit) => benefit.partnerId.toLowerCase() === normalizedPartnerId);
    }
    return benefits.filter((benefit) => benefit.available || benefit.personalStatus === "reserved");
  }, [benefits, mode, partnerId]);

  const mutateBenefit = async (benefit: AthletePartnerBenefit, action: "reserve" | "cancel") => {
    const confirmed = window.confirm(
      action === "reserve"
        ? `Réserver l’avantage « ${benefit.title} » ?`
        : `Annuler votre réservation pour « ${benefit.title} » ?`,
    );
    if (!confirmed) return;

    setPendingBenefitId(benefit.id);
    setError(null);
    setSuccess(null);
    try {
      const response = action === "reserve"
        ? await fetch("/api/athlete/partner-benefits", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ benefitId: benefit.id }),
          })
        : await fetch(`/api/athlete/partner-benefit-reservations/${benefit.activeReservationId}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel" }),
          });
      if (!response.ok) {
        throw new Error(await responseError(
          response,
          action === "reserve" ? "La réservation a échoué." : "L’annulation a échoué.",
        ));
      }
      const payload = (await response.json()) as ReservationPayload;
      if (!payload.reservation) throw new Error("Réponse de réservation incomplète.");
      setBenefits((current) => current.map((item) => item.id === benefit.id
        ? action === "reserve"
          ? {
              ...item,
              availability: "already_reserved",
              personalStatus: "reserved",
              available: false,
              activeReservationId: payload.reservation!.id,
            }
          : {
              ...item,
              availability: "available",
              personalStatus: "cancelled",
              available: true,
              activeReservationId: null,
            }
        : item));
      setSuccess(action === "reserve" ? "Avantage réservé avec succès." : "Réservation annulée avec succès.");
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "L’action n’a pas pu être effectuée.");
    } finally {
      setPendingBenefitId(null);
    }
  };

  if (mode === "summary") {
    const availableCount = benefits.filter((benefit) => benefit.available).length;
    const reservedCount = benefits.filter((benefit) => benefit.personalStatus === "reserved").length;
    return (
      <section aria-labelledby="partner-benefits-summary-title" style={{ borderTop: "1px solid #dedbd5", paddingTop: "1.25rem", display: "grid", gap: "0.8rem" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Gift size={19} color="#17735f" aria-hidden />
            <h2 id="partner-benefits-summary-title" style={{ margin: 0, fontSize: "1.2rem", color: "#1c1917" }}>Mes avantages</h2>
          </div>
          <Link href="/athlete/ecosysteme" className="crm-secondary-action-link">Voir l’Écosystème</Link>
        </header>
        {loading ? <p role="status" style={{ margin: 0, color: "#57534e" }}>Chargement de vos avantages…</p> : null}
        {error ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
            <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{error}</p>
            <Button
              type="button"
              style={{ background: "transparent", border: "1px solid currentColor", color: "inherit" }}
              onClick={() => setRetryToken((value) => value + 1)}
            >
              <RotateCcw size={15} aria-hidden /> Réessayer
            </Button>
          </div>
        ) : null}
        {!loading && !error ? (
          <>
            <div aria-label="Synthèse des avantages partenaires" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", border: "1px solid #e7e5e4", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
              <div style={{ padding: "0.85rem 1rem", borderRight: "1px solid #e7e5e4" }}><strong style={{ display: "block", fontSize: "1.35rem", color: "#166534" }}>{availableCount}</strong><span style={{ color: "#57534e" }}>Disponibles</span></div>
              <div style={{ padding: "0.85rem 1rem" }}><strong style={{ display: "block", fontSize: "1.35rem", color: "#92400e" }}>{reservedCount}</strong><span style={{ color: "#57534e" }}>Réservés</span></div>
            </div>
            {visibleBenefits.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "#44403c", display: "grid", gap: "0.35rem" }}>
                {visibleBenefits.map((benefit) => (
                  <li key={benefit.id}>{benefit.title} · {benefit.available ? "Disponible" : "Réservé"}</li>
                ))}
              </ul>
            ) : <p style={{ margin: 0, color: "#78716c" }}>Aucun avantage disponible ou réservé.</p>}
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="partner-benefits-title" style={{ display: "grid", gap: "0.8rem", borderTop: "1px solid #e5e7eb", paddingTop: "1rem" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Gift size={19} color="#17735f" aria-hidden />
        <h2 id="partner-benefits-title" style={{ margin: 0, fontSize: "1.05rem" }}>Avantages KLIQUE</h2>
      </header>
      {loading ? <p role="status" style={{ margin: 0, color: "#6b7280" }}>Chargement des avantages…</p> : null}
      {error ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
          <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>{error}</p>
          <Button
            type="button"
            style={{ background: "transparent", border: "1px solid currentColor", color: "inherit" }}
            onClick={() => setRetryToken((value) => value + 1)}
          >
            <RotateCcw size={15} aria-hidden /> Réessayer
          </Button>
        </div>
      ) : null}
      {success ? <p role="status" style={{ margin: 0, color: "#166534" }}>{success}</p> : null}
      {!loading && !error && visibleBenefits.length === 0 ? <p style={{ margin: 0, color: "#6b7280" }}>Aucun avantage partenaire actif.</p> : null}
      {!loading && visibleBenefits.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
          {visibleBenefits.map((benefit) => {
            const pending = pendingBenefitId === benefit.id;
            const canCancel = benefit.personalStatus === "reserved" && Boolean(benefit.activeReservationId);
            return (
              <li key={benefit.id} style={{ padding: "0.9rem 0", borderTop: "1px solid #e5e7eb", display: "grid", gap: "0.6rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: "0.25rem" }}>
                    <strong style={{ color: "#111827" }}>{benefit.title}</strong>
                    <span style={{ color: "#4b5563", lineHeight: 1.55 }}>{benefit.details}</span>
                  </div>
                  <span style={{ ...statusColors[benefit.personalStatus], padding: "0.3rem 0.55rem", borderRadius: "999px", fontWeight: 750, fontSize: "0.78rem" }}>
                    {statusLabels[benefit.personalStatus]}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", color: "#57534e", fontSize: "0.86rem" }}>
                  <span><Gift size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> {policyLabels[benefit.usagePolicy]}</span>
                  <span><CalendarClock size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> {formatDate(benefit.expiresAt)}</span>
                </div>
                {benefit.available ? (
                  <Button type="button" disabled={pending} onClick={() => void mutateBenefit(benefit, "reserve")} style={{ width: "fit-content" }}>
                    <Gift size={15} aria-hidden /> {pending ? "Réservation…" : "Réserver cet avantage"}
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => void mutateBenefit(benefit, "cancel")}
                    style={{ width: "fit-content", background: "transparent", border: "1px solid currentColor", color: "inherit" }}
                  >
                    <XCircle size={15} aria-hidden /> {pending ? "Annulation…" : "Annuler ma réservation"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}