import { CreationAssistantScreen } from "@/components/contents/CreationAssistantScreen";
import { ContentsHubService } from "@/services/contents-hub";

type CreateContentPageProps = {
  searchParams: Promise<{
    subject?: string;
    subjectId?: string;
    contextType?: string;
    objective?: string;
  }>;
};

export default async function CreateContentPage({ searchParams }: CreateContentPageProps) {
  const params = await searchParams;
  const context = ContentsHubService.contextFromSearchParams(params);

  return <CreationAssistantScreen context={context} />;
}
