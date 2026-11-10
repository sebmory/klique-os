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

export default async function Home() {
  const athletes = await listPublicAthletes();
  return <PublicHome featuredAthletes={selectFeaturedPublicAthletes(athletes, 6)} />;
}
