import { SportsBriefScreen } from "@/components/contents/SportsBriefScreen";

type SportsBriefPageProps = {
  searchParams: Promise<{
    candidateId?: string;
    documentId?: string;
  }>;
};

export default async function SportsBriefPage({ searchParams }: SportsBriefPageProps) {
  const params = await searchParams;
  return (
    <SportsBriefScreen
      initialCandidateId={params.candidateId?.trim() || undefined}
      initialDocumentId={params.documentId?.trim() || undefined}
    />
  );
}
