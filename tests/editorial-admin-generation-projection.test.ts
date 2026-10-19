import { describe, expect, it, vi } from "vitest";

const readProjection = vi.hoisted(() => vi.fn());

vi.mock("@/services/context-intelligence/editorial-athlete-projection", () => ({
  readEditorialAthleteProjection: readProjection,
}));

import { buildContentGenerationRequest } from "@/services/content-intelligence/context-builder";

describe("Admin editorial generation Athlete projection", () => {
  it("builds model context only from the safe projection", async () => {
    readProjection.mockResolvedValue({
      id: "athlete-1",
      displayName: "Mila Martin",
      sport: "Football",
      club: "FC Lausanne",
      biography: "Biographie publique",
      communicationObjectives: ["Annoncer la sélection"],
      publishedFacts: ["Sélection annoncée"],
    });

    const { request } = await buildContentGenerationRequest({
      templateId: "interview",
      context: { mode: "contextual" },
      subject: {
        id: "athlete-1",
        type: "person",
        source: "crm",
        displayName: "Nom client falsifié",
        description: "Blessure privée",
        photoAvailable: false,
      },
      objective: { id: "interview", subtypeId: "portrait" },
      parameters: {
        language: "fr",
        toneId: "journalistic",
        questionCount: 5,
        formatId: "written",
        audienceId: "general",
        additionalContext: "",
        requiredTopics: [],
        avoidedTopics: [],
        contextIntelligence: {
          enabled: true,
          selectedConnectorIds: ["crm"],
          dateRange: { preset: "last_30_days", from: "2026-09-19", to: "2026-10-19" },
          sourcePreference: "official_and_reliable",
          searchDepth: "standard",
          selectedItemIds: [],
          manualEdits: [],
          selectedContextItems: [],
        },
      },
    }, {
      workspaceId: "workspace-1",
      role: "admin",
    });

    expect(readProjection).toHaveBeenCalledWith("athlete-1", { workspaceId: "workspace-1", role: "admin" });
    expect(request.context).toMatchObject({
      displayName: "Mila Martin",
      biography: "Biographie publique",
    });
    expect(JSON.stringify(request)).not.toContain("Blessure privée");
    expect(JSON.stringify(request)).not.toContain("Nom client falsifié");
  });
});
