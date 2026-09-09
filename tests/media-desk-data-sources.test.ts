import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), "utf8");

const MEDIA_SOURCES = [
  "components/media-desk/MediaDeskMediaScreen.tsx",
  "components/media-desk/MediaSubjectDetailScreen.tsx",
  "components/media-desk/media-subject-presentation.ts",
  "app/media-desk/[subjectId]/page.tsx",
];

describe("media desk data sources", () => {
  it("never calls the athlete directory from the media screens", () => {
    for (const source of MEDIA_SOURCES) {
      expect(readSource(source)).not.toContain("/api/athletes");
    }
  });

  it("reads the athletes carried by the subjects endpoints", () => {
    expect(readSource("components/media-desk/MediaDeskMediaScreen.tsx")).toContain("/api/media-subjects");
    expect(readSource("components/media-desk/MediaSubjectDetailScreen.tsx")).toContain("/api/media-subjects/");
  });

  it("keeps the athlete directory for the admin selection only", () => {
    const adminPage = readSource("app/media-desk/page.tsx");
    expect(adminPage).toContain("/api/athletes");
    expect(adminPage).toContain("MediaDeskMediaScreen");
    expect(adminPage).not.toContain("useAthleteNameIndex");
  });
});
