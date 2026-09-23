import { describe, expect, it } from "vitest";
import { getSignInRedirectUrl } from "@/app/sign-in/[[...sign-in]]/page";
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

  it("preserves only a valid local Pass return for Sign Up and Sign In", () => {
    const target = "/join/pass?plan=impact";
    expect(getSignUpRedirectUrl(undefined, target)).toBe(target);
    expect(getSignInRedirectUrl(target)).toBe(target);
    expect(getSignUpRedirectUrl(undefined, "https://evil.example/join/pass?plan=impact")).toBe("/athlete");
    expect(getSignInRedirectUrl("/join/pass?plan=founder")).toBe("/");
    expect(getSignInRedirectUrl("/today")).toBe("/");
  });
});