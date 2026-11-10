"use client";

import Link from "next/link";

export default function PublicError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="public-error-page" role="alert">
      <p>KLIQUE</p>
      <h1>Le réseau est momentanément indisponible.</h1>
      <p>Les données publiques n’ont pas pu être chargées. Vous pouvez réessayer sans perdre votre parcours.</p>
      <div>
        <button type="button" onClick={reset}>Réessayer</button>
        <Link href="/">Revenir à l’accueil</Link>
      </div>
    </main>
  );
}
