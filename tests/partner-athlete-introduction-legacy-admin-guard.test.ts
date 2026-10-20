import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy admin introduction guard", () => {
  it("uses the flow-aware update only when the new schema is activated", () => {
    const route = readFileSync(
      path.join(process.cwd(), "app/api/contact-requests/route.ts"),
      "utf8",
    );
    const service = readFileSync(
      path.join(process.cwd(), "lib/contact-requests/service.ts"),
      "utf8",
    );

    expect(route).toContain("isPartnerAthleteIntroductionsEnabled()");
    expect(route).toContain("updateLegacyContactRequestStatus");
    expect(service).toContain("request_kind <> 'partner_athlete_introduction'");
    expect(service).toContain("flow_version < 2");
  });
});
