import { ContactRequestsCrmScreen } from "@/components/crm/ContactRequestsCrmScreen";

export default async function CrmContactRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; requestId?: string | string[] }>;
}) {
  const params = await searchParams;
  const tab = params.tab;
  const requestId = typeof params.requestId === "string" ? params.requestId : undefined;
  return (
    <ContactRequestsCrmScreen
      initialView={tab === "partners" ? "partners" : "services"}
      initialServiceRequestId={requestId}
    />
  );
}
