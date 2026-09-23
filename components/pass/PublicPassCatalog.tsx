"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Clapperboard, FileText, UserRoundPlus } from "lucide-react";
import { buildJoinPassUrl, type PublicPassPlanCode } from "@/lib/pass-navigation";
import styles from "./pass-flow.module.css";

export type PublicPassPlan = {
  code: PublicPassPlanCode;
  name: string;
  annualPriceChf: number;
  durationMonths: number;
  productionCredits: number;
  customContentCredits: number;
  videoAllowed: boolean;
};

const formatPrice = (value: number): string => `CHF ${value.toFixed(2)}`;

export default function PublicPassCatalog() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const [plans, setPlans] = useState<PublicPassPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/public/membership-plans", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { plans?: PublicPassPlan[]; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "Le catalogue est momentanément indisponible.");
        if (!Array.isArray(payload?.plans)) throw new Error("Le catalogue est momentanément indisponible.");
        if (active) setPlans(payload.plans);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Le catalogue est momentanément indisponible.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const choosePlan = (planCode: PublicPassPlanCode) => {
    if (!isLoaded) return;
    const returnUrl = buildJoinPassUrl(planCode);
    router.push(isSignedIn
      ? returnUrl
      : `/sign-up?redirect=${encodeURIComponent(returnUrl)}`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/pass" className={styles.brand}>KLIQUE PASS</a>
        <a href="/sign-in" className={styles.textLink}>Se connecter</a>
      </header>
      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="pass-title">
          <div>
            <p className={styles.eyebrow}>Pass annuel KLIQUE</p>
            <h1 id="pass-title" className={styles.title}>Choisissez le rythme qui porte votre image.</h1>
            <p className={styles.lede}>Trois offres annuelles pour organiser vos productions, vos contenus et votre visibilité avec KLIQUE.</p>
          </div>
          <ol className={styles.steps} aria-label="Étapes d’adhésion">
            <li>Choisir un Pass.</li>
            <li>Créer son compte sécurisé.</li>
            <li>Payer avec TWINT.</li>
            <li>Recevoir le formulaire d’adhésion envoyé personnellement par KLIQUE.</li>
            <li>Accéder à son espace après validation.</li>
          </ol>
        </section>

        {loading ? <p role="status" aria-live="polite" className={styles.status}>Chargement des offres…</p> : null}
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        {!loading && !error && plans.length === 0 ? (
          <p role="status" className={styles.notice}>Le catalogue des Pass est momentanément indisponible.</p>
        ) : null}

        {!loading && !error && plans.length > 0 ? (
          <section className={styles.plans} aria-label="Offres Pass KLIQUE">
            {plans.map((plan) => (
              <article className={styles.plan} key={plan.code}>
                <div>
                  <h2 className={styles.planName}>{plan.name}</h2>
                  <p className={styles.price}>{formatPrice(plan.annualPriceChf)} <span>par an</span></p>
                </div>
                <p style={{ margin: 0, color: "#65716b" }}>{plan.durationMonths} mois d’accompagnement</p>
                <ul className={styles.features}>
                  <li className={styles.feature}><CalendarDays size={18} aria-hidden="true" /> {plan.productionCredits} crédit(s) production</li>
                  <li className={styles.feature}><FileText size={18} aria-hidden="true" /> {plan.customContentCredits} crédit(s) contenu</li>
                  <li className={styles.feature}><Clapperboard size={18} aria-hidden="true" /> Vidéo : {plan.videoAllowed ? "incluse" : "non incluse"}</li>
                </ul>
                <button className={styles.button} type="button" disabled={!isLoaded} onClick={() => choosePlan(plan.code)}>
                  {isSignedIn ? <Check size={18} aria-hidden="true" /> : <UserRoundPlus size={18} aria-hidden="true" />}
                  Choisir
                </button>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}