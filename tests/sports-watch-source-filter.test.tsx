// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SportsWatchAdminCard } from "@/components/app-shell/SportsWatchAdminCard";
import { isSportCompatibleWithWatchSource } from "@/lib/sports-watch/sport";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const athletes = [
  {
    key: "badminton",
    athleteId: "badminton",
    name: "Alice Badminton",
    sport: "Badminton",
    club: "",
  },
  {
    key: "wakesurf",
    athleteId: "wakesurf",
    name: "Bruno Wakesurf",
    sport: "Wakesurf",
    club: "",
  },
  {
    key: "multi",
    athleteId: "multi",
    name: "Camille Multisport",
    sport: "Foot us et basket",
    club: "",
  },
  {
    key: "basket",
    athleteId: "basket",
    name: "Diane Basket",
    sport: "Basketball",
    club: "",
  },
];

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const setSelectValue = async (select: HTMLSelectElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, value);
  await act(async () => {
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
  });
};

const optionLabels = (select: HTMLSelectElement): string[] =>
  Array.from(select.options).slice(1).map((option) => option.textContent ?? "");

describe("sports watch source athlete filtering", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [],
        swissBindings: [],
        iwwfBindings: [],
        safvBindings: [],
        beBasketBindings: [],
      }),
    })));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<SportsWatchAdminCard athletes={athletes} />);
      await flush();
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("maps every collection source to its normalized sport and keeps multisport SAFV profiles", () => {
    expect(isSportCompatibleWithWatchSource("Badminton", "bc-bulle")).toBe(true);
    expect(isSportCompatibleWithWatchSource("BADMINTON", "swiss-badminton")).toBe(true);
    expect(isSportCompatibleWithWatchSource("Wake-surf", "iwwf-wakesurf")).toBe(true);
    expect(isSportCompatibleWithWatchSource("Kempô", "kenpokan")).toBe(true);
    expect(isSportCompatibleWithWatchSource("Foot us et basket", "safv")).toBe(true);
    expect(isSportCompatibleWithWatchSource("Basketball", "safv")).toBe(false);
    expect(isSportCompatibleWithWatchSource("Basketball", "bebasket")).toBe(true);
    expect(isSportCompatibleWithWatchSource("Foot us et basket", "bebasket")).toBe(true);
  });

  it("filters options, clears an incompatible selection, shows the empty state, and leaves manual imports independent", async () => {
    const sourceSelect = container.querySelector(
      'select[aria-label="Source de veille"]',
    ) as HTMLSelectElement;
    const watchAthleteSelect = container.querySelector(
      'select[aria-label="Athlète CRM à surveiller"]',
    ) as HTMLSelectElement;
    const importAthleteSelect = container.querySelector(
      'select[aria-label="Athlète CRM pour l’import"]',
    ) as HTMLSelectElement;

    expect(optionLabels(watchAthleteSelect)).toEqual(["Alice Badminton — Badminton"]);
    await setSelectValue(watchAthleteSelect, "badminton");
    expect(watchAthleteSelect.value).toBe("badminton");

    await setSelectValue(sourceSelect, "iwwf-wakesurf");
    expect(watchAthleteSelect.value).toBe("");
    expect(optionLabels(watchAthleteSelect)).toEqual(["Bruno Wakesurf — Wakesurf"]);

    await setSelectValue(sourceSelect, "safv");
    expect(optionLabels(watchAthleteSelect)).toEqual([
      "Camille Multisport — Foot us et basket",
    ]);

    await setSelectValue(sourceSelect, "bebasket");
    expect(optionLabels(watchAthleteSelect)).toEqual([
      "Camille Multisport — Foot us et basket",
      "Diane Basket — Basketball",
    ]);

    expect(optionLabels(importAthleteSelect)).toEqual([
      "Camille Multisport — Foot us et basket",
      "Diane Basket — Basketball",
    ]);

    await setSelectValue(sourceSelect, "kenpokan");
    expect(optionLabels(watchAthleteSelect)).toEqual([]);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Aucun athlète ne correspond",
    );
    expect(optionLabels(importAthleteSelect)).toEqual([
      "Camille Multisport — Foot us et basket",
      "Diane Basket — Basketball",
    ]);
  });
});
