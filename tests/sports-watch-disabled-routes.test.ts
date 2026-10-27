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
  listSafvBindings: vi.fn(),
  verifySafvBinding: vi.fn(),
  confirmSafvBinding: vi.fn(),
  disableSafvBinding: vi.fn(),
  listBeBasketBindings: vi.fn(),
  verifyBeBasketBinding: vi.fn(),
  confirmBeBasketBinding: vi.fn(),
  disableBeBasketBinding: vi.fn(),
  listSwissBasketballBindings: vi.fn(),
  verifySwissBasketballBinding: vi.fn(),
  confirmSwissBasketballBinding: vi.fn(),
  disableSwissBasketballBinding: vi.fn(),
  importUpload: vi.fn(),
  importExtract: vi.fn(),
  importConfirm: vi.fn(),
  importGet: vi.fn(),
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
    listSafvBindings: mocks.listSafvBindings,
    verifySafvBinding: mocks.verifySafvBinding,
    confirmSafvBinding: mocks.confirmSafvBinding,
    disableSafvBinding: mocks.disableSafvBinding,
    listBeBasketBindings: mocks.listBeBasketBindings,
    verifyBeBasketBinding: mocks.verifyBeBasketBinding,
    confirmBeBasketBinding: mocks.confirmBeBasketBinding,
    disableBeBasketBinding: mocks.disableBeBasketBinding,
    listSwissBasketballBindings: mocks.listSwissBasketballBindings,
    verifySwissBasketballBinding: mocks.verifySwissBasketballBinding,
    confirmSwissBasketballBinding: mocks.confirmSwissBasketballBinding,
    disableSwissBasketballBinding: mocks.disableSwissBasketballBinding,
  },
}));

vi.mock("@/lib/sports-watch/import-service", () => ({
  SportsWatchImportService: {
    upload: mocks.importUpload,
    extract: mocks.importExtract,
    confirm: mocks.importConfirm,
    get: mocks.importGet,
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
import { POST as VERIFY_SAFV } from "@/app/api/admin/sports-watch/safv-bindings/verify/route";
import {
  DELETE as DISABLE_SAFV,
  PUT as CONFIRM_SAFV,
} from "@/app/api/admin/sports-watch/safv-bindings/[athleteId]/route";
import { POST as VERIFY_BEBASKET } from "@/app/api/admin/sports-watch/bebasket-bindings/verify/route";
import {
  DELETE as DISABLE_BEBASKET,
  PUT as CONFIRM_BEBASKET,
} from "@/app/api/admin/sports-watch/bebasket-bindings/[athleteId]/route";
import { POST as VERIFY_SWISS_BASKETBALL } from "@/app/api/admin/sports-watch/swiss-basketball-bindings/verify/route";
import { PUT as CONFIRM_SWISS_BASKETBALL } from "@/app/api/admin/sports-watch/swiss-basketball-bindings/route";
import { DELETE as DISABLE_SWISS_BASKETBALL } from "@/app/api/admin/sports-watch/swiss-basketball-bindings/[bindingId]/route";
import { POST as UPLOAD_IMPORT } from "@/app/api/admin/sports-watch/imports/route";
import { POST as EXTRACT_IMPORT } from "@/app/api/admin/sports-watch/imports/[importId]/extract/route";
import { POST as CONFIRM_IMPORT } from "@/app/api/admin/sports-watch/imports/[importId]/confirm/route";
import { GET as GET_IMPORT_FILE } from "@/app/api/admin/sports-watch/imports/[importId]/file/route";

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
    const verifySafvResponse = await VERIFY_SAFV(new Request(
      "http://localhost/api/admin/sports-watch/safv-bindings/verify",
      { method: "POST" },
    ));
    const confirmSafvResponse = await CONFIRM_SAFV(new Request(
      "http://localhost/api/admin/sports-watch/safv-bindings/athlete-1",
      { method: "PUT" },
    ), context);
    const disableSafvResponse = await DISABLE_SAFV(new Request(
      "http://localhost/api/admin/sports-watch/safv-bindings/athlete-1",
      { method: "DELETE" },
    ), context);
    const verifyBeBasketResponse = await VERIFY_BEBASKET(new Request(
      "http://localhost/api/admin/sports-watch/bebasket-bindings/verify",
      { method: "POST" },
    ));
    const confirmBeBasketResponse = await CONFIRM_BEBASKET(new Request(
      "http://localhost/api/admin/sports-watch/bebasket-bindings/athlete-1",
      { method: "PUT" },
    ), context);
    const disableBeBasketResponse = await DISABLE_BEBASKET(new Request(
      "http://localhost/api/admin/sports-watch/bebasket-bindings/athlete-1",
      { method: "DELETE" },
    ), context);
    const verifySwissBasketballResponse = await VERIFY_SWISS_BASKETBALL(new Request(
      "http://localhost/api/admin/sports-watch/swiss-basketball-bindings/verify",
      { method: "POST" },
    ));
    const confirmSwissBasketballResponse = await CONFIRM_SWISS_BASKETBALL(new Request(
      "http://localhost/api/admin/sports-watch/swiss-basketball-bindings",
      { method: "PUT" },
    ));
    const bindingContext = {
      params: Promise.resolve({ bindingId: "11111111-1111-4111-8111-111111111111" }),
    };
    const disableSwissBasketballResponse = await DISABLE_SWISS_BASKETBALL(new Request(
      "http://localhost/api/admin/sports-watch/swiss-basketball-bindings/11111111-1111-4111-8111-111111111111",
      { method: "DELETE" },
    ), bindingContext);
    const importContext = { params: Promise.resolve({ importId: "11111111-1111-4111-8111-111111111111" }) };
    const uploadImportResponse = await UPLOAD_IMPORT(new Request(
      "http://localhost/api/admin/sports-watch/imports",
      { method: "POST" },
    ));
    const extractImportResponse = await EXTRACT_IMPORT(new Request(
      "http://localhost/api/admin/sports-watch/imports/11111111-1111-4111-8111-111111111111/extract",
      { method: "POST" },
    ), importContext);
    const confirmImportResponse = await CONFIRM_IMPORT(new Request(
      "http://localhost/api/admin/sports-watch/imports/11111111-1111-4111-8111-111111111111/confirm",
      { method: "POST" },
    ), importContext);
    const getImportFileResponse = await GET_IMPORT_FILE(new Request(
      "http://localhost/api/admin/sports-watch/imports/11111111-1111-4111-8111-111111111111/file",
    ), importContext);

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(404);
    expect(verifyResponse.status).toBe(404);
    expect(confirmResponse.status).toBe(404);
    expect(disableResponse.status).toBe(404);
    expect(verifyIwwfResponse.status).toBe(404);
    expect(confirmIwwfResponse.status).toBe(404);
    expect(disableIwwfResponse.status).toBe(404);
    expect(verifySafvResponse.status).toBe(404);
    expect(confirmSafvResponse.status).toBe(404);
    expect(disableSafvResponse.status).toBe(404);
    expect(verifyBeBasketResponse.status).toBe(404);
    expect(confirmBeBasketResponse.status).toBe(404);
    expect(disableBeBasketResponse.status).toBe(404);
    expect(verifySwissBasketballResponse.status).toBe(404);
    expect(confirmSwissBasketballResponse.status).toBe(404);
    expect(disableSwissBasketballResponse.status).toBe(404);
    expect(uploadImportResponse.status).toBe(404);
    expect(extractImportResponse.status).toBe(404);
    expect(confirmImportResponse.status).toBe(404);
    expect(getImportFileResponse.status).toBe(404);
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.listSwissBindings).not.toHaveBeenCalled();
    expect(mocks.listIwwfBindings).not.toHaveBeenCalled();
    expect(mocks.listSafvBindings).not.toHaveBeenCalled();
    expect(mocks.listBeBasketBindings).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.verifySwissBinding).not.toHaveBeenCalled();
    expect(mocks.confirmSwissBinding).not.toHaveBeenCalled();
    expect(mocks.disableSwissBinding).not.toHaveBeenCalled();
    expect(mocks.verifyIwwfBinding).not.toHaveBeenCalled();
    expect(mocks.confirmIwwfBinding).not.toHaveBeenCalled();
    expect(mocks.disableIwwfBinding).not.toHaveBeenCalled();
    expect(mocks.verifySafvBinding).not.toHaveBeenCalled();
    expect(mocks.confirmSafvBinding).not.toHaveBeenCalled();
    expect(mocks.disableSafvBinding).not.toHaveBeenCalled();
    expect(mocks.verifyBeBasketBinding).not.toHaveBeenCalled();
    expect(mocks.confirmBeBasketBinding).not.toHaveBeenCalled();
    expect(mocks.disableBeBasketBinding).not.toHaveBeenCalled();
    expect(mocks.importUpload).not.toHaveBeenCalled();
    expect(mocks.importExtract).not.toHaveBeenCalled();
    expect(mocks.importConfirm).not.toHaveBeenCalled();
    expect(mocks.importGet).not.toHaveBeenCalled();
  });
});
