import { ProductionDetailScreen } from "@/components/production/ProductionDetailScreen";

type ProductionDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProductionDetailPage({ params }: ProductionDetailPageProps) {
  const { id } = await params;
  return <ProductionDetailScreen id={decodeURIComponent(id)} />;
}
