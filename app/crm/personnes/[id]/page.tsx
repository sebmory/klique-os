import { PersonCockpitScreen } from "@/components/crm/PersonCockpitScreen";

type PersonPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PersonPage({ params }: PersonPageProps) {
  const { id } = await params;
  return <PersonCockpitScreen id={decodeURIComponent(id)} />;
}
