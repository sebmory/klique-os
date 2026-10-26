import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  list: vi.fn(),
  listSwissBindings: vi.fn(),
  listIwwfBindings: vi.fn(),
  run: vi.fn(),
  verifySwissBinding: vi.fn(),
  confirmSwissBinding: vi.fn(),
  disableSwissBinding: vi.fn(),
  verifyIwwfBinding: vi.fn(),
  confirmIwwfBinding: vi.fn(),
  disableIwwfBinding: vi.fn(),
}));

vi.mock("@/lib/sports-watch/activation", () => ({
  isSportsWatchEnabled: () => false,
}));

vi.mock("@/lib/sports-watch/service", () => ({
  requireSportsWatchAdmin: mocks.requireAdmin,
  sportsWatchErrorStatus: vi.fn(),
  SportsWatchService: {
    list: mocks.list,
    listSwissBindings: mocks.listSwissBindings,
    listIwwfBindings: mocks.listIwwfBindings,
    run: mocks.run,
    verifySwissBinding: mocks.verifySwissBinding,
    confirmSwissBinding: mocks.confirmSwissBinding,
    disableSwissBinding: mocks.disableSwissBinding,
    verifyIwwfBinding: mocks.verifyIwwfBinding,
    confirmIwwfBinding: mocks.confirmIwwfBinding,
    disableIwwfBinding: mocks.disableIwwfBinding,
  },
}));

import { GET, POST } from "@/app/api/admin/sports-watch/route";
import { POST as VERIFY } from "@/app/api/admin/sports-watch/swiss-bindings/verify/route";
import {
  DELETE as DISABLE,
  PUT as CONFIRM,
} from "@/app/api/admin/sports-watch/swiss-bindings/[athleteId]/route";
import { POST as VERIFY_IWWF } from "@/app/api/admin/sports-watch/iwwf-bindings/verify/route";
import {
  DELETE as DISABLE_IWWF,
  PUT as CONFIRM_IWWF,
} from "@/app/api/admin/sports-watch/iwwf-bindings/[athleteId]/route";

describe("disabled sports watch routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns before Admin resolution or repository-backed service access", async () => {
    const getResponse = await GET(new Request("http://localhost/api/admin/sports-watch"));
    const postResponse = await POST(new Request("http://localhost/api/admin/sports-watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId: "athlete-1" }),
    }));
    const verifyResponse = await VERIFY(new Request(
      "http://localhost/api/admin/sports-watch/swiss-bindings/verify",
      { method: "POST" },
    ));
    const context = { params: Promise.resolve({ athleteId: "athlete-1" }) };
    const confirmResponse = await CONFIRM(new Request(
      "http://localhost/api/admin/sports-watch/swiss-bindings/athlete-1",
      { method: "PUT" },
    ), context);
    const disableResponse = await DISABLE(new Request(
      "http://localhost/api/admin/sports-watch/swiss-bindings/athlete-1",
      { method: "DELETE" },
    ), context);
    const verifyIwwfResponse = await VERIFY_IWWF(new Request(
      "http://localhost/api/admin/sports-watch/iwwf-bindings/verify",
      { method: "POST" },
    ));
    const confirmIwwfResponse = await CONFIRM_IWWF(new Request(
      "http://localhost/api/admin/sports-watch/iwwf-bindings/athlete-1",
      { method: "PUT" },
    ), context);
    const disableIwwfResponse = await DISABLE_IWWF(new Request(
      "http://localhost/api/admin/sports-watch/iwwf-bindings/athlete-1",
      { method: "DELETE" },
    ), context);

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(verifyResponse.status).toBe(404);
    expect(confirmResponse.status).toBe(404);
    expect(disableResponse.status).toBe(404);
    expect(verifyIwwfResponse.status).toBe(404);
    expect(confirmIwwfResponse.status).toBe(404);
    expect(disableIwwfResponse.status).toBe(404);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.listSwissBindings).not.toHaveBeenCalled();
    expect(mocks.listIwwfBindings).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.verifySwissBinding).not.toHaveBeenCalled();
    expect(mocks.confirmSwissBinding).not.toHaveBeenCalled();
    expect(mocks.disableSwissBinding).not.toHaveBeenCalled();
    expect(mocks.verifyIwwfBinding).not.toHaveBeenCalled();
    expect(mocks.confirmIwwfBinding).not.toHaveBeenCalled();
    expect(mocks.disableIwwfBinding).not.toHaveBeenCalled();
  });
});
