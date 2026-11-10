import { beforeEach, describe, expect, it, vi } from "vitest";

const listPublicAthletes = vi.hoisted(() => vi.fn());
vi.mock("@/lib/public-athletes-server", () => ({ listPublicAthletes }));

import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

describe("public SEO routes", () => {
  beforeEach(() => {
    listPublicAthletes.mockResolvedValue([
      { slug: "mila-martin", portrait: "https://images.example/mila.jpg" },
    ]);
  });

  it("limits the sitemap to public pages and actually publishable athlete slugs", async () => {
    const urls = (await sitemap()).map(({ url }) => url);
    expect(urls).toEqual([
      "https://app.klique.ch",
      "https://app.klique.ch/athletes",
      "https://app.klique.ch/athletes/mila-martin",
      "https://app.klique.ch/pass",
    ]);
    expect(urls.join(" ")).not.toMatch(/api|admin|crm|today/);
  });

  it("disallows private application areas and references the sitemap", () => {
    const result = robots();
    expect(result.sitemap).toBe("https://app.klique.ch/sitemap.xml");
    expect(JSON.stringify(result)).toContain("/api/");
    expect(JSON.stringify(result)).toContain("/crm/");
  });
});
