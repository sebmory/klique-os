// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: signOutMock }),
}));

import { UserMenu } from "@/components/app-shell/UserMenu";

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("UserMenu", () => {
  it.each([
    ["admin", "Administrateur"],
    ["athlete", "Athlète"],
    ["partner_expert", "Partenaire / Expert"],
    ["media", "Média"],
  ])("shows the Clerk identity and active %s access label", async (userRole, label) => {
    await act(async () => {
      root.render(createElement(UserMenu, { userName: "Camille Martin", userRole }));
    });

    expect(container.textContent).toContain("Camille Martin");
    expect(container.textContent).toContain(label);
    expect(container.textContent).not.toContain("Sebastien Mory");
  });

  it("displays the Clerk email when it is provided as the identity fallback", async () => {
    await act(async () => {
      root.render(createElement(UserMenu, { userName: "camille@example.com", userRole: "media" }));
    });

    expect(container.textContent).toContain("camille@example.com");
    expect(container.textContent).toContain("Média");
  });
});