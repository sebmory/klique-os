import { CreationAssistantScreen } from "@/components/contents/CreationAssistantScreen";
import { isArticleCreationDraftsEnabled } from "@/lib/article-creation-drafts/activation";
import { ContentsHubService } from "@/services/contents-hub";

type CreateContentPageProps = {
  searchParams: Promise<{
    subject?: string;
    subjectId?: string;
    contextType?: string;
    objective?: string;
    preset?: string;
    draftId?: string;
    athleteNewsReportId?: string;
    sportsWatchCandidateId?: string;
    sportsWatchCandidateIds?: string;
    sportsWatchDistinctConfirmed?: string;
  }>;
};

export default async function CreateContentPage({ searchParams }: CreateContentPageProps) {
  const params = await searchParams;
  const context = ContentsHubService.contextFromSearchParams(params);

  return (
    <CreationAssistantScreen
      context={context}
      durableArticleDraftsEnabled={isArticleCreationDraftsEnabled()}
      initialArticleDraftId={params.draftId}
      initialAthleteNewsReportId={params.athleteNewsReportId}
      initialSportsWatchCandidateId={params.sportsWatchCandidateId}
      initialSportsWatchCandidateIds={params.sportsWatchCandidateIds
        ?.split(",")
        .map((candidateId) => candidateId.trim())
        .filter(Boolean)}
      initialSportsWatchDistinctConfirmed={params.sportsWatchDistinctConfirmed === "true"}
    />
  );
}
