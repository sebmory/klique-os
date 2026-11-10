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

  it("hides unavailable actions and keeps sign-out", async () => {
    await act(async () => {
      root.render(createElement(UserMenu, { userName: "Camille Martin", userRole: "admin" }));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".user-trigger")?.click();
    });

    expect(container.textContent).not.toContain("Bientôt disponible");
    expect(container.textContent).not.toContain("Mon profil");
    expect(container.textContent).not.toContain("Préférences");
    expect(container.textContent).not.toContain("Changer de workspace");

    const signOutButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Se déconnecter"));
    expect(signOutButton).toBeDefined();

    await act(async () => {
      signOutButton?.click();
    });
    expect(signOutMock).toHaveBeenCalledWith({ redirectUrl: "/sign-in" });
  });
});