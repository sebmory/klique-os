import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_SESSION_COOKIE,
  areAccessCredentialsValid,
  buildAccessSessionToken,
  getAccessPassword,
  getAccessUser,
  isAccessProtectionConfigured,
} from "@/lib/server-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LoginBody = {
  user?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  if (!isAccessProtectionConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Protection d acces non configuree sur le serveur." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as LoginBody;
  const user = String(body.user ?? "").trim();
  const password = String(body.password ?? "").trim();

  if (!areAccessCredentialsValid(user, password)) {
    return NextResponse.json({ ok: false, message: "Identifiants invalides." }, { status: 401 });
  }

  const token = await buildAccessSessionToken(getAccessUser(), getAccessPassword());
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ACCESS_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
