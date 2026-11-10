import type { Metadata } from "next";
import PublicHome from "@/components/home/PublicHome";
import { selectFeaturedPublicAthletes } from "@/lib/public-athletes";
import { listPublicAthletes } from "@/lib/public-athletes-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "KLIQUE | Le réseau au service des athlètes",
  description: "Athlètes, experts, partenaires, créatifs et médias réunis pour faire avancer les parcours sportifs.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Votre ambition mérite tout un réseau.",
    description: "Découvrez les athlètes et l’écosystème KLIQUE.",
    url: "/",
    type: "website",
  },
};

const loadHomeAthletes = async () => {
  try {
    const athletes = await listPublicAthletes();
    return { athletes, loadError: false };
  } catch (error) {
    console.error("[PublicHome] Public athlete projection unavailable", error);
    return { athletes: [], loadError: true };
  }
};

export default async function Home() {
  const { athletes, loadError } = await loadHomeAthletes();
  return (
    <PublicHome
      publicAthletes={athletes}
      featuredAthletes={selectFeaturedPublicAthletes(athletes, 6)}
      athleteDirectoryError={loadError}
    />
  );
}
