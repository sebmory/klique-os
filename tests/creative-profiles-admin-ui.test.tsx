// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATIVE_DEACTIVATION_CONFIRMATION,
  CreativeProfilesAdminPanel,
} from "@/components/creatives/CreativeProfilesAdminPanel";
import { CreativeApplicationsAdminScreen } from "@/components/creatives/CreativeApplicationsAdminScreen";
import type { CreativeProfile } from "@/types/creative";

const creativeId = "11111111-1111-4111-8111-111111111111";

const profile = (overrides: Partial<CreativeProfile> = {}): CreativeProfile => ({
  id: creativeId,
  workspaceId: "workspace-session",
  provenance: "form_application",
  applicationId: "22222222-2222-4222-8222-222222222222",
  displayName: "Camille Martin",
  creativeType: "both",
  contactEmail: "camille@example.com",
  phone: "+41 79 000 00 00",
  websiteUrl: "https://studio.example.com/",
  portfolioUrl: "https://portfolio.example.com/",
  instagram: "@camille",
  city: "Lausanne",
  country: "Suisse",
  coverageAreas: ["Vaud", "Fribourg"],
  specialties: ["Football", "Basketball"],
  bio: "Créatrice spécialisée dans le sport.",
  status: "active",
  sourceRow: 7,
  approvedByClerkUserId: "user-admin",
  approvedAt: "2026-10-09T15:00:00.000Z",
  createdAt: "2026-10-09T15:00:00.000Z",
  updatedAt: "2026-10-09T15:00:00.000Z",
  ...overrides,
});

const response = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as Response;

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mountPanel = async () => {
  await act(async () => root.render(<CreativeProfilesAdminPanel />));
  await flush();
};

const click = async (element: Element) => {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await flush();
};

const buttonByText = (text: string) => [...container.querySelectorAll("button")]
  .find((button) => button.textContent?.includes(text));

const setControl = async (label: string, value: string) => {
  const labelElement = [...container.querySelectorAll("label")]
    .find((candidate) => candidate.textContent?.includes(label));
  const control = labelElement?.querySelector("input, select, textarea") as
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const prototype = control instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  await act(async () => control.dispatchEvent(new Event(
    control instanceof HTMLSelectElement ? "change" : "input",
    { bubbles: true },
  )));
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Creative profiles Admin UI", () => {
  it("exposes the Fiches creatives tab from the CRM screen", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ applications: [] }))
      .mockResolvedValueOnce(response({ profiles: [profile()] }));
    await act(async () => root.render(<CreativeApplicationsAdminScreen />));
    await flush();

    const profilesTab = buttonByText("Fiches créatives")!;
    expect(profilesTab.getAttribute("role")).toBe("tab");
    await click(profilesTab);

    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/creatives");
    expect(container.textContent).toContain("Fiches créatives canoniques");
    expect(container.textContent).toContain("Camille Martin");
  });

  it("shows accessible loading, error and empty states", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await mountPanel();
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain("Chargement des fiches créatives");

    await act(async () => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockResolvedValueOnce(response({ error: "Service indisponible." }, 500));
    await mountPanel();
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("Service indisponible.");

    await act(async () => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockResolvedValueOnce(response({ profiles: [] }));
    await mountPanel();
    expect(container.textContent).toContain("Aucune fiche créative canonique.");
    expect(buttonByText("Créer une fiche")).toBeDefined();
  });

  it("creates a manual profile with a strict business payload, locks and refreshes", async () => {
    fetchMock.mockResolvedValueOnce(response({ profiles: [] }));
    await mountPanel();
    await click(buttonByText("Créer une fiche")!);

    expect(container.querySelector('form[aria-label="Créer une fiche créative"]')).not.toBeNull();
    await setControl("Nom affiché", "Studio Léman");
    await setControl("Type créatif", "videographer");
    await setControl("E-mail", "studio@example.com");
    await setControl("Statut initial", "active");
    await setControl("Zones couvertes", "Vaud, Genève");
    await setControl("Spécialités", "Football, Basketball");

    let resolvePost!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolvePost = resolve;
    }));
    const form = container.querySelector('form[aria-label="Créer une fiche créative"]')!;
    await act(async () => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/creatives");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body).toMatchObject({
      displayName: "Studio Léman",
      creativeType: "videographer",
      contactEmail: "studio@example.com",
      status: "active",
      coverageAreas: ["Vaud", "Genève"],
      specialties: ["Football", "Basketball"],
    });
    for (const forbidden of [
      "id",
      "workspaceId",
      "provenance",
      "applicationId",
      "sourceRow",
      "approvedByClerkUserId",
      "approvedAt",
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
    expect((container.querySelector('button[aria-busy="true"]') as HTMLButtonElement).disabled)
      .toBe(true);

    fetchMock.mockResolvedValueOnce(response({
      profiles: [profile({
        provenance: "admin_manual",
        applicationId: null,
        sourceRow: null,
        displayName: "Studio Léman",
      })],
    }));
    await act(async () => resolvePost(response({
      profile: profile({
        provenance: "admin_manual",
        applicationId: null,
        sourceRow: null,
        displayName: "Studio Léman",
      }),
    }, 201)));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("Fiche créative créée.");
    expect(container.textContent).toContain("Studio Léman");
  });

  it("shows canonical profile data without exposing editable provenance or audit controls", async () => {
    fetchMock.mockResolvedValueOnce(response({ profiles: [profile()] }));
    await mountPanel();

    for (const value of [
      "Camille Martin",
      "Photographe et vidéaste",
      "camille@example.com",
      "Vaud, Fribourg",
      "Football, Basketball",
      "Créatrice spécialisée dans le sport.",
    ]) {
      expect(container.textContent).toContain(value);
    }
    await click(buttonByText("Modifier")!);
    expect(container.querySelector('form[aria-label^="Modifier la fiche"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Application ID");
    expect(container.textContent).not.toContain("Ligne source");
    expect(container.querySelector('input[name="applicationId"]')).toBeNull();
  });

  it("edits allowed fields, locks saving and refreshes without immutable fields", async () => {
    fetchMock.mockResolvedValueOnce(response({ profiles: [profile()] }));
    await mountPanel();
    await click(buttonByText("Modifier")!);
    await setControl("Nom affiché", "Camille Studio");
    await setControl("Type créatif", "photographer");
    await setControl("Zones couvertes", "Vaud, Genève");

    let resolvePatch!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    }));
    const form = container.querySelector('form[aria-label^="Modifier la fiche"]')!;
    await act(async () => form.dispatchEvent(new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
    })));
    await flush();

    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body).toMatchObject({
      displayName: "Camille Studio",
      creativeType: "photographer",
      coverageAreas: ["Vaud", "Genève"],
    });
    for (const immutable of [
      "applicationId",
      "provenance",
      "sourceRow",
      "approvedByClerkUserId",
      "approvedAt",
      "createdAt",
      "updatedAt",
    ]) {
      expect(body).not.toHaveProperty(immutable);
    }
    expect((container.querySelector('button[aria-busy="true"]') as HTMLButtonElement).disabled)
      .toBe(true);

    fetchMock.mockResolvedValueOnce(response({
      profiles: [profile({ displayName: "Camille Studio", creativeType: "photographer" })],
    }));
    await act(async () => resolvePatch(response({
      profile: profile({ displayName: "Camille Studio", creativeType: "photographer" }),
    })));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("Fiche créative enregistrée.");
  });

  it("confirms deactivation, prevents duplicate sends and refreshes", async () => {
    fetchMock.mockResolvedValueOnce(response({ profiles: [profile()] }));
    await mountPanel();
    let resolvePatch!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    }));
    const deactivate = buttonByText("Désactiver")!;

    await act(async () => {
      deactivate.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      deactivate.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(window.confirm).toHaveBeenCalledWith(CREATIVE_DEACTIVATION_CONFIRMATION);
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      status: "inactive",
    });
    expect((container.querySelector('button[aria-busy="true"]') as HTMLButtonElement).disabled)
      .toBe(true);

    fetchMock.mockResolvedValueOnce(response({ profiles: [profile({ status: "inactive" })] }));
    await act(async () => resolvePatch(response({ profile: profile({ status: "inactive" }) })));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("Fiche créative désactivée.");
  });

  it("does not deactivate when confirmation is cancelled and activates without confirmation", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    fetchMock.mockResolvedValueOnce(response({ profiles: [profile()] }));
    await mountPanel();
    await click(buttonByText("Désactiver")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock
      .mockResolvedValueOnce(response({ profiles: [profile({ status: "inactive" })] }))
      .mockResolvedValueOnce(response({ profile: profile({ status: "active" }) }))
      .mockResolvedValueOnce(response({ profiles: [profile({ status: "active" })] }));
    await mountPanel();
    await click(buttonByText("Activer")!);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls.at(-2)?.[1]?.body))).toEqual({
      status: "active",
    });
  });
});
