// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkspaceSwitcher } from "@/components/app-shell/WorkspaceSwitcher";

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("WorkspaceSwitcher", () => {
  it("keeps the active workspace and hides unavailable workspace actions", async () => {
    await act(async () => {
      root.render(createElement(WorkspaceSwitcher));
    });

    expect(container.textContent).toContain("KLIQUE OS");
    expect(container.textContent).toContain("Workspace principal");

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".workspace-trigger")?.click();
    });

    expect(container.textContent).not.toContain("Bientot disponible");
    expect(container.textContent).not.toContain("Creer un workspace");
    expect(container.textContent).not.toContain("KLIQUE Agency");
    expect(container.textContent).not.toContain("Elfic Fribourg");
    expect(container.textContent).not.toContain("Personnel");
    expect(container.querySelector('[role="menuitemradio"][aria-checked="true"]')?.textContent)
      .toContain("KLIQUE OS");
  });
});
