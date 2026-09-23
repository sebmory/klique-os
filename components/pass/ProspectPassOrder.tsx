"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { ATHLETE_SUBSCRIPTION_TERMS } from "@/lib/athlete-subscription-terms";
import type { PublicPassPlanCode } from "@/lib/pass-navigation";
import type { PublicPassPlan } from "./PublicPassCatalog";
import styles from "./pass-flow.module.css";

type ProspectOrder = PublicPassPlan & {
  id: string;
  publicReference: string;
  verifiedEmail: string;
  fullName: string;
  phone: string | null;
  planCode: PublicPassPlanCode;
  planName: string;
  paymentMethod: "twint_business";
  status: "pending_payment" | "paid_awaiting_form";
  termsVersion: string;
  termsAcceptedAt: string;
  expiresAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  twintPaymentUrl?: string;
  statusMessage?: string;
};

export const PROSPECT_TWINT_INSTRUCTIONS =
  "Dans TWINT, saisissez exactement le montant indiqué, votre nom et la référence KLIQUE dans le champ message.";
export const PROSPECT_FOLLOW_UP_MESSAGE =
  "Après vérification du paiement, KLIQUE vous enverra personnellement le formulaire d’adhésion. Votre Pass débutera après validation de ce formulaire.";

const formatAmount = (value: number): string => `CHF ${value.toFixed(2)}`;
const formatExpiry = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });
};

const responseError = async (response: Response, fallback: string): Promise<string> => {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || fallback;
};

export default function ProspectPassOrder({ initialPlan }: { initialPlan: PublicPassPlanCode | null }) {
  const [plans, setPlans] = useState<PublicPassPlan[]>([]);
  const [order, setOrder] = useState<ProspectOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const cancellingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/public/membership-plans", { cache: "no-store" }),
      fetch("/api/join/pass/order", { credentials: "include", cache: "no-store" }),
    ]).then(async ([plansResponse, orderResponse]) => {
      if (!plansResponse.ok) throw new Error(await responseError(plansResponse, "Impossible de charger les offres."));
      if (!orderResponse.ok) throw new Error(await responseError(orderResponse, "Impossible de charger votre commande."));
      const plansPayload = await plansResponse.json() as { plans?: PublicPassPlan[] };
      const orderPayload = await orderResponse.json() as { order?: ProspectOrder | null };
      if (!Array.isArray(plansPayload.plans) || !("order" in orderPayload)) throw new Error("Réponse incomplète.");
      if (active) {
        setPlans(plansPayload.plans);
        setOrder(orderPayload.order ?? null);
      }
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Impossible de charger le parcours Pass.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const selectedPlan = order
    ? plans.find((plan) => plan.code === order.planCode) ?? null
    : plans.find((plan) => plan.code === initialPlan) ?? null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlan || submittingRef.current) return;
    if (!termsAccepted) {
      setError("Vous devez accepter les conditions commerciales pour continuer.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const trimmedPhone = phone.trim();
      const response = await fetch("/api/join/pass/order", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: selectedPlan.code,
          fullName: fullName.trim(),
          ...(trimmedPhone ? { phone: trimmedPhone } : {}),
          termsAccepted: true,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Impossible de créer votre commande."));
      const payload = await response.json() as { order?: ProspectOrder };
      if (!payload.order) throw new Error("Réponse de commande incomplète.");
      setOrder(payload.order);
      setNotice("Votre commande est prête. Utilisez exactement les informations de paiement affichées.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de créer votre commande.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copié.`);
      setError(null);
    } catch {
      setError(`Impossible de copier ${label.toLowerCase()}.`);
    }
  };

  const openTwint = () => {
    if (!order?.twintPaymentUrl) {
      setError("Le paiement TWINT est temporairement indisponible.");
      return;
    }
    window.open(order.twintPaymentUrl, "_blank", "noopener,noreferrer");
  };

  const cancel = async () => {
    if (!order || cancellingRef.current) return;
    if (!window.confirm(`Annuler votre commande pour l’offre ${order.planName} ?`)) return;
    cancellingRef.current = true;
    setCancelling(true);
    setError(null);
    try {
      const response = await fetch("/api/join/pass/order", {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await responseError(response, "Impossible d’annuler votre commande."));
      setOrder(null);
      setNotice("Votre commande a été annulée.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible d’annuler votre commande.");
    } finally {
      cancellingRef.current = false;
      setCancelling(false);
    }
  };

  if (loading) return <p role="status" aria-live="polite" className={styles.status}>Chargement de votre parcours Pass…</p>;

  return (
    <>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {notice ? <p role="status" aria-live="polite" className={styles.status}>{notice}</p> : null}

      {order?.status === "paid_awaiting_form" ? (
        <section className={styles.panel} aria-labelledby="payment-verified-title">
          <CheckCircle2 size={30} aria-hidden="true" color="#27745d" />
          <h2 id="payment-verified-title" className={styles.planName} style={{ marginTop: "0.7rem" }}>Paiement vérifié</h2>
          <p className={styles.lede} style={{ fontSize: "1rem" }}>KLIQUE vous enverra personnellement le formulaire d’adhésion.</p>
          <p className={styles.notice}>Votre Pass n’est pas encore actif. Il débutera après réception et validation de ce formulaire.</p>
        </section>
      ) : order?.status === "pending_payment" ? (
        <section className={styles.panel} aria-labelledby="pending-payment-title">
          <p className={styles.eyebrow}>Paiement en attente</p>
          <h2 id="pending-payment-title" className={styles.planName}>{order.planName}</h2>
          <dl className={styles.details}>
            <div><dt>Montant exact</dt><dd>{formatAmount(order.annualPriceChf)}</dd></div>
            <div><dt>Référence KLIQUE</dt><dd>{order.publicReference}</dd></div>
            <div><dt>Expiration</dt><dd>{formatExpiry(order.expiresAt)}</dd></div>
          </dl>
          <p className={styles.notice}>{PROSPECT_TWINT_INSTRUCTIONS}</p>
          <p style={{ color: "#46534d", lineHeight: 1.6 }}>{PROSPECT_FOLLOW_UP_MESSAGE}</p>
          <div className={styles.actions}>
            <button className={styles.secondaryButton} type="button" onClick={() => void copy(order.annualPriceChf.toFixed(2), "Montant")}><Copy size={17} aria-hidden="true" /> Copier le montant</button>
            <button className={styles.secondaryButton} type="button" onClick={() => void copy(order.publicReference, "Référence")}><Copy size={17} aria-hidden="true" /> Copier la référence</button>
            <button className={styles.button} type="button" onClick={openTwint}><ExternalLink size={17} aria-hidden="true" /> Payer avec TWINT</button>
            <button className={styles.dangerButton} type="button" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? "Annulation…" : "Annuler la commande"}</button>
          </div>
        </section>
      ) : selectedPlan ? (
        <div className={styles.joinGrid}>
          <aside className={styles.panel}>
            <p className={styles.eyebrow}>Votre choix</p>
            <h2 className={styles.planName}>{selectedPlan.name}</h2>
            <p className={styles.price}>{formatAmount(selectedPlan.annualPriceChf)} <span>par an</span></p>
            <ul className={styles.features} style={{ marginTop: "1rem" }}>
              <li>{selectedPlan.durationMonths} mois</li>
              <li>{selectedPlan.productionCredits} crédit(s) production</li>
              <li>{selectedPlan.customContentCredits} crédit(s) contenu</li>
              <li>Vidéo : {selectedPlan.videoAllowed ? "incluse" : "non incluse"}</li>
            </ul>
            <p style={{ marginBottom: 0 }}><a className={styles.textLink} href="/pass">Choisir une autre offre</a></p>
          </aside>
          <section className={styles.panel} aria-labelledby="prospect-form-title">
            <ShieldCheck size={28} aria-hidden="true" color="#27745d" />
            <h2 id="prospect-form-title" className={styles.planName} style={{ marginTop: "0.7rem" }}>Préparer ma commande</h2>
            <p style={{ color: "#536059", lineHeight: 1.6 }}>Votre Pass commence seulement après réception et validation du formulaire d’adhésion envoyé personnellement par KLIQUE.</p>
            <form className={styles.form} onSubmit={(event) => void submit(event)}>
              <label className={styles.field}>Nom complet
                <input className={styles.input} name="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required autoComplete="name" />
              </label>
              <label className={styles.field}>Téléphone (facultatif)
                <input className={styles.input} name="phone" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
              </label>
              <details>
                <summary className={styles.textLink}>Lire les conditions commerciales</summary>
                <ul className={styles.terms}>{ATHLETE_SUBSCRIPTION_TERMS.map((term) => <li key={term}>{term}</li>)}</ul>
              </details>
              <label className={styles.consent}>
                <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                <span>J’ai lu et j’accepte les conditions commerciales du Pass KLIQUE.</span>
              </label>
              <button className={styles.button} type="submit" disabled={submitting || !fullName.trim()}>{submitting ? "Création…" : "Continuer vers le paiement"}</button>
            </form>
          </section>
        </div>
      ) : (
        <section className={styles.panel}>
          <h2 className={styles.planName}>Choisissez d’abord votre Pass</h2>
          <p className={styles.lede} style={{ fontSize: "1rem" }}>Le lien utilisé ne contient pas d’offre valide ou l’offre n’est plus disponible.</p>
          <a className={styles.textLink} href="/pass">Voir les offres disponibles</a>
        </section>
      )}
    </>
  );
}