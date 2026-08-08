import { EcosystemResourceScreen } from "@/components/ecosystem/EcosystemResourceScreen";

type EcosystemResourcePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EcosystemResourcePage({ params }: EcosystemResourcePageProps) {
  const { id } = await params;
  return <EcosystemResourceScreen id={decodeURIComponent(id)} />;
}
