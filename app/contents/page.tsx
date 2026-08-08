import { ContentsHubScreen } from "@/components/contents/ContentsHubScreen";
import { ContentsHubService } from "@/services/contents-hub";

type ContentsPageProps = {
  searchParams: Promise<{
    subject?: string;
    subjectId?: string;
    contextType?: string;
  }>;
};

export default async function ContentsPage({ searchParams }: ContentsPageProps) {
  const params = await searchParams;
  const context = ContentsHubService.contextFromSearchParams(params);
  return <ContentsHubScreen context={context} />;
}
