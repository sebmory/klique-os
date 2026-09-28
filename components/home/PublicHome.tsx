"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgePercent, Camera, Check, Network, UsersRound } from "lucide-react";
import type { PublicPassPlan } from "@/components/pass/PublicPassCatalog";
import type { PublicKliqueStats } from "@/lib/public-klique-stats";
import styles from "./public-home.module.css";

const formatPrice = (value: number): string => `CHF ${value.toFixed(2)}`;

export default function PublicHome() {
  const { isLoaded, isSignedIn } = useUser();
  const [plans, setPlans] = useState<PublicPassPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [stats, setStats] = useState<PublicKliqueStats | null>(null);
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
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/public/klique-stats")
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as PublicKliqueStats | null;
        const values = payload ? [payload.athleteCount, payload.partnerExpertCount, payload.sportCount] : [];
        if (!response.ok || values.length !== 3 || values.some((value) => !Number.isInteger(value) || value < 0)) {
          throw new Error("Statistiques indisponibles");
        }
        if (active) setStats(payload);
      })
      .catch(() => {
        if (active) setStats(null);
      });

    return () => { active = false; };
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="KLIQUE, accueil">KLIQUE</Link>
        <nav className={styles.nav} aria-label="Navigation principale">
          <Link href="#decouvrir">Découvrir KLIQUE</Link>
          <Link href="/pass">Les offres</Link>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.signInLink} href={accountHref}>{accountLabel}</Link>
          <Link className={styles.primaryButton} href="/pass">Découvrir les Pass</Link>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="home-title">
          <Image
            className={styles.heroImage}
            src="/moodboard/football/01-portrait-debout.jpg"
            alt="Athlète de football debout sur un terrain"
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
              <Link className={styles.primaryButton} href="/pass">Découvrir les Pass <ArrowRight size={18} aria-hidden="true" /></Link>
              <Link className={styles.heroSecondaryButton} href={accountHref}>
                {isLoaded && isSignedIn ? "Accéder à mon espace" : "J’ai déjà un compte"}
              </Link>
            </div>
          </div>
          <p className={styles.heroSignature}>KLIQUE · UN RÉSEAU AUTOUR DE L’ATHLÈTE</p>
        </section>

        {stats ? (
          <section className={styles.statsBand} aria-label="KLIQUE en chiffres">
            <div className={styles.statsInner}>
              <div><strong>{stats.athleteCount}</strong><span>Athlètes accompagnés</span></div>
              <div><strong>{stats.partnerExpertCount}</strong><span>Partenaires &amp; experts</span></div>
              <div><strong>{stats.sportCount}</strong><span>Disciplines représentées</span></div>
            </div>
          </section>
        ) : null}

        <section className={styles.valueSection} id="decouvrir" aria-labelledby="value-title">
          <div className={styles.sectionIntro}>
            <p className={styles.sectionLabel}>L’accompagnement KLIQUE</p>
            <div>
              <h2 id="value-title">Bien plus qu’un abonnement. Un réseau pour avancer.</h2>
              <p className={styles.valueIntroduction}>Chaque Athlète a son parcours, ses besoins et ses objectifs. KLIQUE rassemble des compétences, des services et des opportunités pour l’accompagner au bon moment.</p>
            </div>
          </div>
          <div className={styles.pillars}>
            <article>
              <Camera size={24} aria-hidden="true" />
              <p className={styles.pillarNumber}>01</p>
              <h3>Développer son image</h3>
              <p>Des contenus, interviews, photos et vidéos pour raconter son parcours et gagner en visibilité.</p>
            </article>
            <article>
              <UsersRound size={24} aria-hidden="true" />
              <p className={styles.pillarNumber}>02</p>
              <h3>S’entourer d’experts</h3>
              <p>Des professionnels du sport et de l’accompagnement qui mettent leur expertise au service des membres.</p>
            </article>
            <article>
              <BadgePercent size={24} aria-hidden="true" />
              <p className={styles.pillarNumber}>03</p>
              <h3>Profiter d’avantages</h3>
              <p>Des offres et conditions proposées par les Partenaires et Experts du réseau KLIQUE.</p>
            </article>
            <article>
              <Network size={24} aria-hidden="true" />
              <p className={styles.pillarNumber}>04</p>
              <h3>Accéder à des opportunités</h3>
              <p>Des connexions avec des médias, des marques, des créatifs et les autres acteurs de l’écosystème.</p>
            </article>
          </div>
        </section>

        <section className={styles.processSection} aria-labelledby="process-title">
          <div className={styles.processHeading}>
            <p className={styles.sectionLabel}>Comment ça fonctionne</p>
            <h2 id="process-title">Un parcours simple, un suivi humain.</h2>
          </div>
          <ol className={styles.processSteps}>
            <li><span>01</span><div><h3>Choisissez votre Pass</h3><p>Comparez les niveaux d’accompagnement et choisissez celui qui vous correspond.</p></div></li>
            <li><span>02</span><div><h3>Rejoignez le réseau KLIQUE</h3><p>Créez votre compte et transmettez les informations nécessaires à votre adhésion.</p></div></li>
            <li><span>03</span><div><h3>Activez votre réseau</h3><p>Utilisez les contenus, expertises, avantages et opportunités disponibles pour faire avancer votre parcours.</p></div></li>
          </ol>
          <p className={styles.validationNote}>Le paiement est vérifié manuellement par KLIQUE. L’accès à l’espace membre est activé après validation du dossier.</p>
        </section>

        <section className={styles.ecosystemSection} aria-labelledby="ecosystem-title">
          <div className={styles.ecosystemCopy}>
            <p className={styles.sectionLabel}>Un écosystème actif</p>
            <h2 id="ecosystem-title">Un écosystème complémentaire, construit autour de l’Athlète.</h2>
            <p>Au centre du réseau, chaque Athlète peut s’appuyer sur la complémentarité des Partenaires et experts, des Médias et des Créatifs KLIQUE.</p>
          </div>
          <ul className={styles.ecosystemList}>
            <li><span>01</span>Athlètes</li>
            <li><span>02</span>Partenaires et experts</li>
            <li><span>03</span>Médias</li>
            <li><span>04</span>Créatifs KLIQUE</li>
          </ul>
        </section>

        <section className={styles.offersSection} aria-labelledby="offers-title">
          <div className={styles.offersHeading}>
            <div>
              <p className={styles.sectionLabel}>Les Pass KLIQUE</p>
              <h2 id="offers-title">Trois niveaux pour avancer à votre rythme.</h2>
            </div>
            <p>Chaque Pass combine accompagnement, productions et contenus selon un niveau d’engagement différent.</p>
          </div>

          {plansLoading ? <p className={styles.catalogStatus} role="status">Chargement des offres…</p> : null}
          {!plansLoading && !plansError && plans.length > 0 ? (
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
          {!plansLoading && (plansError || plans.length === 0) ? (
            <p className={styles.catalogStatus}>L’aperçu est momentanément indisponible. Retrouvez les offres sur la page des Pass.</p>
          ) : null}
          <Link className={styles.outlineButton} href="/pass">Comparer les Pass <ArrowRight size={18} aria-hidden="true" /></Link>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-cta-title">
          <p className={styles.sectionLabel}>Votre prochaine étape</p>
          <h2 id="final-cta-title">Prêt à rejoindre un réseau construit autour de vos ambitions ?</h2>
          <div className={styles.heroActions}>
            <Link className={styles.lightButton} href="/pass">Découvrir les Pass <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link className={styles.darkSecondaryButton} href={accountHref}>{accountLabel}</Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div><strong>KLIQUE</strong><p>connecter. accompagner. performer</p></div>
        <nav aria-label="Navigation de pied de page">
          <Link href="/pass">Les offres</Link>
          <Link href={accountHref}>{accountLabel}</Link>
        </nav>
      </footer>
    </div>
  );
}