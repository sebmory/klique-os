// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));

vi.mock("@/services/ecosystem.service", () => ({
  EcosystemService: { list: listMock },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/components/ecosystem/AdminPartnerBenefitsPanel", () => ({
  AdminPartnerBenefitsPanel: ({ partnerId }: { partnerId: string }) =>
    createElement("div", { "data-testid": "admin-benefits", "data-partner-id": partnerId }, "Avantages KLIQUE"),
}));

import { EcosystemResourceScreen } from "@/components/ecosystem/EcosystemResourceScreen";

const partnerId = "512c0349-236a-4f07-b099-4e6c29e22241";
const fetchMock = vi.fn();
let container: HTMLElement;
let root: Root;

const response = (payload: Record<string, unknown>, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => payload,
});
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  listMock.mockResolvedValue({
    source: "google-sheets",
    resources: [{
      id: partnerId,
      slug: "aloha-wake",
      canonicalPartnerId: partnerId,
      name: "Aloha Wake",
      type: "Expert",
      category: "Conseil",
      status: "Actif",
      contactName: "",
      contactRole: "",
      email: "sebastien.mory+partner@gmail.com",
      phone: "",
      website: "",
      instagram: "",
      memberOffer: "Bilan",
      expertise: "",
      services: "",
      nextAction: "",
      nextFollowUp: "",
      lastContact: "",
      estimatedValue: "",
      strategicPriority: "",
      potential: "",
      contractSigned: "",
      collaborationStart: "",
      collaborationEnd: "",
      deliverables: "",
      notes: "",
      raw: { row: 7 },
    }],
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("EcosystemResourceScreen Admin benefits visibility", () => {
  it.each([
    [{ isAdmin: false, isActive: true }],
    [{ isAdmin: true, isActive: false }],
  ])("does not render the panel without an active Admin session", async (permissions) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/clerk/access") return response({ permissions });
      return response({}, false, 403);
    });

    await act(async () => root.render(createElement(EcosystemResourceScreen, { id: partnerId })));
    await flush();

    expect(container.querySelector('[data-testid="admin-benefits"]')).toBeNull();
  });

  it("resolves a slug URL but renders the panel with the distinct canonical partner UUID", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/clerk/access") return response({ permissions: { isAdmin: true, isActive: true } });
      if (url.startsWith("/api/partners/invite")) return response({ state: "active" });
      return response({}, false, 404);
    });

    await act(async () => root.render(createElement(EcosystemResourceScreen, { id: "aloha-wake" })));
    await flush();

    const panel = container.querySelector('[data-testid="admin-benefits"]');
    expect(panel?.textContent).toBe("Avantages KLIQUE");
    expect(panel?.getAttribute("data-partner-id")).toBe(partnerId);
  });

  it("does not mount the benefits panel when the resolved Partner ID is invalid", async () => {
    listMock.mockResolvedValueOnce({
      source: "google-sheets",
      resources: [{
        id: "aloha-wake",
        slug: "aloha-wake",
        canonicalPartnerId: "aloha-wake",
        name: "Aloha Wake",
        type: "Partenaire",
        category: "Non renseigne",
        status: "Actif",
        contactName: "",
        contactRole: "",
        email: "",
        phone: "",
        website: "",
        instagram: "",
        memberOffer: "",
        expertise: "",
        services: "",
        nextAction: "",
        nextFollowUp: "",
        lastContact: "",
        estimatedValue: "",
        strategicPriority: "",
        potential: "",
        contractSigned: "",
        collaborationStart: "",
        collaborationEnd: "",
        deliverables: "",
        notes: "",
        raw: { row: 7 },
      }],
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/clerk/access") return response({ permissions: { isAdmin: true, isActive: true } });
      if (url.startsWith("/api/partners/invite")) return response({ state: "active" });
      return response({}, false, 404);
    });

    await act(async () => root.render(createElement(EcosystemResourceScreen, { id: "aloha-wake" })));
    await flush();

    expect(container.querySelector('[data-testid="admin-benefits"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Partner ID canonique est absent ou invalide");
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/admin/partner-benefits"), expect.anything());
  });
});