import { StoryStudioSavedEditor } from "@/components/contents/story-studio/StoryStudioSavedEditor";

type StoryStudioEditorPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function StoryStudioEditorPage({ params }: StoryStudioEditorPageProps) {
  const { projectId } = await params;
  return <StoryStudioSavedEditor projectId={projectId} />;
}