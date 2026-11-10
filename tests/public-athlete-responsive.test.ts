import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public athlete responsive and motion contract", () => {
  const css = readFileSync(
    join(process.cwd(), "components", "public-athletes", "public-athletes.module.css"),
    "utf8",
  );

  it("uses a compact two-column directory at 390px", () => {
    expect(css).toContain("@media (max-width: 520px)");
    expect(css).toMatch(
      /@media \(max-width: 520px\)[\s\S]*\.cardGrid[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });

  it("keeps keyboard focus visible and honors reduced motion", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 1ms !important");
  });
});
