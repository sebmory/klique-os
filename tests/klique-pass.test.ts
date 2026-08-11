import { describe, expect, it } from "vitest";
import { buildKliquePassViewModel } from "@/lib/klique-pass";

describe("buildKliquePassViewModel", () => {
  it("applies the initial free-year rule to the first 16 athletes", () => {
    const viewModel = buildKliquePassViewModel({
      athlete: {
        key: "ATH-001",
        name: "Mina Durand",
        sport: "Football",
        adhesionDate: "01/01/2025",
      },
      athleteIndex: 7,
      now: new Date("2026-08-10"),
    });

    expect(viewModel.statusLabel).toBe("Expiré");
    expect(viewModel.isActive).toBe(false);
    expect(viewModel.validityLabel).toContain("2026");
  });

  it("does not apply the initial free-year rule beyond the first 16 athletes", () => {
    const viewModel = buildKliquePassViewModel({
      athlete: {
        key: "ATH-017",
        name: "Mina Durand",
        sport: "Football",
        adhesionDate: "01/01/2025",
      },
      athleteIndex: 16,
      now: new Date("2026-08-10"),
    });

    expect(viewModel.statusLabel).toBe("Non renseignée");
    expect(viewModel.isActive).toBe(false);
    expect(viewModel.validityLabel).toBeNull();
  });
});
