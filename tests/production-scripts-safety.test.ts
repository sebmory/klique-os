import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confirmInteractiveApply,
  parseScriptMode,
} from "@/lib/production-script-safety";

describe("production write scripts", () => {
  it("defaults to dry-run and requires explicit --apply", () => {
    expect(parseScriptMode([])).toEqual({ apply: false, skipConfirmation: false });
    expect(parseScriptMode(["--apply"])).toEqual({ apply: true, skipConfirmation: false });
  });

  it("never tries to prompt in a non-interactive process", async () => {
    const streams = {
      input: { isTTY: false } as NodeJS.ReadStream,
      output: { isTTY: false } as NodeJS.WriteStream,
    };

    await expect(confirmInteractiveApply(parseScriptMode([]), streams)).resolves.toBe(false);
    await expect(confirmInteractiveApply(parseScriptMode(["--apply"]), streams)).resolves.toBe(true);
  });

  it.each([
    ["reconcile-athlete-access.ts", "sql.transaction"],
    ["regularize-creative-missions.ts", "await runCreativeMissionRegularization"],
  ])("guards %s before its atomic write path", (filename, writeMarker) => {
    const source = readFileSync(join(process.cwd(), "scripts", filename), "utf8");
    const modeGuard = source.indexOf("if (!mode.apply)");
    const confirmation = source.indexOf("confirmInteractiveApply(mode)");
    const write = source.indexOf(writeMarker);

    expect(modeGuard).toBeGreaterThan(-1);
    expect(confirmation).toBeGreaterThan(modeGuard);
    expect(write).toBeGreaterThan(confirmation);
    expect(source).toContain("resolvePostgresTarget()");
  });
});
