// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SportsWatchImportPanel } from "@/components/app-shell/SportsWatchImportPanel";
import milaBenjakBoxScore from "@/tests/fixtures/sports-watch/mila-benjak-box-score.json";
import type { SportsWatchImport } from "@/types/sports-watch";

const imported: SportsWatchImport = {
  id: "11111111-1111-4111-8111-111111111111",
  athleteId: "mila-benjak",
  athleteName: "Mila Benjak",
  athleteSport: "Basketball",
  athleteClub: "",
  originalFilename: "mila-benjak.png",
  contentType: "image/png",
  sizeBytes: 1200,
  fileHref: "/api/admin/sports-watch/imports/11111111-1111-4111-8111-111111111111/file",
  status: "extracted",
  extraction: {
    ...milaBenjakBoxScore,
    score: null,
    resultKind: "participation",
    individualParticipationExplicit: true,
  },
  extractionProvider: "fixture",
  extractionModel: "fixture-vision",
  extractedAt: "2026-10-27T08:00:00.000Z",
  candidateId: null,
  version: 2,
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("sports watch import panel", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ imported }),
    })));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows labeled individual statistics and their document evidence without using 71 as a final score", async () => {
    await act(async () => {
      root.render(
        <SportsWatchImportPanel
          athletes={[{
            key: "mila-benjak",
            athleteId: "mila-benjak",
            name: "Mila Benjak",
            sport: "Basketball",
            club: "",
          }]}
          onCandidateCreated={vi.fn()}
        />,
      );
      await flush();
    });

    const athleteSelect = container.querySelector(
      'select[aria-label="Athlète CRM pour l’import"]',
    ) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
      athleteSelect,
      "mila-benjak",
    );
    await act(async () => {
      athleteSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const fileInput = container.querySelector(
      'input[aria-label="Document de résultat"]',
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [new File(["fixture"], "mila-benjak.png", { type: "image/png" })],
    });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const extractButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Extraire les résultats");
    await act(async () => {
      extractButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    });

    expect((container.querySelector('input[aria-label="Libellé statistique 1"]') as HTMLInputElement).value)
      .toBe("Minutes");
    expect((container.querySelector('input[aria-label="Valeur statistique 1"]') as HTMLInputElement).value)
      .toBe("2:16");
    expect((container.querySelector('textarea[aria-label="Preuve statistique 1"]') as HTMLTextAreaElement).value)
      .toBe("MIN 2:16");
    expect(container.textContent).toContain("Statistiques individuelles attribuées par concordance nominative");
    expect((container.querySelector('input[aria-label="Libellé statistique 4"]') as HTMLInputElement).value)
      .toBe("Pourcentage lancers francs");
    const scoreInput = Array.from(container.querySelectorAll("label"))
      .find((label) => label.textContent?.includes("Score final de rencontre"))
      ?.querySelector("input") as HTMLInputElement;
    expect(scoreInput.value).toBe("");
    expect(container.textContent).not.toContain("Score tel qu’affiché : 71");
  });
});
