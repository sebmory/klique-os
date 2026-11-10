import type { MetadataRoute } from "next";
import { listPublicAthletes } from "@/lib/public-athletes-server";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.klique.ch").replace(/\/+$/, "");

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const athletes = await listPublicAthletes();
  return [
    { url: appUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${appUrl}/athletes`, changeFrequency: "weekly", priority: 0.9 },
    ...athletes.map((athlete) => ({
      url: `${appUrl}/athletes/${athlete.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      images: athlete.portrait ? [athlete.portrait] : undefined,
    })),
    { url: `${appUrl}/pass`, changeFrequency: "monthly", priority: 0.6 },
  ];
}
