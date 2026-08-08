import { redirect } from "next/navigation";

type PartnerPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PartnerPage({ params }: PartnerPageProps) {
  const { id } = await params;
  redirect(`/ecosysteme/${encodeURIComponent(decodeURIComponent(id))}`);
}
