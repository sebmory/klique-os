import { describe, expect, it } from "vitest";
import { getSignUpRedirectUrl } from "@/app/sign-up/[[...sign-up]]/page";

describe("signup portal redirect", () => {
  it("routes the partner interface explicitly", () => {
    expect(getSignUpRedirectUrl("partner")).toBe("/partner");
  });

  it("routes the media interface explicitly", () => {
    expect(getSignUpRedirectUrl("media")).toBe("/media-desk");
  });

  it.each([undefined, "", "athlete", "admin", "MEDIA", "unknown"])(
    "keeps the Athlete destination for %s",
    (portal) => {
      expect(getSignUpRedirectUrl(portal)).toBe("/athlete");
    },
  );
});