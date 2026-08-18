import { NextResponse } from "next/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export type ContentAccessRole = "admin" | "media";

export type ContentAccessContext = {
  clerkUserId: string;
  workspaceId: string;
  role: ContentAccessRole;
  isAdmin: boolean;
};

export class ContentAccessError extends Error {
  constructor(public readonly code: "UNAUTHORIZED" | "FORBIDDEN") {
    super(code);
    this.name = "ContentAccessError";
  }
}

// Le workspace et l identite proviennent uniquement de la session Clerk et de user_access.
export const requireContentAccess = async (request: Request): Promise<ContentAccessContext> => {
  const profile = await getCurrentUserAccessProfile(request);
  const clerkUserId = profile?.clerkUser?.id?.trim() ?? "";

  if (!clerkUserId) {
    throw new ContentAccessError("UNAUTHORIZED");
  }

  const access = profile?.userAccess ?? null;
  const workspaceId = access?.workspaceId?.trim() ?? "";
  const role = access?.role ?? "";

  if (access?.status !== "active" || !workspaceId || (role !== "admin" && role !== "media")) {
    throw new ContentAccessError("FORBIDDEN");
  }

  return {
    clerkUserId,
    workspaceId,
    role,
    isAdmin: role === "admin",
  };
};

export const contentAccessErrorResponse = (error: unknown): NextResponse | null => {
  if (!(error instanceof ContentAccessError)) return null;

  return error.code === "UNAUTHORIZED"
    ? NextResponse.json({ ok: false, message: "Authentification requise." }, { status: 401 })
    : NextResponse.json({ ok: false, message: "Acces refuse." }, { status: 403 });
};
