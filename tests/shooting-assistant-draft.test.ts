import { describe, expect, it } from "vitest";

import * as shootingAssistantModule from "../app/shooting/assistant/page";

type DraftPayload = {
  mode: string;
  athleteName: string;
  athleteSport: string;
  photographyDomain: string;
  shootingType: string;
  objective: string;
  location: string;
  context: string;
  constraints: string;
};

type ShootingDraft = {
  preparation: string[];
  shotlist: string[];
  poses: string[];
  strategy: string[];
  installation: string[];
};

const getBuildDraft = (): ((payload: DraftPayload) => ShootingDraft) => {
  const candidate = (shootingAssistantModule as unknown as { buildDraft?: unknown }).buildDraft;
  if (typeof candidate !== "function") {
    throw new Error("buildDraft is not available");
  }
  return candidate as (payload: DraftPayload) => ShootingDraft;
};

describe("shooting assistant draft generation", () => {
  it("produces different recommendations for different combinations of parameters", () => {
    const buildDraft = getBuildDraft();

    const studioDraft = buildDraft({
      mode: "free",
      athleteName: "Milo",
      athleteSport: "Football",
      photographyDomain: "Sport",
      shootingType: "Portrait studio",
      objective: "Réseaux sociaux",
      location: "Studio",
      context: "Campagne",
      constraints: "Lumière douce, 30 minutes, fond blanc",
    });

    const stadeDraft = buildDraft({
      mode: "free",
      athleteName: "Milo",
      athleteSport: "Football",
      photographyDomain: "Sport",
      shootingType: "Action / performance",
      objective: "Réseaux sociaux",
      location: "Stade",
      context: "Campagne",
      constraints: "Lumière naturelle, 45 minutes, terrain utilisé",
    });

    const studioPreparation = studioDraft.preparation.join("\n");
    const stadePreparation = stadeDraft.preparation.join("\n");
    const studioShotlist = studioDraft.shotlist.join("\n");
    const stadeShotlist = stadeDraft.shotlist.join("\n");
    const studioPoses = studioDraft.poses.join("\n");
    const stadePoses = stadeDraft.poses.join("\n");

    expect(studioPreparation).not.toEqual(stadePreparation);
    expect(studioShotlist).not.toEqual(stadeShotlist);
    expect(studioPoses).not.toEqual(stadePoses);
  });

  it("makes lifestyle guidance more natural and portrait-sportive guidance more graphic", () => {
    const buildDraft = getBuildDraft();

    const lifestyleDraft = buildDraft({
      mode: "free",
      athleteName: "Milo",
      athleteSport: "Football",
      photographyDomain: "Sport",
      shootingType: "Lifestyle",
      objective: "Réseaux sociaux",
      location: "Studio",
      context: "Campagne",
      constraints: "Lumière naturelle, 30 minutes, tenue simple",
    });

    const portraitDraft = buildDraft({
      mode: "free",
      athleteName: "Milo",
      athleteSport: "Football",
      photographyDomain: "Sport",
      shootingType: "Portrait sportif",
      objective: "Réseaux sociaux",
      location: "Studio",
      context: "Campagne",
      constraints: "Lumière douce, 30 minutes, fond blanc",
    });

    const lifestyleText = [lifestyleDraft.strategy.join("\n"), lifestyleDraft.installation.join("\n"), lifestyleDraft.shotlist.join("\n"), lifestyleDraft.poses.join("\n")].join("\n");
    const portraitText = [portraitDraft.strategy.join("\n"), portraitDraft.installation.join("\n"), portraitDraft.shotlist.join("\n"), portraitDraft.poses.join("\n")].join("\n");

    expect(lifestyleText).toContain("spontanéité");
    expect(lifestyleText).toContain("marche");
    expect(lifestyleText).toContain("regard hors caméra");
    expect(portraitText).toContain("graphique");
    expect(portraitText).toContain("puissante");
  });
});
