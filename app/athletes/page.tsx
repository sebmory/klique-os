import type { Metadata } from "next";
import AthleteDirectory from "@/components/public-athletes/AthleteDirectory";
import PublicAthleteHeader from "@/components/public-athletes/PublicAthleteHeader";
import styles from "@/components/public-athletes/public-athletes.module.css";
import { listPublicAthletes } from "@/lib/public-athletes-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Les athlètes du réseau | KLIQUE",
  description: "Découvrez les parcours et ambitions des athlètes publiés par KLIQUE.",
  alternates: { canonical: "/athletes" },
  openGraph: {
    title: "Les athlètes du réseau KLIQUE",
    description: "Des parcours, des sports et des ambitions réunis au sein du réseau KLIQUE.",
    url: "/athletes",
    type: "website",
  },
};

export default async function AthletesPage() {
  const athletes = await listPublicAthletes();
  return (
    <div className={styles.page}>
      <PublicAthleteHeader />
      <main>
        <section className={styles.intro} aria-labelledby="athletes-title">
          <p className={styles.eyebrow}>Le réseau KLIQUE</p>
          <div>
            <h1 id="athletes-title">Des athlètes, des parcours, une même ambition.</h1>
            <p>Explorez les profils que les athlètes ont choisi de rendre publics et découvrez leur univers sportif.</p>
          </div>
        </section>
        <section className={styles.directory} aria-label="Annuaire des athlètes">
          <AthleteDirectory athletes={athletes} />
        </section>
      </main>
    </div>
  );
}
