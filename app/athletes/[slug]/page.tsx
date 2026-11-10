import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AthletePortrait from "@/components/public-athletes/AthletePortrait";
import PublicAthleteHeader from "@/components/public-athletes/PublicAthleteHeader";
import styles from "@/components/public-athletes/public-athletes.module.css";
import { getCachedPublicAthleteBySlug } from "@/lib/public-athletes-server";

export const dynamic = "force-dynamic";

type AthletePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: AthletePageProps): Promise<Metadata> {
  const { slug } = await params;
  const athlete = await getCachedPublicAthleteBySlug(slug);
  if (!athlete) return { title: "Profil introuvable | KLIQUE", robots: { index: false } };
  const description = athlete.publicBio.slice(0, 155);
  return {
    title: `${athlete.name}, ${athlete.sport} | KLIQUE`,
    description,
    alternates: { canonical: `/athletes/${athlete.slug}` },
    openGraph: {
      title: `${athlete.name} | KLIQUE`,
      description,
      url: `/athletes/${athlete.slug}`,
      type: "profile",
      images: athlete.portrait ? [{ url: athlete.portrait, alt: `Portrait de ${athlete.name}` }] : undefined,
    },
  };
}

export default async function AthletePage({ params }: AthletePageProps) {
  const { slug } = await params;
  const athlete = await getCachedPublicAthleteBySlug(slug);
  if (!athlete) notFound();

  return (
    <div className={styles.page}>
      <PublicAthleteHeader />
      <main>
        <section className={styles.profileHero} aria-labelledby="athlete-name">
          <AthletePortrait
            name={athlete.name}
            sport={athlete.sport}
            portrait={athlete.portrait}
            colorCategory={athlete.colorCategory}
            priority
          />
          <div className={styles.profileHeroContent}>
            <p className={styles.eyebrow}>{athlete.sport}</p>
            <h1 id="athlete-name">{athlete.name}</h1>
            {(athlete.club || athlete.position) ? (
              <p className={styles.profileMeta}>
                {[athlete.position, athlete.club].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            <p className={styles.profileBio}>{athlete.publicBio}</p>
          </div>
        </section>

        <div className={styles.profileBody}>
          {athlete.journey ? (
            <section className={styles.contentBlock}>
              <h2>Parcours</h2>
              <p>{athlete.journey}</p>
            </section>
          ) : null}
          {athlete.goals?.length ? (
            <section className={styles.contentBlock}>
              <h2>Objectifs</h2>
              <ul>{athlete.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul>
            </section>
          ) : null}
          {athlete.publishedAchievements?.length ? (
            <section className={styles.contentBlock}>
              <h2>Palmarès publié</h2>
              <ul>{athlete.publishedAchievements.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          ) : null}
          {athlete.publishedFacts?.length ? (
            <section className={styles.contentBlock}>
              <h2>Faits validés</h2>
              <ul>{athlete.publishedFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
            </section>
          ) : null}
          <section className={styles.contentBlock}>
            <h2>Créer une connexion</h2>
            <p>Les mises en relation passent par le parcours partenaire sécurisé de KLIQUE. Aucune coordonnée directe n’est publiée.</p>
            <Link className={styles.contactLink} href="/sign-in?redirect_url=/partner/athletes">
              Entrer en contact via KLIQUE
            </Link>
          </section>
          <section className={styles.contentBlock}>
            <Link className={styles.backLink} href="/athletes">← Retour à tous les athlètes</Link>
          </section>
        </div>
      </main>
    </div>
  );
}
