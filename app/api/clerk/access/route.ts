import { NextResponse } from "next/server";
import { bootstrapCurrentUserAsAdmin, getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const profile = await getCurrentUserAccessProfile(request);
  if (!profile) {
    return NextResponse.json({ ok: false, message: "Utilisateur Clerk non connecte." }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    clerkUser: profile.clerkUser,
    userAccess: profile.userAccess,
  });
}

export async function POST(request: Request) {
  try {
    const access = await bootstrapCurrentUserAsAdmin(request);
    if (!access) {
      return NextResponse.json({ ok: false, message: "Utilisateur Clerk non connecte." }, { status: 401 });
    }

    return NextResponse.json({ ok: true, userAccess: access });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Acces refuse.";
    return NextResponse.json({ ok: false, message }, { status: message === "Forbidden" ? 403 : 500 });
  }
}
