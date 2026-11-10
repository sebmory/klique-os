import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCachedPublicAthleteBySlug, notFound } = vi.hoisted(() => ({
  getCachedPublicAthleteBySlug: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/public-athletes-server", () => ({ getCachedPublicAthleteBySlug }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

import AthletePage, { generateMetadata } from "@/app/athletes/[slug]/page";

const publishedAthlete = {
  slug: "mila-martin",
  name: "Mila Martin",
  sport: "Football",
  club: "FC Lausanne",
  position: "Attaquante",
  portrait: "https://images.example/mila.jpg",
  colorCategory: "field" as const,
  publicBio: "Une attaquante engagée.",
  journey: "Formée à Lausanne.",
  goals: ["Rejoindre la sélection"],
  publishedAchievements: ["Coupe régionale"],
  publishedFacts: ["12 buts validés"],
};

describe("public athlete profile page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedPublicAthleteBySlug.mockResolvedValue(publishedAthlete);
  });

  it("renders only the public DTO and safe partner workflow", async () => {
    const element = await AthletePage({ params: Promise.resolve({ slug: "mila-martin" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Mila Martin");
    expect(html).toContain("12 buts validés");
    expect(html).toContain('href="/sign-in?redirect_url=/partner/athletes"');
    expect(html).toContain("Entrer en contact via KLIQUE");
    expect(html).not.toContain("sourceAthleteId");
    expect(html).not.toMatch(/email|téléphone|date de naissance|Sports Watch|pending|dismissed/i);
  });

  it("renders a premium initials placeholder when no portrait is published", async () => {
    getCachedPublicAthleteBySlug.mockResolvedValue({
      ...publishedAthlete,
      portrait: undefined,
      publicBio: "Athlète de Football au sein de FC Lausanne.",
    });
    const element = await AthletePage({ params: Promise.resolve({ slug: "mila-martin" }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("MM");
    expect(html).toContain("Portrait non publié de Mila Martin");
    expect(html).toContain("Athlète de Football au sein de FC Lausanne.");
  });

  it("generates canonical, Open Graph and portrait metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: "mila-martin" }) });
    expect(metadata.alternates).toEqual({ canonical: "/athletes/mila-martin" });
    expect(metadata.openGraph).toMatchObject({
      title: "Mila Martin | KLIQUE",
      url: "/athletes/mila-martin",
      images: [{ url: "https://images.example/mila.jpg", alt: "Portrait de Mila Martin" }],
    });
  });

  it("uses notFound for an unknown or non-publishable slug", async () => {
    getCachedPublicAthleteBySlug.mockResolvedValue(null);
    await expect(AthletePage({ params: Promise.resolve({ slug: "inconnu" }) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
