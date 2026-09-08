import { ContactRequestsCrmScreen } from "@/components/crm/ContactRequestsCrmScreen";

export default async function CrmContactRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const tab = (await searchParams).tab;
  return <ContactRequestsCrmScreen initialView={tab === "partners" ? "partners" : "services"} />;
}
