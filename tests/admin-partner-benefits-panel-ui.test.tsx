// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPartnerBenefitsPanel } from "@/components/ecosystem/AdminPartnerBenefitsPanel";

const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";
const benefits = [
  {
    id: "a4ed0d44-36d6-48e3-b399-28f6ac9e2538",
    workspaceId: "klique-os",
    partnerId,
    title: "Bilan unique",
    details: "Une séance personnalisée.",
    usagePolicy: "once_lifetime",
    validFrom: "2026-10-01T00:00:00.000Z",
    expiresAt: "2027-10-01T00:00:00.000Z",
    status: "active",
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
  },
  {
    id: "bc38cd69-3112-4273-9ba5-86d9ef6e91ba",
    workspaceId: "klique-os",
    partnerId,
    title: "Session annuelle",
    details: "Une fois durant l’adhésion.",
    usagePolicy: "once_per_membership",
    validFrom: "2026-10-01T00:00:00.000Z",
    expiresAt: null,
    status: "active",
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
  },
  {
    id: "dde28b59-f093-42ab-9786-a7fd6b6e84fe",
    workspaceId: "klique-os",
    partnerId,
    title: "Accès libre",
    details: "Sans limite d’utilisation.",
    usagePolicy: "unlimited",
    validFrom: "2026-10-01T00:00:00.000Z",
    expiresAt: null,
    status: "inactive",
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
  },
] as const;

const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const response = (payload: Record<string, unknown>, ok = true) => ({ ok, json: async () => payload });
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};
const clickByLabel = async (label: string) => {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    ?? [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label));
  expect(button).toBeTruthy();
  await act(async () => button?.click());
};
const setControl = async (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
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

describe("AdminPartnerBenefitsPanel", () => {
  it("lists policies, statuses and optional expiry through the Admin API", async () => {
    fetchMock.mockResolvedValue(response({ benefits }));

    await act(async () => root.render(createElement(AdminPartnerBenefitsPanel, { partnerId })));
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/partner-benefits?partnerId=${partnerId}`,
      { credentials: "include", cache: "no-store" },
    );
    expect(container.textContent).toContain("Utilisation unique");
    expect(container.textContent).toContain("Une fois par période d’adhésion");
    expect(container.textContent).toContain("Utilisation illimitée");
    expect(container.textContent).toContain("Sans échéance");
    expect(container.textContent).toContain("Actif");
    expect(container.textContent).toContain("Inactif");
  });

  it("creates an advantage with POST and no workspace or identity supplied by the UI", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ benefits: [] }))
      .mockResolvedValueOnce(response({ benefit: benefits[0] }));
    await act(async () => root.render(createElement(AdminPartnerBenefitsPanel, { partnerId })));
    await flush();
    await clickByLabel("Nouvel avantage");

    const form = container.querySelector("form");
    const inputs = form?.querySelectorAll("input");
    const selects = form?.querySelectorAll("select");
    expect(form).toBeTruthy();
    await setControl(inputs?.[0] as HTMLInputElement, "Bilan unique");
    await setControl(form?.querySelector("textarea") as HTMLTextAreaElement, "Une séance personnalisée.");
    await setControl(selects?.[0] as HTMLSelectElement, "once_lifetime");
    await setControl(inputs?.[1] as HTMLInputElement, "2026-10-01T10:00");
    await setControl(inputs?.[2] as HTMLInputElement, "2027-10-01T10:00");

    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(options.body));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/partner-benefits");
    expect(options.method).toBe("POST");
    expect(body).toMatchObject({ partnerId, title: "Bilan unique", usagePolicy: "once_lifetime", status: "active" });
    expect(body).not.toHaveProperty("workspaceId");
    expect(body).not.toHaveProperty("id");
  });

  it("edits and toggles status with PATCH, never DELETE", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ benefits: [benefits[0]] }))
      .mockResolvedValueOnce(response({ benefit: { ...benefits[0], title: "Bilan premium" } }))
      .mockResolvedValueOnce(response({ benefit: { ...benefits[0], status: "inactive" } }));
    await act(async () => root.render(createElement(AdminPartnerBenefitsPanel, { partnerId })));
    await flush();

    await clickByLabel("Modifier Bilan unique");
    const form = container.querySelector("form");
    await setControl(form?.querySelector("input") as HTMLInputElement, "Bilan premium");
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();
    await clickByLabel("Désactiver Bilan premium");
    await flush();

    const mutationCalls = fetchMock.mock.calls.slice(1) as Array<[string, RequestInit]>;
    expect(mutationCalls.map(([, options]) => options.method)).toEqual(["PATCH", "PATCH"]);
    expect(JSON.parse(String(mutationCalls[0][1].body))).not.toHaveProperty("partnerId");
    expect(JSON.parse(String(mutationCalls[1][1].body))).toEqual({ action: "deactivate" });
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
  });
});