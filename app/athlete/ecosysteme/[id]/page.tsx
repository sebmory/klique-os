import { EcosystemAthleteResourceScreen } from "@/components/ecosystem/EcosystemAthleteResourceScreen";

type AthleteEcosystemResourcePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AthleteEcosystemResourcePage({ params }: AthleteEcosystemResourcePageProps) {
  const { id } = await params;
  return <EcosystemAthleteResourceScreen id={decodeURIComponent(id)} />;
}
