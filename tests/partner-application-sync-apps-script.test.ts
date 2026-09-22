import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = path.resolve(
  process.cwd(),
  "scripts/google-apps-script/partner-application-sync/Code.gs",
);
const readmePath = path.resolve(
  process.cwd(),
  "scripts/google-apps-script/partner-application-sync/README.md",
);
const source = readFileSync(scriptPath, "utf8");
const readme = readFileSync(readmePath, "utf8");

describe("Partner application synchronization Apps Script", () => {
  it("uses the installable form-submit event and reads only its row number", () => {
    expect(source).toContain("function onFormSubmit(event)");
    expect(source).toContain("event.range.getSheet()");
    expect(source).toContain("event.range.getRow()");
    expect(source).toContain('Forms_Partenaires_Responses');
    expect(source).not.toMatch(/getValues?\s*\(/);
    expect(source).not.toMatch(/event\.namedValues|event\.values/);
  });

  it("loads the endpoint and secret exclusively from Script Properties", () => {
    expect(source).toContain("PropertiesService.getScriptProperties()");
    expect(source).toContain('PARTNER_APPLICATION_SYNC_URL');
    expect(source).toContain('PARTNER_APPLICATION_SYNC_HMAC_SECRET');
    expect(source).toContain("properties.getProperty(SYNC_URL_PROPERTY)");
    expect(source).toContain("properties.getProperty(SYNC_SECRET_PROPERTY)");
    expect(source).not.toContain("/api/internal/partner-application-sync");
    expect(source).not.toMatch(/https?:\/\//);
  });

  it("signs the exact timestamp and raw JSON contract expected by the API", () => {
    expect(source).toContain("JSON.stringify({ rowNumber: rowNumber })");
    expect(source).toContain('timestamp + "." + rawBody');
    expect(source).toContain("Utilities.computeHmacSha256Signature");
    expect(source).toContain('return "sha256=" + hex');
    expect(source).toContain('"x-klique-timestamp": timestamp');
    expect(source).toContain('"x-klique-signature": signature');
  });

  it("posts only the row payload and throws after logging a failed HTTP status", () => {
    expect(source).toContain("UrlFetchApp.fetch(apiUrl");
    expect(source).toContain('method: "post"');
    expect(source).toContain("payload: rawBody");
    expect(source).toContain("muteHttpExceptions: true");
    expect(source).toContain('console.log("Partner sync row=%s status=%s", rowNumber, statusCode)');
    expect(source).toMatch(/if \(statusCode < 200 \|\| statusCode >= 300\) \{\s*throw new Error/);
    expect(source).not.toMatch(/console\.(?:log|info|warn|error)\([^\n]*(?:rawBody|secret|apiUrl|response)/);
  });

  it("documents manual properties and trigger installation without configuring them", () => {
    expect(readme).toContain("PARTNER_APPLICATION_SYNC_URL");
    expect(readme).toContain("PARTNER_APPLICATION_SYNC_HMAC_SECRET");
    expect(readme).toContain("Lors de l’envoi du formulaire");
    expect(readme).toContain("onFormSubmit");
    expect(source).not.toContain("ScriptApp.newTrigger");
    expect(source).not.toContain("setProperty(");
  });
});