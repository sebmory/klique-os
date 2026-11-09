import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const serviceUrl = new URL("../lib/clerk-access/service.ts", import.meta.url);
const panelUrl = new URL(
  "../components/creatives/CreativeProfilesAdminPanel.tsx",
  import.meta.url,
);
const profileRouteUrl = new URL("../app/api/creative/profile/route.ts", import.meta.url);

describe("creative Forms reconciliation wiring", () => {
  it("resolves the canonical profile before sending an invitation", async () => {
    const panel = await readFile(panelUrl, "utf8");

    expect(panel).toContain("reuseExisting: true");
    expect(panel.indexOf("reuseExisting: true")).toBeLessThan(
      panel.indexOf('fetch("/api/admin/creatives/access"'),
    );
  });

  it("blocks ambiguous invitation identities and reconciles legacy pending invitations", async () => {
    const service = await readFile(serviceUrl, "utf8");

    expect(service).toContain('reason: "ambiguous_identity"');
    expect(service).toContain("duplicate.id <> invitation.creative_profile_id");
    expect(service).toContain("claimed.previous_onboarding_status");
    expect(service).not.toContain(
      "AND profile.onboarding_status = 'invitation_sent'",
    );
  });

  it("merges partial profile edits instead of replacing stored Forms values", async () => {
    const route = await readFile(profileRouteUrl, "utf8");

    expect(route).toContain("mergeCreativeOnboardingProfile(current, patch)");
    expect(route).toContain("Object.hasOwn(body");
  });
});
