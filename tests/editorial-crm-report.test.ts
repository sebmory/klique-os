import { describe, expect, it } from "vitest";
import { getConnectorStatusMessage } from "@/components/contents/CreationAssistantScreen";

describe("CRM collection report", () => {
  it("does not report a missing subject when CRM items were collected", () => {
    const message = getConnectorStatusMessage({
      connectorId: "crm",
      status: "completed",
      itemCount: 3,
    });

    expect(message).toBe("3 elements recuperes.");
    expect(message).not.toContain("introuvable");
  });

  it("keeps the CRM error message for a real connector failure", () => {
    expect(getConnectorStatusMessage({
      connectorId: "crm",
      status: "error",
      itemCount: 0,
      errorCode: "CRM_SUBJECT_NOT_FOUND",
      message: "Le sujet CRM selectionne est introuvable.",
    })).toBe("Le sujet CRM selectionne est introuvable.");
  });
});
