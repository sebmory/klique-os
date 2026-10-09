// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATIVE_APPROVAL_CONFIRMATION,
  CreativeApplicationsAdminScreen,
} from "@/components/creatives/CreativeApplicationsAdminScreen";
import { mainNavigation } from "@/components/app-shell/data";
import type { CreativeApplication } from "@/lib/creatives/applications-sheet";

const applicationId = "11111111-1111-4111-8111-111111111111";

const fields: CreativeApplication["fields"] = {
  submittedAt: "2026-10-01T10:00:00.000Z",
  fullName: "Camille Martin",
  email: "camille@example.com",
  phone: "+41 79 000 00 00",
  birthYear: "1995",
  city: "Lausanne",
  region: "Vaud",
  languages: "Français, allemand",
  profile: "Photographe et vidéaste",
  experienceLevel: "Confirmé",
  practiceDuration: "5 ans",
  background: "Parcours dans le sport",
  sportsExperience: "Oui",
  previousProjectTypes: "Football",
  portfolioUrl: "portfolio.example.com",
  websiteUrl: "https://studio.example.com",
  instagram: "https://instagram.com/camille",
  otherReferences: "",
  sportsToCover: "Football, Basketball",
  interestedMissionTypes: "Reportage",
  accreditationsOrContacts: "Oui",
  accreditationDetails: "Club local",
  travelRegions: "Vaud, Fribourg",
  drivingLicense: "Oui",
  vehicleAccess: "Oui",
  usualAvailability: "Week-end",
  missionNotice: "48 heures",
  equipment: "Boîtier professionnel",
  software: "Lightroom, Premiere Pro",
  handlesPostproduction: "Oui",
  fastDelivery: "Oui",
  liabilityInsurance: "Oui",
  motivation: "Rejoindre KLIQUE",
  collaborationExpectations: "Collaborer",
  availableForUnpaid: "Non",
  interestedInPaidMandates: "Oui",
  interestedInPartTime: "Non",
  canInvoice: "Oui",
  specialConditions: "",
  missionCommitment: "Accepté",
  currentCollaborationNature: "Ponctuelle",
  contentUsage: "Accepté",
  dataProtection: "Accepté",
  contactAuthorization: "Accepté",
  additionalNotes: "Disponible rapidement",
};

const application = (
  status: CreativeApplication["moderationStatus"] = "pending",
): CreativeApplication => ({
  applicationId,
  sourceRow: 7,
  fields,
  moderationStatus: status,
  creativeId: status === "approved"
    ? "22222222-2222-4222-8222-222222222222"
    : null,
  moderatedAt: status === "pending" ? null : "2026-10-02T10:00:00.000Z",
  moderatedBy: status === "pending" ? null : "user-admin",
  moderationNotes: status === "rejected" ? "Portfolio insuffisant" : null,
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

const mount = async () => {
  await act(async () => root.render(<CreativeApplicationsAdminScreen />));
  await flush();
};

const click = async (element: Element) => {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await flush();
};

const buttonByText = (text: string) => [...container.querySelectorAll("button")]
  .find((button) => button.textContent?.includes(text));

const setTextarea = async (value: string) => {
  const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
    textarea,
    value,
  );
  await act(async () => textarea.dispatchEvent(new Event("input", { bubbles: true })));
  await flush();
  return textarea;
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

describe("Creative applications Admin UI", () => {
  it("adds the Admin Creatives navigation entry", () => {
    expect(mainNavigation).toContainEqual({
      id: "creatives",
      label: "Créatifs",
      href: "/crm/creatifs",
      icon: "image",
    });
  });

  it("shows accessible loading, error and empty states", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await mount();
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain("Chargement des candidatures créatives");

    await act(async () => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockResolvedValueOnce(response({ error: "Service temporairement indisponible." }, 500));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("Service temporairement indisponible.");

    await act(async () => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockResolvedValueOnce(response({ applications: [] }));
    await mount();
    expect(container.textContent).toContain("Aucune candidature à valider.");
  });

  it("shows useful application data, portfolio links and Admin-only personal details", async () => {
    fetchMock.mockResolvedValueOnce(response({ applications: [application()] }));
    await mount();

    for (const value of [
      "Camille Martin",
      "Photographe et vidéaste",
      "Vaud, Fribourg",
      "Football, Basketball",
      "Confirmé",
      "Week-end",
      "Données personnelles · accès Administrateur uniquement",
    ]) {
      expect(container.textContent).toContain(value);
    }
    expect(container.querySelector('a[href="https://portfolio.example.com/"]')).not.toBeNull();

    const details = container.querySelector("details") as HTMLDetailsElement;
    details.open = true;
    expect(details.textContent).toContain("camille@example.com");
    expect(details.textContent).toContain("+41 79 000 00 00");
  });

  it("filters pending, approved and rejected applications with explicit tabs", async () => {
    fetchMock.mockResolvedValueOnce(response({
      applications: [
        application("pending"),
        { ...application("approved"), applicationId: "33333333-3333-4333-8333-333333333333", fields: { ...fields, fullName: "Alex Vidéo" } },
        { ...application("rejected"), applicationId: "44444444-4444-4444-8444-444444444444", fields: { ...fields, fullName: "Noa Photo" } },
      ],
    }));
    await mount();

    expect(container.textContent).toContain("Camille Martin");
    expect(container.textContent).not.toContain("Alex Vidéo");

    await click(buttonByText("Approuvées")!);
    expect(container.textContent).toContain("Alex Vidéo");
    expect(container.textContent).not.toContain("Camille Martin");

    await click(buttonByText("Refusées")!);
    expect(container.textContent).toContain("Noa Photo");
  });

  it("asks for confirmation, locks approval and refreshes after success", async () => {
    fetchMock.mockResolvedValueOnce(response({ applications: [application()] }));
    await mount();
    let resolveApproval!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolveApproval = resolve;
    }));
    const approve = buttonByText("Approuver")!;

    await act(async () => {
      approve.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      approve.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(window.confirm).toHaveBeenCalledWith(CREATIVE_APPROVAL_CONFIRMATION);
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain(`/${applicationId}/approve`);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}" });
    expect((container.querySelector('button[aria-busy="true"]') as HTMLButtonElement).disabled)
      .toBe(true);

    fetchMock.mockResolvedValueOnce(response({ applications: [] }));
    await act(async () => resolveApproval(response({ alreadyApproved: false })));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("Candidature approuvée et fiche canonique créée.");
  });

  it("does not approve when confirmation is cancelled", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    fetchMock.mockResolvedValueOnce(response({ applications: [application()] }));
    await mount();

    await click(buttonByText("Approuver")!);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires a rejection reason, sends it, locks actions and refreshes", async () => {
    fetchMock.mockResolvedValueOnce(response({ applications: [application()] }));
    await mount();
    await click(buttonByText("Refuser")!);

    const form = container.querySelector('form[aria-label^="Refuser la candidature"]')!;
    await act(async () => form.dispatchEvent(new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
    })));
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("Le motif du refus est obligatoire.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await setTextarea("Portfolio insuffisant");
    let resolveRejection!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolveRejection = resolve;
    }));
    await act(async () => form.dispatchEvent(new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
    })));
    await flush();

    expect(fetchMock.mock.calls[1][0]).toContain(`/${applicationId}/reject`);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      reason: "Portfolio insuffisant",
    });
    expect((container.querySelector('button[aria-busy="true"]') as HTMLButtonElement).disabled)
      .toBe(true);

    fetchMock.mockResolvedValueOnce(response({ applications: [] }));
    await act(async () => resolveRejection(response({ alreadyRejected: false })));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("Candidature refusée.");
  });

  it("shows safe API action errors", async () => {
    fetchMock.mockResolvedValueOnce(response({ applications: [application()] }));
    await mount();
    fetchMock.mockResolvedValueOnce(response({
      error: "État de candidature incohérent.",
    }, 409));

    await click(buttonByText("Approuver")!);

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("État de candidature incohérent.");
    expect(container.textContent).not.toContain("credential");
  });
});
