import { describe, expect, it } from "vitest";
import { isHiddenExternalAthleteProfileRoute, isPartnerAllowedApi, isPartnerAllowedPage } from "@/proxy";

describe("partner proxy access", () => {
  it("allows the read-only community page", () => {
    expect(isPartnerAllowedPage("/partner/community")).toBe(true);
    expect(isPartnerAllowedPage("/partner/community/")).toBe(false);
  });

  it("allows the personal contact requests page", () => {
    expect(isPartnerAllowedPage("/partner/contact-requests")).toBe(true);
  });

  it("allows GET on the personal contact requests API", () => {
    expect(isPartnerAllowedApi("/api/partner/contact-requests", "GET")).toBe(true);
  });

  it("allows only GET on the partner community API", () => {
    expect(isPartnerAllowedApi("/api/partner/community", "GET")).toBe(true);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isPartnerAllowedApi("/api/partner/community", method)).toBe(false);
    }
  });

  it("allows only GET on the partner opportunities API", () => {
    expect(isPartnerAllowedApi("/api/partner/opportunities", "GET")).toBe(true);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isPartnerAllowedApi("/api/partner/opportunities", method)).toBe(false);
    }
    expect(isPartnerAllowedApi("/api/hub-opportunity-slots", "GET")).toBe(false);
  });

  it("allows only GET on the partner benefits API", () => {
    expect(isPartnerAllowedApi("/api/partner/benefits", "GET")).toBe(true);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isPartnerAllowedApi("/api/partner/benefits", method)).toBe(false);
    }
    expect(isPartnerAllowedApi("/api/partner/benefits/partner-1", "GET")).toBe(false);
  });

  it("allows only GET on partner resource list and detail APIs", () => {
    for (const pathname of ["/api/partner/resources", "/api/partner/resources/resource-1"]) {
      expect(isPartnerAllowedApi(pathname, "GET")).toBe(true);
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(isPartnerAllowedApi(pathname, method)).toBe(false);
      }
    }

    expect(isPartnerAllowedApi("/api/partner/resources/", "GET")).toBe(false);
    expect(isPartnerAllowedApi("/api/partner/resources/resource-1/edit", "GET")).toBe(false);
  });

  it("identifies the hidden partner athlete profile route", () => {
    expect(isHiddenExternalAthleteProfileRoute("/partner/athletes/seb-mory")).toBe(true);
    expect(isHiddenExternalAthleteProfileRoute("/partner/athletes/athlete-1")).toBe(false);
  });

  it("keeps the existing request creation POST while refusing unsupported write methods", () => {
    expect(isPartnerAllowedApi("/api/partner/contact-requests", "POST")).toBe(true);

    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(isPartnerAllowedApi("/api/partner/contact-requests", method)).toBe(false);
    }
  });

  it("refuses similar or nested pages that are not explicitly allowed", () => {
    for (const pathname of [
      "/partner/contact-request",
      "/partner/contact-requests/",
      "/partner/contact-requests/request-1",
      "/partner/contact-requests-admin",
    ]) {
      expect(isPartnerAllowedPage(pathname)).toBe(false);
    }
  });

  it("refuses similar or nested APIs that are not explicitly allowed", () => {
    for (const pathname of [
      "/api/partner/contact-request",
      "/api/partner/contact-requests/",
      "/api/partner/contact-requests/request-1",
      "/api/partner/contact-requests-admin",
    ]) {
      expect(isPartnerAllowedApi(pathname, "GET")).toBe(false);
      expect(isPartnerAllowedApi(pathname, "POST")).toBe(false);
    }
  });
});
