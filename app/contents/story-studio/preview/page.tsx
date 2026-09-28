import { StoryStudioPreview } from "@/components/contents/story-studio/StoryStudioPreview";

type StoryStudioPreviewPageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function StoryStudioPreviewPage({ searchParams }: StoryStudioPreviewPageProps) {
  const { projectId = "" } = await searchParams;
  return <StoryStudioPreview initialProjectId={projectId} />;
}