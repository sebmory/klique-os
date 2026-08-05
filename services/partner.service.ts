import type {
  NewPartner,
  Partner,
  PartnerResponse,
  PartnerUpdate,
} from "@/types/partner";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Une erreur est survenue.");
  }
  return data as T;
}

export const PartnerService = {
  async list(): Promise<PartnerResponse> {
    const response = await fetch("/api/partners", { cache: "no-store" });
    return parseResponse<PartnerResponse>(response);
  },

  async create(partner: NewPartner): Promise<void> {
    const response = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partner),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  async update(update: PartnerUpdate): Promise<void> {
    const response = await fetch("/api/partners", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  async remove(row: number): Promise<void> {
    const response = await fetch(`/api/partners?row=${row}`, {
      method: "DELETE",
    });
    await parseResponse<{ success: boolean }>(response);
  },

  filter(partners: Partner[], search: string, category: string): Partner[] {
    return partners.filter((partner) => {
      const matchesSearch = `${partner.name} ${partner.category} ${partner.contact} ${partner.email}`
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesCategory =
        category === "Tous" || partner.category === category;

      return matchesSearch && matchesCategory;
    });
  },
};
