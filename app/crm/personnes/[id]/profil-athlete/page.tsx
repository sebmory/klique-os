import { AthleteProfilePreviewScreen } from "@/components/athletes/AthleteProfilePreviewScreen";

type AthleteProfilePreviewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AthleteProfilePreviewPage({ params }: AthleteProfilePreviewPageProps) {
  const { id } = await params;
  return <AthleteProfilePreviewScreen athleteId={decodeURIComponent(id)} />;
}
