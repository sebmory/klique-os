import { AthleteOpportunityDetailScreen } from "@/components/athletes/AthleteOpportunityDetailScreen";

type AthleteOpportunityPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AthleteOpportunityPage({ params }: AthleteOpportunityPageProps) {
  const { id } = await params;
  return <AthleteOpportunityDetailScreen id={decodeURIComponent(id)} />;
}
