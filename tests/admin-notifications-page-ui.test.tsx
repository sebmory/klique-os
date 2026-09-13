// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminNotificationsPage from "@/app/settings/notifications/page";

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const jsonResponse = (payload: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
}) as unknown as Response;

const setControlValue = async (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
};

const submitForm = async () => {
  const form = container.querySelector("form");
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
};

const fillValidForm = async () => {
  await setControlValue(container.querySelector('input[type="text"]') as HTMLInputElement, " Information importante ");
  await setControlValue(container.querySelector("textarea") as HTMLTextAreaElement, " Consultez les détails. ");
  await setControlValue(container.querySelector('input[placeholder="/today"]') as HTMLInputElement, " /crm ");
  await setControlValue(container.querySelector("select") as HTMLSelectElement, "partner_expert");
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AdminNotificationsPage />);
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("Admin notifications page", () => {
  it("posts a manual announcement and displays its recipient count", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, recipientCount: 3 }, 201));
    await fillValidForm();

    await submitForm();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/notifications", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Information importante",
        body: "Consultez les détails.",
        actionHref: "/crm",
        recipientRoles: ["partner_expert"],
      }),
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Annonce envoyée à 3 destinataires.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("sends all recipients and omits an empty optional message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, recipientCount: 1 }, 201));
    await setControlValue(container.querySelector('input[type="text"]') as HTMLInputElement, "Annonce");
    await setControlValue(container.querySelector('input[placeholder="/today"]') as HTMLInputElement, "/today");

    await submitForm();

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      title: "Annonce",
      actionHref: "/today",
      recipientRoles: ["all"],
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Annonce envoyée à 1 destinataire.");
  });

  it("shows client validation errors with alert semantics without posting", async () => {
    await submitForm();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Le titre est obligatoire.");
    expect(fetchMock).not.toHaveBeenCalled();

    await setControlValue(container.querySelector('input[type="text"]') as HTMLInputElement, "Annonce");
    await setControlValue(container.querySelector('input[placeholder="/today"]') as HTMLInputElement, "https://example.com");
    await submitForm();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Le lien doit être un chemin interne commençant par /.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("displays API errors with alert semantics", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, message: "Accès refusé." }, 403));
    await fillValidForm();

    await submitForm();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Accès refusé.");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("disables the submit button while sending", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    await fillValidForm();

    await submitForm();

    const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Envoi en cours…");

    await act(async () => {
      resolveRequest?.(jsonResponse({ ok: true, recipientCount: 2 }, 201));
      await Promise.resolve();
    });
    expect(button.disabled).toBe(false);
  });
});