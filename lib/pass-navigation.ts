export type PublicPassPlanCode = "essential" | "impact" | "signature";

const passPlanCodes = new Set<PublicPassPlanCode>(["essential", "impact", "signature"]);

export const parsePublicPassPlanCode = (value: unknown): PublicPassPlanCode | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" && passPlanCodes.has(candidate as PublicPassPlanCode)
    ? candidate as PublicPassPlanCode
    : null;
};

export const buildJoinPassUrl = (planCode: PublicPassPlanCode): string =>
  `/join/pass?plan=${encodeURIComponent(planCode)}`;

export const resolvePassAuthRedirect = (value: unknown): string | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string" || !candidate.startsWith("/")) return null;

  try {
    const url = new URL(candidate, "https://app.klique.ch");
    if (url.origin !== "https://app.klique.ch" || url.pathname !== "/join/pass") return null;
    if ([...url.searchParams.keys()].some((key) => key !== "plan")) return null;
    const planCode = parsePublicPassPlanCode(url.searchParams.get("plan"));
    return planCode ? buildJoinPassUrl(planCode) : "/join/pass";
  } catch {
    return null;
  }
};