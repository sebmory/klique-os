import Link from "next/link";
import styles from "./public-athletes.module.css";

export default function PublicAthleteHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="KLIQUE, accueil">KLIQUE</Link>
      <nav aria-label="Navigation publique">
        <Link href="/athletes">Les athlètes</Link>
        <Link href="/pass">Rejoindre KLIQUE</Link>
        <Link href="/sign-in">Se connecter</Link>
      </nav>
    </header>
  );
}
