import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const athleteCard = readFileSync(
  new URL("../components/athlete/AthleteNewsReportsCard.tsx", import.meta.url),
  "utf8",
);
const adminCard = readFileSync(
  new URL("../components/app-shell/AthleteNewsReportsAdminCard.tsx", import.meta.url),
  "utf8",
);
const workspaceLanding = readFileSync(
  new URL("../components/app-shell/WorkspaceLanding.tsx", import.meta.url),
  "utf8",
);

describe("athlete news report UI", () => {
  it("shows the requested athlete action, confirmation and own reports", () => {
    expect(athleteCard).toContain("J’ai une actu");
    expect(athleteCard).toContain("Actualité transmise à KLIQUE. Elle sera examinée avant publication.");
    expect(athleteCard).toContain("Mes signalements");
  });

  it("shows the Admin inbox, simple statuses and publication distinction", () => {
    expect(adminCard).toContain("Actualités Athlètes");
    expect(adminCard).toContain("Préparer un article");
    expect(adminCard).toContain("En préparation");
    expect(adminCard).toContain("pas qu’il a été publié");
  });

  it("keeps weekly and monthly dashboard blocks alongside the new inbox", () => {
    expect(workspaceLanding).toContain("<AthleteNewsReportsAdminCard athletes={athletes} />");
    expect(workspaceLanding).toContain("<WeeklyResponsesCockpit");
    expect(workspaceLanding).toContain("Réponses mensuelles");
  });
});
