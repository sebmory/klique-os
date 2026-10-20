import { describe, expect, it, vi } from "vitest";
import { schedulePartnerIntroductionOutboxAfterResponse } from "@/lib/partner-athlete-introductions/outbox-after-response";

describe("partner introduction outbox after response", () => {
  it("does not schedule work while the workflow is disabled", () => {
    const schedule = vi.fn();

    schedulePartnerIntroductionOutboxAfterResponse({
      enabled: () => false,
      schedule,
      process: vi.fn(),
    });

    expect(schedule).not.toHaveBeenCalled();
  });

  it("rechecks activation and contains processor failures after scheduling", async () => {
    let enabled = true;
    let task: (() => Promise<void>) | null = null;
    const process = vi.fn().mockRejectedValue(new Error("private notification detail"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    schedulePartnerIntroductionOutboxAfterResponse({
      enabled: () => enabled,
      schedule: (scheduledTask) => {
        task = scheduledTask;
      },
      process,
    });

    expect(task).not.toBeNull();
    await expect(task!()).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledWith(
      "[partner_athlete_introduction_outbox] source=after_response execution=failed",
    );
    expect(warning).not.toHaveBeenCalledWith(expect.stringContaining("private notification detail"));

    enabled = false;
    process.mockClear();
    await expect(task!()).resolves.toBeUndefined();
    expect(process).not.toHaveBeenCalled();

    warning.mockRestore();
  });
});
