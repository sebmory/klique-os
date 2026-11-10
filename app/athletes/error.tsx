"use client";

import Link from "next/link";

export default function PublicAthletesError({ reset }: { reset: () => void }) {
  return (
    <main className="public-error-page" role="alert">
      <p>KLIQUE · ATHLÈTES</p>
      <h1>Impossible de charger les profils.</h1>
      <p>Le réseau public est momentanément indisponible.</p>
      <div>
        <button type="button" onClick={reset}>Réessayer</button>
        <Link href="/">Revenir à l’accueil</Link>
      </div>
    </main>
  );
}
