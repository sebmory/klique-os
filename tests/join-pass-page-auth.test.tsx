import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn((destination: string) => { throw new Error(`REDIRECT:${destination}`); }),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import JoinPassPage from "@/app/join/pass/page";

describe("Join Pass page authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects a visitor to Sign Up with the validated selected plan", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    await expect(JoinPassPage({ searchParams: Promise.resolve({ plan: "impact" }) }))
      .rejects.toThrow("REDIRECT:/sign-up?redirect=%2Fjoin%2Fpass%3Fplan%3Dimpact");
  });

  it("does not preserve an invalid plan in the auth return", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    await expect(JoinPassPage({ searchParams: Promise.resolve({ plan: "founder" }) }))
      .rejects.toThrow("REDIRECT:/sign-up?redirect=%2Fjoin%2Fpass");
  });

  it("renders for an authenticated Clerk account without checking user_access", async () => {
    authMock.mockResolvedValueOnce({ userId: "user-prospect" });
    const result = await JoinPassPage({ searchParams: Promise.resolve({ plan: "essential" }) });
    expect(result).toBeTruthy();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(authMock).toHaveBeenCalledOnce();
  });
});