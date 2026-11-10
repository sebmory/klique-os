"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { PublicPassPlan } from "@/components/pass/PublicPassCatalog";
import AthletePortrait from "@/components/public-athletes/AthletePortrait";
import type { PublicAthleteCard } from "@/lib/public-athletes";
import type { PublicKliqueStats } from "@/lib/public-klique-stats";
import styles from "./public-home.module.css";

type PublicHomeProps = {
  featuredAthletes?: readonly PublicAthleteCard[];
};

const formatPrice = (value: number): string => `CHF ${value.toFixed(2)}`;

export default function PublicHome({ featuredAthletes = [] }: PublicHomeProps) {
  const { isLoaded, isSignedIn } = useUser();
  const [plans, setPlans] = useState<PublicPassPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [plansRetry, setPlansRetry] = useState(0);
  const [stats, setStats] = useState<PublicKliqueStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [statsRetry, setStatsRetry] = useState(0);
  const accountHref = isLoaded && isSignedIn ? "/today" : "/sign-in";
  const accountLabel = isLoaded && isSignedIn ? "Accéder à mon espace" : "Se connecter";

  useEffect(() => {
    let active = true;
    void fetch("/api/public/membership-plans", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { plans?: PublicPassPlan[] } | null;
        if (!response.ok || !Array.isArray(payload?.plans)) throw new Error("Catalogue indisponible");
        if (active) setPlans(payload.plans.slice(0, 3));
      })
      .catch(() => {
        if (active) setPlansError(true);
      })
      .finally(() => {
        if (active) setPlansLoading(false);
      });

    return () => { active = false; };
  }, [plansRetry]);

  useEffect(() => {
    let active = true;
    void fetch("/api/public/klique-stats")
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as PublicKliqueStats | null;
        const values = payload
          ? [payload.athleteCount, payload.partnerExpertCount, payload.sportCount, payload.creativeCount]
          : [];
        if (!response.ok || values.length !== 4 || values.some((value) => !Number.isInteger(value) || value < 0)) {
          throw new Error("Statistiques indisponibles");
        }
        if (active) setStats(payload);
      })
      .catch(() => {
        if (active) setStatsError(true);
      })
      .finally(() => {
        if (active) setStatsLoading(false);
      });

    return () => { active = false; };
  }, [statsRetry]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="KLIQUE, accueil">KLIQUE</Link>
        <nav className={styles.nav} aria-label="Navigation principale">
          <Link href="/athletes">Les athlètes</Link>
          <Link href="/pass">Les Pass</Link>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.signInLink} href={accountHref}>{accountLabel}</Link>
          <Link className={styles.primaryButton} href="/pass">Rejoindre KLIQUE</Link>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="home-title">
          <Image
            className={styles.heroImage}
            src="/moodboard/football/01-portrait-debout.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
          />
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>LE RÉSEAU AU SERVICE DES ATHLÈTES</p>
            <h1 id="home-title">Votre ambition mérite tout un réseau.</h1>
            <p>KLIQUE réunit autour des Athlètes les ressources, les expertises et les opportunités qui peuvent faire avancer leur parcours — de leur image à leurs objectifs sportifs et professionnels.</p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href="/athletes">Découvrir le réseau <ArrowRight size={18} aria-hidden="true" /></Link>
              <Link className={styles.heroSecondaryButton} href="/pass">Rejoindre KLIQUE</Link>
            </div>
          </div>
          <p className={styles.heroSignature}>KLIQUE · UN RÉSEAU AUTOUR DE L’ATHLÈTE</p>
        </section>

        <section className={styles.valueSection} aria-labelledby="entry-title">
          <div className={styles.sectionIntro}>
            <p className={styles.sectionLabel}>Trois portes d’entrée</p>
            <div>
              <h2 id="entry-title">Chacun contribue au réseau.</h2>
              <p className={styles.valueIntroduction}>Sport, expertise et création se rencontrent pour donner aux parcours plus de portée et plus d’opportunités.</p>
            </div>
          </div>
          <div className={styles.entryDoors}>
            <article><span>01</span><h3>Athlètes</h3><p>Construire son image, raconter son parcours et activer les bonnes connexions.</p><Link href="/athletes">Découvrir les profils</Link></article>
            <article><span>02</span><h3>Experts · Partenaires</h3><p>Mettre une expertise, un service ou une opportunité au service des athlètes.</p><Link href="/sign-in">Accéder à l’espace partenaire</Link></article>
            <article><span>03</span><h3>Créatifs · Médias</h3><p>Faire émerger les histoires sportives avec des formats justes et ambitieux.</p><Link href="/sign-in">Accéder à son espace</Link></article>
          </div>
        </section>

        {stats ? (
          <section className={styles.statsBand} aria-label="KLIQUE en chiffres">
            <div className={styles.statsInner}>
              <div><strong>{stats.athleteCount}</strong><span>Athlètes actifs accompagnés</span></div>
              <div><strong>{stats.partnerExpertCount}</strong><span>Partenaires &amp; experts actifs</span></div>
              <div><strong>{stats.sportCount}</strong><span>Disciplines représentées</span></div>
              <div><strong>{stats.creativeCount}</strong><span>Créatifs actifs</span></div>
            </div>
          </section>
        ) : statsLoading ? (
          <section className={styles.compactStatus} role="status">Chargement des chiffres du réseau…</section>
        ) : statsError ? (
          <section className={styles.compactStatus} role="alert">
            <span>Les chiffres du réseau sont momentanément indisponibles.</span>
            <button
              type="button"
              onClick={() => {
                setStatsLoading(true);
                setStatsError(false);
                setStatsRetry((value) => value + 1);
              }}
            >
              Réessayer
            </button>
          </section>
        ) : null}

        {featuredAthletes.length ? (
          <section className={styles.featuredSection} aria-labelledby="featured-title">
            <div className={styles.featuredHeading}>
              <div><p className={styles.sectionLabel}>Au cœur du réseau</p><h2 id="featured-title">Des parcours à découvrir.</h2></div>
              <Link className={styles.outlineButton} href="/athletes">Voir tous les athlètes <ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
            <ul className={styles.featuredGrid}>
              {featuredAthletes.map((athlete) => (
                <li key={athlete.slug}>
                  <Link href={`/athletes/${athlete.slug}`}>
                    <AthletePortrait
                      name={athlete.name}
                      sport={athlete.sport}
                      portrait={athlete.portrait}
                      colorCategory={athlete.colorCategory}
                      decorative
                    />
                    <div><p>{athlete.sport}</p><h3>{athlete.name}</h3>{athlete.club ? <span>{athlete.club}</span> : null}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={styles.ecosystemSection} aria-labelledby="ecosystem-title">
          <div className={styles.ecosystemCopy}>
            <p className={styles.sectionLabel}>Experts &amp; partenaires</p>
            <h2 id="ecosystem-title">Des compétences qui répondent aux réalités du parcours.</h2>
            <p>Préparation physique et mentale, santé, performance, droit, finance, image et activation de marque : KLIQUE réunit des expertises complémentaires autour de chaque ambition.</p>
          </div>
          <ul className={styles.ecosystemList}>
            <li><span>01</span>Performance &amp; préparation</li>
            <li><span>02</span>Santé &amp; récupération</li>
            <li><span>03</span>Carrière &amp; accompagnement</li>
            <li><span>04</span>Image &amp; opportunités</li>
          </ul>
        </section>

        <section className={styles.offersSection} aria-labelledby="offers-title">
          <div className={styles.offersHeading}>
            <div><p className={styles.sectionLabel}>Les Pass KLIQUE</p><h2 id="offers-title">Choisir son niveau d’accompagnement.</h2></div>
            <p>Chaque Pass ouvre un niveau d’accompagnement pensé pour activer les ressources, les productions et les connexions utiles au bon moment.</p>
          </div>
          {plansLoading ? <p className={styles.catalogStatus} role="status">Chargement des offres…</p> : null}
          {!plansLoading && !plansError && plans.length ? (
            <div className={styles.offerList}>
              {plans.map((plan) => (
                <article key={plan.code}>
                  <div><p>Pass</p><h3>{plan.name}</h3></div>
                  <p className={styles.offerPrice}>{formatPrice(plan.annualPriceChf)} <span>par an</span></p>
                  <ul aria-label={`Aperçu du Pass ${plan.name}`}>
                    <li><Check size={16} aria-hidden="true" /> {plan.productionCredits} crédit(s) production photo/vidéo</li>
                    <li><Check size={16} aria-hidden="true" /> {plan.customContentCredits} crédit(s) contenu personnalisé</li>
                  </ul>
                </article>
              ))}
            </div>
          ) : null}
          {!plansLoading && plansError ? (
            <div className={styles.catalogStatus} role="alert">
              <span>Les offres sont momentanément indisponibles.</span>
              <button
                type="button"
                onClick={() => {
                  setPlansLoading(true);
                  setPlansError(false);
                  setPlansRetry((value) => value + 1);
                }}
              >
                Réessayer
              </button>
            </div>
          ) : null}
          {!plansLoading && !plansError && !plans.length ? (
            <div className={styles.catalogStatus} role="status">
              <span>Aucune offre publique n’est disponible pour le moment.</span>
              <button
                type="button"
                onClick={() => {
                  setPlansLoading(true);
                  setPlansRetry((value) => value + 1);
                }}
              >
                Réessayer
              </button>
            </div>
          ) : null}
          <Link className={styles.outlineButton} href="/pass">Comparer les Pass <ArrowRight size={18} aria-hidden="true" /></Link>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-cta-title">
          <p className={styles.sectionLabel}>Rejoindre le mouvement</p>
          <h2 id="final-cta-title">Quelle place voulez-vous prendre dans le réseau ?</h2>
          <div className={styles.finalAudienceLinks}>
            <Link className={styles.lightButton} href="/pass">Je suis athlète</Link>
            <Link className={styles.darkSecondaryButton} href="/sign-in">Je suis expert ou partenaire</Link>
            <Link className={styles.darkSecondaryButton} href="/sign-in">Je suis créatif ou média</Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div><strong>KLIQUE</strong><p>connecter. accompagner. performer</p></div>
        <nav aria-label="Navigation de pied de page"><Link href="/athletes">Les athlètes</Link><Link href="/pass">Les Pass</Link><Link href={accountHref}>{accountLabel}</Link></nav>
      </footer>
    </div>
  );
}
