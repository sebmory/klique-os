import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import AnalyticsPage from "@/app/analytics/page";

describe("AnalyticsPage", () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it("redirects directly to the KLIQUE visibility page", () => {
    AnalyticsPage();

    expect(redirectMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/analytics/visibilite");
  });
});