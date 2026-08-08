import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_SESSION_COOKIE,
  isAccessProtectionConfigured,
  isAccessSessionValid,
} from "@/lib/server-access";

const hasStaticAssetExtension = (pathname: string): boolean => {
  return /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$/i.test(pathname);
};

const isPublicPath = (pathname: string): boolean => {
  if (pathname === "/login") return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (hasStaticAssetExtension(pathname)) return true;
  return false;
};

const redirectToLogin = (request: NextRequest, reason?: "config"): NextResponse => {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  if (reason) {
    loginUrl.searchParams.set("reason", reason);
  }
  return NextResponse.redirect(loginUrl);
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isAccessProtectionConfigured()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Protection d acces non configuree sur le serveur." },
        { status: 503 }
      );
    }
    return redirectToLogin(request, "config");
  }

  const token = request.cookies.get(ACCESS_SESSION_COOKIE)?.value;
  const isValidSession = await isAccessSessionValid(token);

  if (isValidSession) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  return redirectToLogin(request);
}

export const config = {
  matcher: ["/:path*"],
};
