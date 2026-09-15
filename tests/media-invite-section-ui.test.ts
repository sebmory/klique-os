// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MediaInviteSection } from "@/components/settings/MediaInviteSection";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const mediaIdWithoutInvitation = "49c345aa-fb6e-46e8-83ef-1e07d7b69192";
const mediaIdInvited = "927f53ef-6d5e-46cc-8891-411bd904f4fc";
const mediaIdActive = "13965f76-27a7-4f25-b446-3c21d0cfc965";
const mediaIdInactive = "01951683-4a3d-4fde-9be2-82174498df95";

const accessResponse = {
  ok: true,
  status: 200,
  json: async () => ({ permissions: { isAdmin: true, isActive: true } }),
};

const organizationsResponse = {
  ok: true,
  status: 200,
  json: async () => ({
    organizations: [
      { id: mediaIdWithoutInvitation, name: "Le Journal", type: "media_outlet", contactEmail: "contact@journal.example", website: null, status: "active" },
      { id: mediaIdInvited, name: "Agence Sport", type: "agency", contactEmail: "desk@agence.example", website: null, status: "active" },
      { id: mediaIdActive, name: "Camille Reporter", type: "journalist", contactEmail: "camille@example.com", website: null, status: "active" },
      { id: mediaIdInactive, name: "Ancien Média", type: "other", contactEmail: "archive@example.com", website: null, status: "inactive" },
    ],
    invitations: [
      { invitationId: "inv-pending", mediaId: mediaIdInvited, email: "desk@agence.example", invitationStatus: "invited", accessStatus: null, createdAt: "2026-09-15T08:00:00.000Z" },
      { invitationId: "inv-active", mediaId: mediaIdActive, email: "camille@example.com", invitationStatus: "accepted", accessStatus: "active", createdAt: "2026-09-14T08:00:00.000Z" },
      { invitationId: "inv-legacy", mediaId: null, email: "legacy@example.com", invitationStatus: "invited", accessStatus: null, createdAt: "2026-08-18T08:00:00.000Z" },
    ],
  }),
};

const installInitialFetches = () => {
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/clerk/access") return Promise.resolve(accessResponse);
    if (url === "/api/admin/media-organizations") return Promise.resolve(organizationsResponse);
    throw new Error(`Unexpected fetch: ${url}`);
  });
};

const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(MediaInviteSection));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const setInputValue = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const setSelectValue = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const inputInLabel = (label: string): HTMLInputElement => {
  const element = [...container.querySelectorAll("label")].find((candidate) => candidate.textContent?.includes(label));
  const input = element?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error(`Input not found: ${label}`);
  return input;
};

const formWithHeading = (heading: string): HTMLFormElement => {
  const form = [...container.querySelectorAll("form")].find((candidate) => candidate.querySelector("h3")?.textContent === heading);
  if (!(form instanceof HTMLFormElement)) throw new Error(`Form not found: ${heading}`);
  return form;
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe("MediaInviteSection", () => {
  it("shows an accessible loading state", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    await mount();

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement des accès médias");
  });

  it("loads organizations and displays no-invitation, invited, active, inactive and legacy states", async () => {
    installInitialFetches();
    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/media-organizations", {
      credentials: "include",
      cache: "no-store",
    });
    expect(container.textContent).toContain("Le Journal");
    expect(container.textContent).toContain("Sans invitation");
    expect(container.textContent).toContain("Invitée");
    expect(container.textContent).toContain("Active");
    expect(container.textContent).toContain("Organisation inactive");
    expect(container.textContent).toContain("legacy@example.com");
    expect(container.textContent).toContain("Organisation non liée");
    expect((container.querySelector(`input[value="${mediaIdInactive}"]`) as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('input[value="inv-legacy"]')).toBeNull();
  });

  it("requires selection, prefills an editable email and sends email with mediaId", async () => {
    installInitialFetches();
    await mount();

    const invitationForm = container.querySelectorAll("form")[0];
    await act(async () => invitationForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Sélectionnez une organisation Média active");

    const radio = container.querySelector(`input[value="${mediaIdWithoutInvitation}"]`) as HTMLInputElement;
    await act(async () => radio.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const invitationEmail = inputInLabel("Adresse email");
    expect(invitationEmail.value).toBe("contact@journal.example");
    await setInputValue(invitationEmail, "editor@journal.example");

    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/media/invite" && options?.method === "POST") {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ invitationId: "inv-new" }) });
      }
      if (url === "/api/clerk/access") return Promise.resolve(accessResponse);
      return Promise.resolve(organizationsResponse);
    });
    await act(async () => {
      invitationForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const invitationCall = fetchMock.mock.calls.find(([url]) => url === "/api/media/invite");
    expect(JSON.parse(String(invitationCall?.[1]?.body))).toEqual({
      email: "editor@journal.example",
      mediaId: mediaIdWithoutInvitation,
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Invitation envoyée");
  });

  it("creates an organization, selects it and prefills its contact email", async () => {
    installInitialFetches();
    await mount();

    await setInputValue(inputInLabel("Nom"), "Nouveau Média");
    await setInputValue(inputInLabel("E-mail de contact"), "hello@nouveau.example");
    await setInputValue(inputInLabel("Site web"), "https://nouveau.example");
    const creationForm = container.querySelectorAll("form")[1];
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/admin/media-organizations" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            organization: {
              id: "72f40ef7-b547-436c-bbe1-29c3a2588784",
              name: "Nouveau Média",
              type: "media_outlet",
              contactEmail: "hello@nouveau.example",
              website: "https://nouveau.example/",
              status: "active",
            },
          }),
        });
      }
      if (url === "/api/clerk/access") return Promise.resolve(accessResponse);
      return Promise.resolve(organizationsResponse);
    });
    await act(async () => {
      creationForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const creationCall = fetchMock.mock.calls.find(([url, options]) => url === "/api/admin/media-organizations" && options?.method === "POST");
    expect(JSON.parse(String(creationCall?.[1]?.body))).toEqual({
      name: "Nouveau Média",
      type: "media_outlet",
      contactEmail: "hello@nouveau.example",
      website: "https://nouveau.example",
    });
    expect(inputInLabel("Adresse email").value).toBe("hello@nouveau.example");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("créée et sélectionnée");
  });

  it("links an existing access with the selected organization and normalized email", async () => {
    installInitialFetches();
    await mount();

    const linkForm = formWithHeading("Rattacher un accès existant");
    const organizationSelect = linkForm.querySelector("select") as HTMLSelectElement;
    await setSelectValue(organizationSelect, mediaIdWithoutInvitation);
    await setInputValue(inputInLabel("E-mail de l’accès existant"), " Reporter@Journal.Example ");
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/admin/media-organizations" && options?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ linkedAccess: { email: "reporter@journal.example", mediaId: mediaIdWithoutInvitation } }),
        });
      }
      if (url === "/api/clerk/access") return Promise.resolve(accessResponse);
      return Promise.resolve(organizationsResponse);
    });

    await act(async () => {
      linkForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const linkCall = fetchMock.mock.calls.find(([url, options]) => url === "/api/admin/media-organizations" && options?.method === "PATCH");
    expect(JSON.parse(String(linkCall?.[1]?.body))).toEqual({
      mediaId: mediaIdWithoutInvitation,
      email: "reporter@journal.example",
    });
    expect(linkForm.querySelector('[role="status"]')?.textContent).toContain("Accès reporter@journal.example rattaché à Le Journal");
  });

  it("shows the instruction returned for a pending legacy invitation", async () => {
    installInitialFetches();
    await mount();

    const linkForm = formWithHeading("Rattacher un accès existant");
    await setSelectValue(linkForm.querySelector("select") as HTMLSelectElement, mediaIdWithoutInvitation);
    await setInputValue(inputInLabel("E-mail de l’accès existant"), "legacy@example.com");
    const instruction = "Une invitation ancienne est encore en attente. Envoyez une nouvelle invitation liée à l’organisation.";
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/admin/media-organizations" && options?.method === "PATCH") {
        return Promise.resolve({ ok: false, status: 409, json: async () => ({ error: instruction }) });
      }
      if (url === "/api/clerk/access") return Promise.resolve(accessResponse);
      return Promise.resolve(organizationsResponse);
    });

    await act(async () => {
      linkForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(linkForm.querySelector('[role="alert"]')?.textContent).toBe(instruction);
  });

  it("shows organization loading errors accessibly", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/clerk/access") return Promise.resolve(accessResponse);
      return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "Chargement indisponible." }) });
    });
    await mount();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Chargement indisponible.");
  });
});