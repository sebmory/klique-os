import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));

import PublicError from "@/app/error";
import PublicAthletesError from "@/app/athletes/error";

describe("public data failures", () => {
  it("renders explicit retryable public error boundaries", () => {
    const reset = vi.fn();
    const home = renderToStaticMarkup(<PublicError error={new Error("source unavailable")} reset={reset} />);
    const athletes = renderToStaticMarkup(<PublicAthletesError reset={reset} />);

    expect(home).toContain("Les données publiques n’ont pas pu être chargées.");
    expect(athletes).toContain("Impossible de charger les profils.");
    expect(home).toContain("Réessayer");
    expect(athletes).toContain("Réessayer");
    expect(home).not.toContain("source unavailable");
  });

  it("does not convert server read failures into successful empty or missing pages", () => {
    for (const relativePath of [
      "app/page.tsx",
      "app/athletes/page.tsx",
      "app/athletes/[slug]/page.tsx",
      "app/sitemap.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), ...relativePath.split("/")), "utf8");
      expect(source).not.toMatch(/\.catch\s*\(/);
      expect(source).toContain('export const dynamic = "force-dynamic"');
    }
  });
});
