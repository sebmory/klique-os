import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

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

const createAppsScriptHarness = () => {
  const fetch = vi.fn(() => ({ getResponseCode: () => 204 }));
  const getProperty = vi.fn((key: string) => key === "PARTNER_APPLICATION_SYNC_URL"
    ? "https://example.test/sync"
    : "a-secure-test-secret-with-at-least-32-characters");
  const getScriptProperties = vi.fn(() => ({ getProperty }));
  const computeHmacSha256Signature = vi.fn(() => [1, 2, 3]);
  const log = vi.fn();
  const context: Record<string, unknown> = {
    PropertiesService: { getScriptProperties },
    UrlFetchApp: { fetch },
    Utilities: {
      computeHmacSha256Signature,
      Charset: { UTF_8: "UTF_8" },
    },
    console: { log },
  };

  runInNewContext(source, context);

  return {
    onFormSubmit: context.onFormSubmit as (event?: {
      range?: {
        getSheet: () => { getName: () => string };
        getRow: () => number;
      };
    }) => void,
    fetch,
    getProperty,
    getScriptProperties,
    log,
  };
};

describe("Partner application synchronization Apps Script", () => {
  it("rejects an invalid form-submit event", () => {
    const { onFormSubmit } = createAppsScriptHarness();

    expect(() => onFormSubmit()).toThrow("Événement onFormSubmit invalide.");
    expect(() => onFormSubmit({})).toThrow("Événement onFormSubmit invalide.");
  });

  it("ignores another sheet without reading secrets, logging, or making an HTTP call", () => {
    const { onFormSubmit, fetch, getProperty, getScriptProperties, log } = createAppsScriptHarness();
    const getRow = vi.fn(() => 2);

    expect(() => onFormSubmit({
      range: {
        getSheet: () => ({ getName: () => "Forms_Athletes_Responses" }),
        getRow,
      },
    })).not.toThrow();

    expect(getRow).not.toHaveBeenCalled();
    expect(getScriptProperties).not.toHaveBeenCalled();
    expect(getProperty).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("continues the normal synchronization for the Partner response sheet", () => {
    const { onFormSubmit, fetch, getScriptProperties } = createAppsScriptHarness();

    onFormSubmit({
      range: {
        getSheet: () => ({ getName: () => "Forms_Partenaires_Responses" }),
        getRow: () => 2,
      },
    });

    expect(getScriptProperties).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/sync",
      expect.objectContaining({
        method: "post",
        payload: JSON.stringify({ rowNumber: 2 }),
      }),
    );
  });

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