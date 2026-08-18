import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/auth/login",
  "/api/auth/logout",
  "/__clerk/(.*)",
]);

const accessPendingPath = "/access-pending";

const isApiRoute = (pathname: string): boolean => pathname === "/api" || pathname.startsWith("/api/");

const isAthleteAllowedRoute = (pathname: string): boolean => {
  if (pathname === "/athlete" || pathname.startsWith("/athlete/")) {
    return true;
  }

  if (pathname === "/athlete/community" || pathname.startsWith("/athlete/community/")) {
    return true;
  }

  if (pathname === "/api/clerk/access" || pathname.startsWith("/api/clerk/access/")) {
    return true;
  }

  if (pathname === "/api/athletes" || pathname.startsWith("/api/athletes/")) {
    return true;
  }

  if (pathname === "/api/partners" || pathname.startsWith("/api/partners/")) {
    return true;
  }

  if (pathname === "/api/athlete-distinctions" || pathname.startsWith("/api/athlete-distinctions/")) {
    return true;
  }

  if (pathname === "/api/contact-requests" || pathname.startsWith("/api/contact-requests/")) {
    return true;
  }

  if (pathname === "/api/hub-opportunities" || pathname.startsWith("/api/hub-opportunities/")) {
    return true;
  }

  if (pathname === "/api/hub-opportunity-slots" || pathname.startsWith("/api/hub-opportunity-slots/")) {
    return true;
  }

  if (pathname === "/api/hub-community" || pathname.startsWith("/api/hub-community/")) {
    return true;
  }

  return false;
};

const isMediaAllowedRoute = (pathname: string): boolean => {
  if (pathname === "/contents" || pathname.startsWith("/contents/")) {
    return true;
  }

  return false;
};

export default clerkMiddleware(
  async (auth, request: NextRequest) => {
    if (isPublicRoute(request)) {
      return NextResponse.next();
    }

    await auth.protect();

    const { pathname } = request.nextUrl;
    if (pathname === accessPendingPath) {
      return NextResponse.next();
    }

    try {
      const profile = await getCurrentUserAccessProfile(request);
      const access = profile?.userAccess;
      const hasWorkspace = Boolean(access?.workspaceId?.trim());
      const hasActiveAccess =
        access?.status === "active" &&
        hasWorkspace &&
        (access.role === "admin" ||
          access.role === "media" ||
          (access.role === "athlete" && Boolean(access.athleteId?.trim())));

      if (!hasActiveAccess) {
        return isApiRoute(pathname)
          ? NextResponse.next()
          : NextResponse.redirect(new URL(accessPendingPath, request.url));
      }

      if (access.role === "athlete" && !isAthleteAllowedRoute(pathname)) {
        return NextResponse.redirect(new URL("/athlete", request.url));
      }

      // Les routes API conservent leurs propres controles : jamais de redirection HTML.
      if (access.role === "media" && !isApiRoute(pathname) && !isMediaAllowedRoute(pathname)) {
        return NextResponse.redirect(new URL("/contents", request.url));
      }
    } catch {
      return isApiRoute(pathname)
        ? NextResponse.next()
        : NextResponse.redirect(new URL(accessPendingPath, request.url));
    }

    return NextResponse.next();
  },
  {
    signInUrl: "/sign-in",
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};