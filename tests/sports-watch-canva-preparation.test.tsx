// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SportsWatchAdminCard } from "@/components/app-shell/SportsWatchAdminCard";
import { SportsWatchCanvaPreparationPanel } from "@/components/app-shell/sports-watch/SportsWatchCanvaPreparationPanel";
import {
  buildSportsWatchCanvaPreparation,
  isBasketballSportsWatchCandidate,
} from "@/lib/sports-watch/canva-preparation";
import type { SportsWatchCandidate } from "@/types/sports-watch";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const basketballCandidate = (
  overrides: Partial<SportsWatchCandidate> = {},
): SportsWatchCandidate => ({
  id: "11111111-1111-4111-8111-111111111111",
  athleteId: "mila-benjak",
  athleteName: "Mila Benjak",
  sourceName: "Swiss Basketball — source officielle",
  sourceUrl: "https://swiss.basketball/schedule",
  articleUrl: "https://swiss.basketball/game",
  title: "Elfic Fribourg Génération 63–51 BC Arlesheim — Benjak Mila",
  excerpt: [
    "Source : Swiss Basketball — source officielle.",
    "Compétition : NLB Women · 2026-2027.",
    "Équipe : Elfic Fribourg Génération.",
    "Match : Elfic Fribourg Génération 63–51 BC Arlesheim.",
    "Date : 2026-10-25.",
    "Présence nominative : Benjak Mila, identifiant joueur 71375, numéro 7.",
    "Titularisation : non.",
    "Participation établie par une donnée individuelle explicite.",
    "Statistiques individuelles explicitement présentes : MIN 31:04 · PTS 16 · REB 0 · PD 4.",
    "Minutes et autres statistiques absentes : aucune valeur n’est déduite.",
  ].join(" "),
  resultKind: "individual_result",
  publicationDate: null,
  eventDateFrom: "2026-10-25",
  eventDateTo: "2026-10-25",
  collectedAt: "2026-10-26T10:00:00.000Z",
  attributionStatus: "matched",
  attributionEvidence: ["Rattachement officiel."],
  verificationStatus: "verified",
  adminStatus: "validated",
  supersedesCandidateId: null,
  version: 1,
  ...overrides,
});

describe("sports watch Canva preparation", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("builds a complete basketball sheet and preserves explicit zero values", () => {
    const preparation = buildSportsWatchCanvaPreparation(
      basketballCandidate(),
      "Elfic Fribourg Génération",
    );

    expect(preparation.identity).toEqual([
      { label: "Athlète", value: "Mila Benjak", requiresVerification: false },
      { label: "Club", value: "Elfic Fribourg Génération", requiresVerification: false },
      { label: "Adversaire", value: "BC Arlesheim", requiresVerification: false },
      { label: "Compétition", value: "NLB Women", requiresVerification: false },
      { label: "Date", value: "2026-10-25", requiresVerification: false },
    ]);
    expect(preparation.collective).toEqual([
      { label: "Score collectif", value: "63–51", requiresVerification: false },
    ]);
    expect(preparation.individual).toContainEqual({
      label: "Rebonds",
      value: "0",
      requiresVerification: false,
    });
    expect(preparation.copyText).toContain("Score collectif : 63–51");
    expect(preparation.copyText).toContain("Rebonds : 0");
  });

  it("omits missing statistics and excludes unverified facts from copied text", () => {
    const candidate = basketballCandidate({
      excerpt: [
        "Source : Swiss Basketball — source officielle.",
        "Compétition : NLB Women · 2026-2027.",
        "Équipe : Elfic Fribourg Génération.",
        "Match : Elfic Fribourg Génération 63–51 BC Arlesheim.",
        "Date : 2026-10-25.",
        "Présence nominative : Benjak Mila, identifiant joueur 71375.",
        "Titularisation : non renseignée.",
        "Participation non établie par la seule présence sur la feuille.",
        "Aucune statistique individuelle chiffrée explicite n’est présente.",
        "Minutes et autres statistiques absentes : aucune valeur n’est déduite.",
      ].join(" "),
      resultKind: "participation",
      verificationStatus: "unverified",
    });
    const preparation = buildSportsWatchCanvaPreparation(
      candidate,
      "Elfic Fribourg Génération",
    );

    expect(preparation.individual).toEqual([]);
    expect(preparation.identity.find((item) => item.label === "Adversaire"))
      .toMatchObject({ value: "BC Arlesheim", requiresVerification: true });
    expect(preparation.copyText).toBe([
      "Athlète : Mila Benjak",
      "Club : Elfic Fribourg Génération",
    ].join("\n"));
  });

  it("shows copy confirmation, a selectable text area and the configured Canva link", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await act(async () => {
      root.render(
        <SportsWatchCanvaPreparationPanel
          candidate={basketballCandidate()}
          athleteClub="Elfic Fribourg Génération"
          templateUrl="https://canva.link/9n76e6v4u03o3ru"
          onClose={vi.fn()}
        />,
      );
    });

    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Informations Canva à copier"]',
    );
    expect(textarea?.readOnly).toBe(true);
    expect(textarea?.value).toContain("Points : 16");
    const link = Array.from(container.querySelectorAll("a"))
      .find((item) => item.textContent === "Ouvrir le modèle Canva");
    expect(link).toMatchObject({
      href: "https://canva.link/9n76e6v4u03o3ru",
      target: "_blank",
    });

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Copier les infos")!
        .click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(textarea?.value);
    expect(container.textContent).toContain("Infos copiées.");
  });

  it("keeps copy available when the Canva template is not configured", async () => {
    await act(async () => {
      root.render(
        <SportsWatchCanvaPreparationPanel
          candidate={basketballCandidate()}
          athleteClub="Elfic Fribourg Génération"
          templateUrl={null}
          onClose={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("Copier les infos");
    expect(container.textContent).toContain("Modèle Canva à configurer");
    expect(container.querySelector('a[target="_blank"]')).toBeNull();
  });

  it("limits eligibility to basketball news", () => {
    expect(isBasketballSportsWatchCandidate(basketballCandidate(), "Basketball")).toBe(true);
    expect(isBasketballSportsWatchCandidate(
      basketballCandidate({ sourceName: "Source test", manualEntry: null }),
      "Tennis",
    )).toBe(false);
  });

  it("shows the Canva action next to article preparation only for exploitable basketball news", async () => {
    const basketball = basketballCandidate();
    const tennis = basketballCandidate({
      id: "22222222-2222-4222-8222-222222222222",
      athleteId: "tennis-athlete",
      athleteName: "Athlète Tennis",
      sourceName: "Source test",
      title: "Résultat tennis",
      excerpt: "Résultat individuel.",
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        workspaceId: "workspace-a",
        candidates: [basketball, tennis],
        swissBindings: [],
        iwwfBindings: [],
        safvBindings: [],
        beBasketBindings: [],
        swissBasketballBindings: [],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <SportsWatchAdminCard
          athletes={[
            {
              key: "mila-benjak",
              athleteId: "mila-benjak",
              name: "Mila Benjak",
              sport: "Basketball",
              club: "Elfic Fribourg Génération",
              status: "Actif",
            },
            {
              key: "tennis-athlete",
              athleteId: "tennis-athlete",
              name: "Athlète Tennis",
              sport: "Tennis",
              club: "Club Tennis",
              status: "Actif",
            },
          ]}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const canvaActions = Array.from(container.querySelectorAll("button"))
      .filter((button) => button.textContent === "Préparer un visuel Canva");
    const articleActions = Array.from(container.querySelectorAll("button"))
      .filter((button) => button.textContent === "Préparer un article");
    expect(canvaActions).toHaveLength(1);
    expect(articleActions).toHaveLength(2);

    await act(async () => {
      canvaActions[0].click();
    });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("Score collectif");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
