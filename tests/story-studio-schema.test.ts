import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("db/migrations/20261004_story_studio_projects_v1.sql", "utf8")
  .replace(/\s+/g, " ");

describe("Story Studio project schema", () => {
  it("keeps one project per workspace and Stories variant", () => {
    expect(migration).toContain("UNIQUE (workspace_id, source_stories_variant_id)");
  });

  it("links the project to the exact Stories variant of its Pack", () => {
    expect(migration).toContain("FOREIGN KEY (workspace_id, source_pack_id, source_stories_variant_id)");
    expect(migration).toContain("REFERENCES content_after_match_packs (workspace_id, id, stories_variant_id)");
  });

  it("enforces four frames, template consistency and optimistic versions", () => {
    expect(migration).toContain("jsonb_array_length(payload_json->'frames') = 4");
    expect(migration).toContain("payload_json->>'templateKey' = template_key");
    expect(migration).toContain("CHECK (version >= 1)");
  });
});