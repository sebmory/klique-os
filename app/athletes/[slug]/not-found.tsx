import Link from "next/link";
import PublicAthleteHeader from "@/components/public-athletes/PublicAthleteHeader";
import styles from "@/components/public-athletes/public-athletes.module.css";

export default function AthleteNotFound() {
  return (
    <div className={styles.page}>
      <PublicAthleteHeader />
      <main className={styles.intro}>
        <p className={styles.eyebrow}>Profil indisponible</p>
        <div>
          <h1>Cet athlète n’est pas publié.</h1>
          <p>Le profil demandé n’existe pas ou ne remplit pas les conditions de publication.</p>
          <Link className={styles.contactLink} href="/athletes">Voir les athlètes publiés</Link>
        </div>
      </main>
    </div>
  );
}
