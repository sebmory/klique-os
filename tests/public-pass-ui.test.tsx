// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authState, pushMock } = vi.hoisted(() => ({
  authState: { isLoaded: true, isSignedIn: false },
  pushMock: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useUser: () => authState }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import PublicPassCatalog from "@/components/pass/PublicPassCatalog";

const plans = [
  { code: "essential", name: "Essentiel", annualPriceChf: 249, durationMonths: 12, productionCredits: 1, customContentCredits: 2, videoAllowed: false },
  { code: "impact", name: "Impact", annualPriceChf: 549, durationMonths: 12, productionCredits: 2, customContentCredits: 4, videoAllowed: true },
  { code: "signature", name: "Signature", annualPriceChf: 999, durationMonths: 12, productionCredits: 3, customContentCredits: 6, videoAllowed: true },
];
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
  await act(async () => root.render(<PublicPassCatalog />));
  await flush();
};

const buttons = () => [...container.querySelectorAll("button")];

beforeEach(() => {
  vi.clearAllMocks();
  authState.isLoaded = true;
  authState.isSignedIn = false;
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

describe("Public Pass page", () => {
  it("loads only the public catalog and renders offers in returned order", async () => {
    fetchMock.mockResolvedValueOnce(response({ plans }));
    await mount();

    expect(fetchMock).toHaveBeenCalledWith("/api/public/membership-plans", { cache: "no-store" });
    expect(container.textContent?.indexOf("Essentiel")).toBeLessThan(container.textContent!.indexOf("Impact"));
    expect(container.textContent?.indexOf("Impact")).toBeLessThan(container.textContent!.indexOf("Signature"));
    expect(container.textContent).toContain("CHF 549.00");
    expect(container.textContent).toContain("12 mois");
    expect(container.textContent).toContain("2 crédit(s) production");
    expect(container.textContent).toContain("4 crédit(s) contenu");
    expect(container.textContent).toContain("Vidéo : incluse");
    expect(container.querySelector('a[href*="twint" i]')).toBeNull();
    expect(buttons().some((element) => element.textContent?.includes("Payer avec TWINT"))).toBe(false);
    expect(buttons()).toHaveLength(3);
  });

  it("shows accessible loading, error, and unavailable catalog states", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await mount();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Chargement des offres");

    await act(async () => root.unmount());
    root = createRoot(container);
    fetchMock.mockReset().mockResolvedValueOnce(response({ error: "Catalogue indisponible." }, 500));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Catalogue indisponible.");

    await act(async () => root.unmount());
    root = createRoot(container);
    fetchMock.mockReset().mockResolvedValueOnce(response({ plans: [] }));
    await mount();
    expect(container.querySelector('[role="status"]')?.textContent).toContain("momentanément indisponible");
  });

  it("sends a visitor to Sign Up while preserving the chosen plan", async () => {
    fetchMock.mockResolvedValueOnce(response({ plans }));
    await mount();
    await act(async () => buttons()[1].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(pushMock).toHaveBeenCalledWith("/sign-up?redirect=%2Fjoin%2Fpass%3Fplan%3Dimpact");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends an authenticated account directly to the selected plan", async () => {
    authState.isSignedIn = true;
    fetchMock.mockResolvedValueOnce(response({ plans }));
    await mount();
    await act(async () => buttons()[2].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(pushMock).toHaveBeenCalledWith("/join/pass?plan=signature");
  });
});