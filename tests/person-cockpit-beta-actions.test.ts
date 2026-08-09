import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

describe("PersonCockpitScreen beta actions", () => {
  it("does not render the non-functional beta action labels", () => {
    const source = readFileSync(path.join(process.cwd(), "components/crm/PersonCockpitScreen.tsx"), "utf8");

    for (const label of [
      "Modifier",
      "Partager",
      "Plus d'actions",
      "Nouveau shooting",
      "Nouvelle publication",
      "Ajouter une note",
      "Planifier un contact",
    ]) {
      expect(source).not.toContain(label);
    }
  });
});
