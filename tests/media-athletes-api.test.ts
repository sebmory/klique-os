import { describe, expect, it, vi } from "vitest";
import { createMediaAthleteDirectoryHandlers } from "@/app/api/media/athletes/route";
import { createMediaAthleteProfileHandlers } from "@/app/api/media/athletes/[athleteId]/route";

const activeMediaAccess = {
  isMedia: true,
  isActive: true,
  workspaceId: "workspace-1",
  mediaId: "media-1",
};

const publicProfile = {
  name: "Mila Martin",
  sport: "Football",
  club: "FC Lausanne",
  age: 26,
  nationality: "Suisse",
  position: "Attaquante",
  palmares: "Championne régionale",
  shortTermGoals: "Intégrer la sélection",
  longTermGoals: "Passer professionnelle",
  city: "Lausanne",
  country: "Suisse",
  portraitUrl: "https://images.example/mila.jpg",
  presentation: "Présentation publique",
  journey: "Parcours public",
  goals: "Objectifs publics",
  distinctions: [],
  socialLinks: [
    { label: "Instagram", url: "@mila.public" },
    { label: "Site", url: "https://private.example" },
  ],
};

describe("media athletes API", () => {
  it("preserves Aggee Wenzi canonical athlete id from Google Sheets", async () => {
    const response = await createMediaAthleteDirectoryHandlers({
      getAccess: vi.fn().mockResolvedValue(activeMediaAccess),
      listAthletes: vi.fn().mockResolvedValue([{
        athleteId: "aggee-wenzi",
        name: "Aggee Wenzi",
        sport: "Football",
        club: "FC Breitenrain",
        city: "",
        country: "Suisse",
        portraitUrl: "",
        presentation: "",
      }]),
    }).GET(new Request("http://localhost/api/media/athletes"));

    const payload = await response.json();

    expect(payload.athletes[0]).toMatchObject({
      athleteId: "aggee-wenzi",
      name: "Aggee Wenzi",
    });
  });

  it("returns only public directory fields for an active linked media access", async () => {
    const handlers = createMediaAthleteDirectoryHandlers({
      getAccess: vi.fn().mockResolvedValue(activeMediaAccess),
      listAthletes: vi.fn().mockResolvedValue([{
        athleteId: "athlete-1",
        name: "Mila Martin",
        sport: "Football",
        club: "FC Lausanne",
        city: "Lausanne",
        country: "Suisse",
        portraitUrl: "https://images.example/mila.jpg",
        presentation: "Présentation publique",
        email: "private@example.com",
        phone: "+41 79 000 00 00",
      }]),
    });

    const response = await handlers.GET(new Request("http://localhost/api/media/athletes"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.athletes).toEqual([{
      athleteId: "athlete-1",
      name: "Mila Martin",
      sport: "Football",
      club: "FC Lausanne",
      portraitUrl: "https://images.example/mila.jpg",
    }]);
    expect(JSON.stringify(payload)).not.toContain("private@example.com");
    expect(JSON.stringify(payload)).not.toContain("+41 79");
  });

  it.each([
    { ...activeMediaAccess, isMedia: false },
    { ...activeMediaAccess, isActive: false },
    { ...activeMediaAccess, workspaceId: null },
    { ...activeMediaAccess, mediaId: null },
  ])("refuses an incomplete media access", async (access) => {
    const listAthletes = vi.fn();
    const response = await createMediaAthleteDirectoryHandlers({
      getAccess: vi.fn().mockResolvedValue(access),
      listAthletes,
    }).GET(new Request("http://localhost/api/media/athletes"));

    expect(response.status).toBe(403);
    expect(listAthletes).not.toHaveBeenCalled();
  });

  it("returns the requested sporting profile and only public Instagram", async () => {
    const getAthlete = vi.fn().mockResolvedValue({
      ...publicProfile,
      email: "private@example.com",
      phone: "+41 79 000 00 00",
      birthDate: "2000-01-01",
    });
    const response = await createMediaAthleteProfileHandlers({
      getAccess: vi.fn().mockResolvedValue(activeMediaAccess),
      getAthlete,
    }).GET(
      new Request("http://localhost/api/media/athletes/athlete-1"),
      { params: Promise.resolve({ athleteId: " athlete-1 " }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getAthlete).toHaveBeenCalledWith("athlete-1");
    expect(payload.athlete).toMatchObject({
      name: "Mila Martin",
      age: 26,
      journey: "Parcours public",
      goals: "Objectifs publics",
      palmares: "Championne régionale",
      instagram: "@mila.public",
    });
    expect(payload.athlete).not.toHaveProperty("email");
    expect(payload.athlete).not.toHaveProperty("phone");
    expect(payload.athlete).not.toHaveProperty("birthDate");
    expect(payload.athlete).not.toHaveProperty("socialLinks");
    expect(payload.athlete).not.toHaveProperty("city");
  });

  it("returns 404 without exposing a non-public athlete", async () => {
    const response = await createMediaAthleteProfileHandlers({
      getAccess: vi.fn().mockResolvedValue(activeMediaAccess),
      getAthlete: vi.fn().mockResolvedValue(null),
    }).GET(
      new Request("http://localhost/api/media/athletes/hidden"),
      { params: Promise.resolve({ athleteId: "hidden" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Athlète public introuvable ou non visible." });
  });
});