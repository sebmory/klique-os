"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Video } from "lucide-react";
import { Button } from "@/src/design-system/components";

export type AthletePassCatalogPlan = {
  code: "essential" | "impact" | "signature";
  name: string;
  annualPriceChf: number;
  productionCredits: number;
  customContentCredits: number;
  videoAllowed: boolean;
};

type MembershipOrder = {
  id: string;
  publicReference: string;
  planCode: AthletePassCatalogPlan["code"];
  planName: string;
  annualPriceChf: number;
  productionCredits: number;
  customContentCredits: number;
  videoAllowed: boolean;
  status: "pending" | "paid" | "cancelled" | "expired";
  expiresAt: string;
  twintPaymentUrl?: string;
};

type Props = {
  plans: AthletePassCatalogPlan[];
};

export const TWINT_PAYMENT_INSTRUCTIONS = "Dans TWINT, saisissez exactement le montant indiqué, votre nom et la référence KLIQUE dans le champ message. Votre Pass sera activé après vérification du paiement par KLIQUE.";

const formatAmount = (value: number): string => `CHF ${value.toFixed(2)}`;
const copyAmount = (value: number): string => value.toFixed(2);

const formatExpiry = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("fr-CH", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Zurich",
      });
};

const errorMessageFrom = async (response: Response, fallback: string): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
};

export default function AthleteMembershipOrderPurchase({ plans }: Props) {
  const [order, setOrder] = useState<MembershipOrder | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [creatingPlan, setCreatingPlan] = useState<AthletePassCatalogPlan["code"] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const creating = useRef(false);
  const cancellingRequest = useRef(false);

  const loadOrder = async (showLoading: boolean) => {
    if (showLoading) setLoadingOrder(true);
    try {
      const response = await fetch("/api/athlete/membership-order", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await errorMessageFrom(response, "Impossible de charger votre demande d’adhésion."));
      }
      const payload = (await response.json()) as { order?: MembershipOrder | null };
      if (!("order" in payload)) throw new Error("Réponse de commande incomplète.");
      setOrder(payload.order?.status === "pending" ? payload.order : null);
    } finally {
      if (showLoading) setLoadingOrder(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoadingOrder(true);
    void fetch("/api/athlete/membership-order", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await errorMessageFrom(response, "Impossible de charger votre demande d’adhésion."));
        }
        const payload = (await response.json()) as { order?: MembershipOrder | null };
        if (!("order" in payload)) throw new Error("Réponse de commande incomplète.");
        if (active) setOrder(payload.order?.status === "pending" ? payload.order : null);
      })
      .catch((error) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Impossible de charger votre demande d’adhésion.");
      })
      .finally(() => {
        if (active) setLoadingOrder(false);
      });
    return () => { active = false; };
  }, []);

  const choosePlan = async (plan: AthletePassCatalogPlan) => {
    if (creating.current) return;
    if (!window.confirm(`Commander l’offre ${plan.name} pour ${formatAmount(plan.annualPriceChf)} ?`)) return;

    creating.current = true;
    setCreatingPlan(plan.code);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/athlete/membership-order", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: plan.code }),
      });
      if (!response.ok) {
        throw new Error(await errorMessageFrom(response, "Votre demande d’adhésion n’a pas pu être créée."));
      }
      const payload = (await response.json()) as { order?: MembershipOrder };
      if (!payload.order || payload.order.status !== "pending") {
        throw new Error("Réponse de commande incomplète.");
      }
      setOrder(payload.order);
      setSuccessMessage(`Votre demande pour l’offre ${payload.order.planName} est prête à être payée.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Votre demande d’adhésion n’a pas pu être créée.");
    } finally {
      creating.current = false;
      setCreatingPlan(null);
    }
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSuccessMessage(`${label} copié.`);
      setErrorMessage(null);
    } catch {
      setErrorMessage(`Impossible de copier ${label.toLowerCase()}.`);
    }
  };

  const openTwint = () => {
    if (!order?.twintPaymentUrl) {
      setErrorMessage("Le paiement TWINT est temporairement indisponible.");
      return;
    }
    window.open(order.twintPaymentUrl, "_blank", "noopener,noreferrer");
  };

  const cancelOrder = async () => {
    if (!order || cancellingRequest.current) return;
    if (!window.confirm(`Annuler votre demande pour l’offre ${order.planName} ?`)) return;

    cancellingRequest.current = true;
    setCancelling(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/athlete/membership-order", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await errorMessageFrom(response, "Votre demande n’a pas pu être annulée."));
      }
      await loadOrder(false);
      setSuccessMessage("Votre demande d’adhésion a été annulée.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Votre demande n’a pas pu être annulée.");
    } finally {
      cancellingRequest.current = false;
      setCancelling(false);
    }
  };

  if (loadingOrder) {
    return <p role="status" aria-live="polite" style={{ margin: 0, color: "#57534e" }}>Chargement de votre demande d’adhésion…</p>;
  }

  return (
    <section aria-labelledby="membership-order-title" style={{ display: "grid", gap: "1rem" }}>
      <header style={{ display: "grid", gap: "0.35rem" }}>
        <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", color: "#78716c" }}>PASS MEMBRE</p>
        <h1 id="membership-order-title" style={{ margin: 0, fontSize: "1.45rem", color: "#1c1917" }}>Mon Pass KLIQUE</h1>
      </header>

      {errorMessage ? <p role="alert" style={{ margin: 0, padding: "0.8rem", border: "1px solid #fecaca", borderRadius: "8px", background: "#fef2f2", color: "#b91c1c" }}>{errorMessage}</p> : null}
      {successMessage ? <p role="status" style={{ margin: 0, padding: "0.8rem", border: "1px solid #bbf7d0", borderRadius: "8px", background: "#f0fdf4", color: "#166534" }}>{successMessage}</p> : null}

      {order ? (
        <article style={{ border: "1px solid #dedbd5", borderRadius: "8px", background: "#fff", overflow: "hidden" }}>
          <div style={{ padding: "1.1rem", background: "#173c34", color: "#fff", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.75rem" }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.78 }}>Offre choisie</p>
              <h2 style={{ margin: "0.25rem 0 0", fontSize: "1.35rem" }}>{order.planName}</h2>
            </div>
            <strong style={{ alignSelf: "center", color: "#d8f3e8" }}>Paiement en attente de vérification</strong>
          </div>

          <div style={{ padding: "1.1rem", display: "grid", gap: "1rem" }}>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.8rem", margin: 0 }}>
              <div>
                <dt style={{ color: "#78716c", fontSize: "0.78rem", fontWeight: 700 }}>MONTANT EXACT À SAISIR</dt>
                <dd style={{ margin: "0.25rem 0 0", color: "#1c1917", fontSize: "1.25rem", fontWeight: 800 }}>{formatAmount(order.annualPriceChf)}</dd>
                <Button type="button" onClick={() => void copyValue(copyAmount(order.annualPriceChf), "Montant")} disabled={cancelling} aria-label="Copier le montant" style={{ marginTop: "0.45rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <Copy size={15} aria-hidden="true" /> Copier le montant
                </Button>
              </div>
              <div>
                <dt style={{ color: "#78716c", fontSize: "0.78rem", fontWeight: 700 }}>RÉFÉRENCE À METTRE DANS LE MESSAGE</dt>
                <dd style={{ margin: "0.25rem 0 0", color: "#1c1917", fontSize: "1.1rem", fontWeight: 800 }}>{order.publicReference}</dd>
                <Button type="button" onClick={() => void copyValue(order.publicReference, "Référence")} disabled={cancelling} aria-label="Copier la référence" style={{ marginTop: "0.45rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <Copy size={15} aria-hidden="true" /> Copier la référence
                </Button>
              </div>
              <div>
                <dt style={{ color: "#78716c", fontSize: "0.78rem", fontWeight: 700 }}>EXPIRATION</dt>
                <dd style={{ margin: "0.25rem 0 0", color: "#1c1917", fontWeight: 650 }}>{formatExpiry(order.expiresAt)}</dd>
              </div>
            </dl>

            <p style={{ margin: 0, padding: "0.85rem", borderRadius: "8px", background: "#fffbeb", color: "#78350f", lineHeight: 1.55 }}>
              {TWINT_PAYMENT_INSTRUCTIONS}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
              <Button type="button" onClick={openTwint} disabled={cancelling} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#111827", color: "#fff", border: "1px solid #111827" }}>
                <ExternalLink size={16} aria-hidden="true" /> Payer avec TWINT
              </Button>
              <Button type="button" onClick={() => void cancelOrder()} disabled={cancelling} style={{ border: "1px solid #fecaca", background: "#fff", color: "#b91c1c" }}>
                {cancelling ? "Annulation…" : "Annuler ma demande"}
              </Button>
            </div>
          </div>
        </article>
      ) : (
        <div style={{ display: "grid", gap: "0.85rem" }}>
          <div>
            <h2 style={{ margin: 0, color: "#1c1917", fontSize: "1.2rem" }}>Choisir mon offre annuelle</h2>
            <p style={{ margin: "0.3rem 0 0", color: "#57534e" }}>Sélectionnez l’offre adaptée à vos besoins.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "0.8rem" }}>
            {plans.map((plan) => (
              <article key={plan.code} style={{ border: "1px solid #dedbd5", borderRadius: "8px", padding: "1rem", background: "#fff", display: "grid", gap: "0.8rem" }}>
                <div>
                  <h3 style={{ margin: 0, color: "#1c1917", fontSize: "1.1rem" }}>{plan.name}</h3>
                  <strong style={{ display: "block", marginTop: "0.3rem", color: "#173c34", fontSize: "1.2rem" }}>{formatAmount(plan.annualPriceChf)}/an</strong>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "#44403c", display: "grid", gap: "0.35rem" }}>
                  <li><Check size={14} aria-hidden="true" /> {plan.productionCredits} crédit(s) production</li>
                  <li><Check size={14} aria-hidden="true" /> {plan.customContentCredits} crédit(s) contenu</li>
                  <li><Video size={14} aria-hidden="true" /> Vidéo : {plan.videoAllowed ? "incluse" : "non incluse"}</li>
                </ul>
                <Button type="button" onClick={() => void choosePlan(plan)} disabled={creating.current || cancelling} style={{ width: "100%", background: "#173c34", color: "#fff", border: "1px solid #173c34" }}>
                  {creatingPlan === plan.code ? "Création…" : "Choisir cette offre"}
                </Button>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}