import { describe, expect, it } from "vitest";
import { parseProductionNotes, serializeProductionNotes } from "@/services/production-notes";

describe("production notes storage", () => {
  it("round-trips structured notes", () => {
    const notes = [
      { id: "note-1", content: "Première note", createdAt: "2026-08-09T10:00:00.000Z", updatedAt: "2026-08-09T10:15:00.000Z" },
    ];

    expect(parseProductionNotes(serializeProductionNotes(notes))).toEqual(notes);
  });

  it("converts legacy plain text into a note entry", () => {
    const parsed = parseProductionNotes("Ancienne note en texte libre");

    expect(parsed).toHaveLength(1);
    expect(parsed[0].content).toBe("Ancienne note en texte libre");
    expect(parsed[0].createdAt).toBeTruthy();
  });
});
