// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoryStudioPreview } from "@/components/contents/story-studio/StoryStudioPreview";

const { renderFrameMock } = vi.hoisted(() => ({
  renderFrameMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/story-studio/browser-renderer", () => ({
  renderStoryStudioFrameToCanvas: renderFrameMock,
  exportStoryStudioCanvasPng: vi.fn(),
}));

let container: HTMLElement;
let root: Root;

const selectFile = async (name: string) => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([name], name, { type: "image/jpeg" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
};

const selectFrame = async (index: number) => {
  const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  await act(async () => {
    tabs[index]?.click();
    await Promise.resolve();
  });
};

const setControlValue = async (selector: string, value: string) => {
  const control = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, value);
  await act(async () => {
    control.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
};

const lastRenderInput = () => renderFrameMock.mock.calls.at(-1)?.[0] as {
  photoUrl: string | null;
  frame: {
    id: string;
    text: { headline: string; body: string };
    photo: { scale: number; x: number; y: number };
  };
  template: { key: string };
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
    revokeObjectURL: vi.fn(),
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<StoryStudioPreview />);
    await Promise.resolve();
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Story Studio preview local photos", () => {
  it("keeps each frame photo and crop independent in local memory", async () => {
    await selectFile("frame-1.jpg");
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-1.jpg",
      frame: { id: "demo-result", photo: { scale: 1, x: 0, y: 0 } },
    });

    await selectFrame(1);
    expect(lastRenderInput()).toMatchObject({ photoUrl: null, frame: { id: "demo-context" } });
    await selectFile("frame-2.jpg");
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-2.jpg",
      frame: { id: "demo-context", photo: { scale: 1.1, x: 0.15, y: 0 } },
    });

    await selectFrame(0);
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-1.jpg",
      frame: { id: "demo-result", photo: { scale: 1, x: 0, y: 0 } },
    });
    await selectFrame(1);
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-2.jpg",
      frame: { id: "demo-context", photo: { scale: 1.1, x: 0.15, y: 0 } },
    });
  });

  it("keeps text and crop edits per frame while applying the selected template immediately", async () => {
    await selectFile("frame-1.jpg");
    await setControlValue('[aria-label="Titre de la frame active"]', "Titre frame 1");
    await setControlValue('[aria-label="Texte de la frame active"]', "Texte frame 1");
    await setControlValue('[aria-label="Zoom de la photo"]', "1.5");
    await setControlValue('[aria-label="Position horizontale de la photo"]', "0.3");

    const minimalTemplateButton = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((button) => button.textContent === "Minimal Premium");
    await act(async () => {
      minimalTemplateButton?.click();
      await Promise.resolve();
    });
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-1.jpg",
      frame: {
        id: "demo-result",
        text: { headline: "Titre frame 1", body: "Texte frame 1" },
        photo: { scale: 1.5, x: 0.3, y: 0 },
      },
      template: { key: "minimal_premium" },
    });

    await selectFrame(1);
    await selectFile("frame-2.jpg");
    await setControlValue('[aria-label="Titre de la frame active"]', "Titre frame 2");
    await setControlValue('[aria-label="Zoom de la photo"]', "2");
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-2.jpg",
      frame: { id: "demo-context", text: { headline: "Titre frame 2" }, photo: { scale: 2, x: 0.15, y: 0 } },
      template: { key: "minimal_premium" },
    });

    await selectFrame(0);
    expect(lastRenderInput()).toMatchObject({
      photoUrl: "blob:frame-1.jpg",
      frame: {
        id: "demo-result",
        text: { headline: "Titre frame 1", body: "Texte frame 1" },
        photo: { scale: 1.5, x: 0.3, y: 0 },
      },
      template: { key: "minimal_premium" },
    });
  });
});