import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STORY_STUDIO_CANVAS } from "@/lib/story-studio/templates";

const css = readFileSync("components/contents/story-studio/story-studio-preview.module.css", "utf8");
const mobileMarker = "@media (max-width: 760px)";
const markerIndex = css.indexOf(mobileMarker);
const desktopCss = css.slice(0, markerIndex);
const mobileCss = css.slice(markerIndex);

describe("Story Studio mobile editor responsive contract", () => {
  it("keeps the internal export resolution while fitting the preview to phone width", () => {
    expect(STORY_STUDIO_CANVAS).toEqual({ width: 1080, height: 1920 });
    expect(css).toContain("aspect-ratio: 9 / 16");
    expect(mobileCss).toMatch(/\.stage\s*\{[\s\S]*?width: 100%;[\s\S]*?max-width: 430px;/);
  });

  it("prevents horizontal overflow in the mobile workspace and lower panel", () => {
    expect(mobileCss).toContain("overflow-x: clip");
    expect(mobileCss).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(mobileCss).toMatch(/\.controls\s*\{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?box-sizing: border-box;/);
    expect(mobileCss).toMatch(/\.photoCatalog\s*\{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  });

  it("provides four clear touch targets and persistent export actions only on mobile", () => {
    expect(mobileCss).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(mobileCss).toContain("height: 56px");
    expect(mobileCss).toContain("min-height: 48px");
    expect(mobileCss).toContain("touch-action: manipulation");
    expect(mobileCss).toMatch(/\.exportButtons\s*\{[\s\S]*?position: fixed;[\s\S]*?bottom: 0;/);
    expect(desktopCss).not.toMatch(/\.exportButtons\s*\{[\s\S]*?position: fixed;/);
  });
});