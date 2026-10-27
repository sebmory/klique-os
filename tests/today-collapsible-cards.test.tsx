// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AthleteNewsReportsAdminCard } from "@/components/app-shell/AthleteNewsReportsAdminCard";
import { PartnerIntroductionsAdminCockpit } from "@/components/app-shell/PartnerIntroductionsAdminCockpit";
import { SportsWatchAdminCard } from "@/components/app-shell/SportsWatchAdminCard";
import { TodayCollapsibleCard } from "@/components/app-shell/TodayCollapsibleCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const clickButton = async (container: HTMLElement, label: string) => {
  const button = Array.from(container.querySelectorAll("button"))
    .find((item) => item.textContent?.includes(label));
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
  });
};

describe("Today collapsible cards", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens pending cards by default and persists the user's collapsed choice", async () => {
    await act(async () => {
      root.render(
        <TodayCollapsibleCard storageKey="fixture" title="Bloc test" attentionCount={2}>
          <p>Contenu</p>
        </TodayCollapsibleCard>,
      );
      await flush();
    });
    const toggle = container.querySelector(".today-card-toggle") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await clickButton(container, "Replier");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem("klique.today.card-open.v1:fixture")).toBe("false");

    await act(async () => {
      root.render(
        <TodayCollapsibleCard storageKey="fixture" title="Bloc test" attentionCount={3}>
          <p>Contenu actualisé</p>
        </TodayCollapsibleCard>,
      );
      await flush();
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("separates processed athlete reports into History", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        reports: [
          {
            id: "new",
            athleteId: "athlete-1",
            message: "À examiner",
            eventDate: "2026-10-26",
            externalUrl: null,
            photoHref: null,
            status: "new",
            version: 1,
            createdAt: "2026-10-26T10:00:00.000Z",
            updatedAt: "2026-10-26T10:00:00.000Z",
          },
          {
            id: "processed",
            athleteId: "athlete-1",
            message: "Déjà traité",
            eventDate: "2026-10-25",
            externalUrl: null,
            photoHref: null,
            status: "processed",
            version: 2,
            createdAt: "2026-10-25T10:00:00.000Z",
            updatedAt: "2026-10-26T10:00:00.000Z",
          },
        ],
      }),
    })));
    await act(async () => {
      root.render(<AthleteNewsReportsAdminCard athletes={[{ key: "athlete-1", name: "Mila Benjak" }]} />);
      await flush();
    });

    expect(container.textContent).toContain("À examiner");
    expect(container.textContent).not.toContain("Déjà traité");
    await clickButton(container, "Historique");
    expect(container.textContent).toContain("Déjà traité");
    expect(container.textContent).not.toContain("À examiner");
  });

  it("keeps reported completed introductions in the current view and moves ordinary completed ones to History", async () => {
    const item = (input: Partial<Record<string, unknown>>) => ({
      id: String(input.id),
      partnerPublicName: "Partenaire",
      athletePublicName: "Athlète",
      historical: false,
      reason: String(input.reason),
      status: "accepted",
      moderationStatus: "active",
      createdAt: "2026-10-26T10:00:00.000Z",
      ageDays: 1,
      stale: false,
      reported: false,
      ...input,
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        workflowEnabled: true,
        items: [
          item({ id: "reported", reason: "Acceptée mais signalée", reported: true }),
          item({ id: "done", reason: "Acceptée terminée" }),
          item({ id: "legacy", reason: "Ancienne demande", historical: true, status: "resolved" }),
        ],
      }),
    })));
    await act(async () => {
      root.render(<PartnerIntroductionsAdminCockpit />);
      await flush();
    });

    expect(container.textContent).toContain("Acceptée mais signalée");
    expect(container.textContent).not.toContain("Acceptée terminée");
    expect(container.textContent).not.toContain("Ancienne demande");
    await clickButton(container, "Historique");
    expect(container.textContent).toContain("Acceptée terminée");
    expect(container.textContent).toContain("Ancienne demande");
    expect(container.textContent).not.toContain("Acceptée mais signalée");
  });

  it("keeps validated sports results available to exploit and archives only rejected results", async () => {
    const candidate = (id: string, title: string, adminStatus: "pending" | "validated" | "rejected") => ({
      id,
      athleteId: "mila-benjak",
      athleteName: "Mila Benjak",
      sourceName: "Fixture",
      sourceUrl: `https://example.com/${id}`,
      articleUrl: `https://example.com/${id}`,
      title,
      excerpt: title,
      resultKind: "participation",
      publicationDate: "2026-10-25T00:00:00.000Z",
      eventDateFrom: "2026-10-25",
      eventDateTo: "2026-10-25",
      collectedAt: "2026-10-27T08:00:00.000Z",
      attributionStatus: "matched",
      attributionEvidence: ["Fixture"],
      verificationStatus: "unverified",
      adminStatus,
      supersedesCandidateId: null,
      version: 1,
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          candidate("11111111-1111-4111-8111-111111111111", "Résultat en attente", "pending"),
          candidate("22222222-2222-4222-8222-222222222222", "Résultat validé à exploiter", "validated"),
          candidate("33333333-3333-4333-8333-333333333333", "Résultat rejeté", "rejected"),
        ],
        swissBindings: [],
        iwwfBindings: [],
        safvBindings: [],
      }),
    })));
    await act(async () => {
      root.render(<SportsWatchAdminCard athletes={[]} />);
      await flush();
    });

    expect(container.textContent).toContain("Résultat en attente");
    expect(container.textContent).toContain("Résultat validé à exploiter");
    expect(container.textContent).not.toContain("Résultat rejeté");
    await clickButton(container, "Historique");
    expect(container.textContent).toContain("Résultat rejeté");
    expect(container.textContent).not.toContain("Résultat validé à exploiter");
  });
});
