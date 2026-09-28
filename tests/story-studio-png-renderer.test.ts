import { describe, expect, it } from "vitest";
import { renderStoryStudioProjectPng } from "@/lib/story-studio/png-renderer";
import type { StoryStudioProject } from "@/types/story-studio";

const project = {
  id: "22222222-2222-4222-8222-222222222222",
} as StoryStudioProject;

describe("Story Studio PNG renderer", () => {
  it("returns a typed valid PNG placeholder without requiring access context", async () => {
    const result = await renderStoryStudioProjectPng(project);
    const signature = new Uint8Array(result.bytes).slice(0, 8);

    expect(Array.from(signature)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(result.filename).toBe(`story-studio-${project.id}.png`);
    expect(result.placeholder).toBe(true);
  });
});