import type { Athlete } from "@/types/athlete";
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

const splitLegacyNames = (value: string) =>
  value.split(",").map((part) => part.trim()).filter(Boolean);

const athleteKeys = (
  partner: Pick<Partner, "athletes"> | Pick<NewPartner, "athletes">,
  athletes: Athlete[]
): string[] => {
  const raw = partner.athletes.trim();
  if (!raw) return [];

  if (raw.includes("|")) {
    return raw.split("|").map((key) => key.trim()).filter(Boolean);
  }

  return splitLegacyNames(raw)
    .map((name) => athletes.find((athlete) => athlete.name === name)?.key)
    .filter((key): key is string => Boolean(key));
};

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

  athleteKeys,

  athleteNames(
    partner: Pick<Partner, "athletes"> | Pick<NewPartner, "athletes">,
    athletes: Athlete[]
  ): string[] {
    return athleteKeys(partner, athletes)
      .map((key) => athletes.find((athlete) => athlete.key === key)?.name)
      .filter((name): name is string => Boolean(name));
  },

  encodeAthleteKeys(keys: string[]): string {
    return Array.from(new Set(keys)).join("|");
  },

  partnersForAthlete(
    partners: Partner[],
    athlete: Pick<Athlete, "key" | "name">
  ): Partner[] {
    return partners.filter((partner) => {
      const raw = partner.athletes.trim();
      if (!raw) return false;
      if (raw.includes("|")) {
        return raw.split("|").map((key) => key.trim()).includes(athlete.key);
      }
      return splitLegacyNames(raw).includes(athlete.name);
    });
  },

  filter(partners: Partner[], search: string, category: string): Partner[] {
    return partners.filter((partner) => {
      const matchesSearch = `${partner.name} ${partner.category} ${partner.contact} ${partner.email}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesCategory = category === "Tous" || partner.category === category;
      return matchesSearch && matchesCategory;
    });
  },
};
