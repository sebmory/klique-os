// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentsHubScreen } from "@/components/contents/ContentsHubScreen";

vi.mock("@/services/content-backfill", () => ({ runContentsBackfill: vi.fn() }));

let container: HTMLElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ drafts: [] }),
  }));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ContentsHubScreen context={{ mode: "free" }} />);
    await Promise.resolve();
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Contents hub Story Studio navigation", () => {
  it("links Brand Kits from the Contents hub", () => {
    const link = container.querySelector<HTMLAnchorElement>('a[href="/contents/story-studio/brand-kits"]');

    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Brand Kits");
    expect(link?.getAttribute("aria-label")).toBe("Ouvrir les Brand Kits Story Studio");
  });
});