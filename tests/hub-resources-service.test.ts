import { describe, expect, it } from "vitest";
import { filterResourcesForAccess } from "@/lib/hub-resources/service";

describe("filterResourcesForAccess", () => {
  it("returns only published resources for non-admin users", () => {
    const resources = [
      { id: "1", status: "Publié" },
      { id: "2", status: "Brouillon" },
    ];

    expect(filterResourcesForAccess(resources as Array<{ id: string; status: string }>, false)).toEqual([{ id: "1", status: "Publié" }]);
  });

  it("returns drafts and published resources for admins", () => {
    const resources = [
      { id: "1", status: "Publié" },
      { id: "2", status: "Brouillon" },
    ];

    expect(filterResourcesForAccess(resources as Array<{ id: string; status: string }>, true)).toEqual(resources);
  });
});
