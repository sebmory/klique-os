// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (linkProps: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => {
    const {
    href,
    children,
    prefetch,
    ...props
    } = linkProps;
    void prefetch;
    return createElement("a", { href, ...props }, children);
  },
}));

import AthleteSphere from "@/components/home/AthleteSphere";
import {
  createAthleteSphereModel,
  findAthleteSphereNodeAtPoint,
  projectAthleteSphereNodes,
} from "@/lib/athlete-sphere";
import type { PublicAthleteCard } from "@/lib/public-athletes";

const athletes: PublicAthleteCard[] = Array.from({ length: 24 }, (_, index) => ({
  slug: `athlete-${index + 1}`,
  name: `Athlète ${index + 1}`,
  sport: index % 3 === 0 ? "Football" : index % 3 === 1 ? "Judo" : "Tennis",
  club: `Club ${index + 1}`,
  ...(index % 2 === 0 ? { portrait: `https://images.example/athlete-${index + 1}.jpg` } : {}),
  colorCategory: index % 3 === 0 ? "field" : index % 3 === 1 ? "combat" : "court",
}));

const canvasContext = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  measureText: vi.fn((value: string) => ({ width: value.length * 6 })),
  moveTo: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn(),
  fillStyle: "",
  font: "",
  globalAlpha: 1,
  lineWidth: 1,
  strokeStyle: "",
} as unknown as CanvasRenderingContext2D;

let root: Root;
let container: HTMLElement;
let reducedMotion = false;
let canvasAvailable = true;
let intersectionCallback: IntersectionObserverCallback | null = null;
const requestAnimationFrameMock = vi.fn(() => 17);
const cancelAnimationFrameMock = vi.fn();
const portraitCss = readFileSync(
  "components/public-athletes/athlete-portrait.module.css",
  "utf8",
);
const sphereCss = readFileSync(
  "components/home/athlete-sphere.module.css",
  "utf8",
);

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  disconnect() {}
  unobserve() {}
}

class IntersectionObserverMock {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }
  observe(target: Element) {
    intersectionCallback?.(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  takeRecords() { return []; }
  unobserve() {}
}

const pointerEvent = (
  type: string,
  x: number,
  y: number,
  pointerType = "mouse",
): MouseEvent => {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
  });
  return event;
};

const mount = async (
  props: Partial<React.ComponentProps<typeof AthleteSphere>> = {},
) => {
  await act(async () => {
    root.render(
      <AthleteSphere
        athletes={athletes}
        fallbackAthletes={athletes.slice(0, 6)}
        {...props}
      />,
    );
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  reducedMotion = false;
  canvasAvailable = true;
  intersectionCallback = null;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameMock);
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: reducedMotion,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => canvasAvailable ? canvasContext : null);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 640,
    bottom: 510,
    left: 0,
    width: 640,
    height: 510,
    toJSON: () => ({}),
  });
  Object.defineProperties(HTMLCanvasElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AthleteSphere", () => {
  it("renders 24 public athletes without fetching or exposing private fields", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await mount();

    expect(container.querySelector("canvas")?.getAttribute("aria-label")).toContain("24 Athlètes");
    const rosterButtons = container.querySelectorAll("details button");
    expect(rosterButtons).toHaveLength(24);
    expect(container.textContent).not.toContain("seb-mory");
    expect(container.textContent).not.toContain("email");
    expect(container.textContent).not.toContain("sourceAthleteId");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["mouse", "touch"])("selects a point with %s interaction", async (pointerType) => {
    await mount();
    const canvas = container.querySelector("canvas");
    const model = createAthleteSphereModel(athletes);
    const projected = projectAthleteSphereNodes(model.nodes, -0.42, -0.14, 640, 510);
    const target = projected[3]!;

    await act(async () => {
      canvas?.dispatchEvent(pointerEvent("pointerdown", target.screenX, target.screenY, pointerType));
      canvas?.dispatchEvent(pointerEvent("pointerup", target.screenX, target.screenY, pointerType));
    });

    const profileLink = container.querySelector('a[href^="/athletes/"][href*="athlete-"]');
    expect(profileLink?.getAttribute("href")).toBe(`/athletes/${target.athlete.slug}`);
    expect(container.textContent).toContain(`Athlète sélectionné : ${target.athlete.name}`);
  });

  it("draws the hovered athlete name, sport, and club on desktop", async () => {
    await mount();
    const canvas = container.querySelector("canvas");
    const model = createAthleteSphereModel(athletes);
    const projected = projectAthleteSphereNodes(model.nodes, -0.42, -0.14, 640, 510);
    const target = projected.slice().sort((left, right) => right.depth - left.depth)[0]!;
    const hovered = findAthleteSphereNodeAtPoint(projected, target.screenX, target.screenY)!;
    vi.mocked(canvasContext.fillText).mockClear();

    await act(async () => {
      canvas?.dispatchEvent(pointerEvent("pointermove", target.screenX, target.screenY));
    });

    const labels = vi.mocked(canvasContext.fillText).mock.calls.map(([value]) => value);
    expect(labels).toContain(hovered.athlete.name);
    expect(labels).toContain(hovered.athlete.sport);
    expect(labels).toContain(hovered.athlete.club);
  });

  it("supports keyboard selection and pause or resume", async () => {
    await mount();
    const canvas = container.querySelector("canvas");
    const initialHref = container.querySelector('a[href^="/athletes/"]')?.getAttribute("href");

    await act(async () => {
      canvas?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(container.querySelector('a[href^="/athletes/"]')?.getAttribute("href")).not.toBe(initialHref);

    const pauseButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Pause"));
    await act(async () => pauseButton?.click());
    expect(container.textContent).toContain("Reprendre");
    await act(async () => [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Reprendre"))?.click());
    expect(container.textContent).toContain("Pause");
  });

  it("keeps the selected full-body portrait contained without changing other portrait defaults", async () => {
    const fullBodyAthletes = athletes.map((athlete, index) => ({
      ...athlete,
      portrait: `https://images.example/${index === 0 ? "tylian-full-body" : athlete.slug}.png`,
    }));
    await mount({ athletes: fullBodyAthletes });

    const selectedPortrait = container.querySelector<HTMLImageElement>(
      "article img[data-portrait-fit='contain']",
    );
    expect(selectedPortrait).not.toBeNull();
    expect(selectedPortrait?.getAttribute("data-portrait-fit")).toBe("contain");
    expect(portraitCss).toContain("object-fit: contain");
    expect(portraitCss).toContain("object-position: center bottom");
    expect(portraitCss).not.toContain("transform: scale");
    expect(sphereCss).not.toMatch(/\.portrait\s*>\s*\*\s*\{[^}]*object-fit:\s*cover/);
  });

  it("keeps the initials placeholder when the selected athlete has no portrait", async () => {
    await mount({
      athletes: [{
        ...athletes[0]!,
        portrait: undefined,
      }],
    });

    expect(container.querySelector("article img")).toBeNull();
    expect(container.querySelector("article [role='img']")?.getAttribute("aria-label"))
      .toContain("Portrait non publié");
  });

  it("disables automatic rotation for reduced motion", async () => {
    reducedMotion = true;
    await mount();

    expect(container.textContent).toContain("Mouvement réduit");
    expect(container.textContent).not.toContain("Pause");
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });

  it("stops animation outside the section and when the document is hidden", async () => {
    await mount();
    expect(requestAnimationFrameMock).toHaveBeenCalled();
    const section = container.querySelector("section")!;

    await act(async () => {
      intersectionCallback?.(
        [{ target: section, isIntersecting: false } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(17);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(container.querySelector("canvas")).not.toBeNull();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("uses the six-profile fallback when Canvas is unavailable", async () => {
    canvasAvailable = false;
    await mount();

    expect(container.querySelector("canvas")).toBeNull();
    expect(container.textContent).toContain("La visualisation interactive n’est pas disponible");
    expect(container.querySelectorAll('.fallbackGrid a, a[href^="/athletes/"]')).toHaveLength(6);
    expect(container.querySelector("img[data-portrait-fit='cover']")).not.toBeNull();
  });

  it("isolates loading errors and empty data from the rest of the homepage", async () => {
    await mount({ athletes: [], fallbackAthletes: [], loadError: true });
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain("Les Athlètes sont momentanément indisponibles");

    await mount({ athletes: [], fallbackAthletes: [], loadError: false });
    expect(container.querySelector('[role="status"]')?.textContent)
      .toContain("Aucun profil public à afficher");
  });
});
