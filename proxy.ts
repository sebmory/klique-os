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

  return false;
};

export default clerkMiddleware(
  async (auth, request: NextRequest) => {
    if (isPublicRoute(request)) {
      return NextResponse.next();
    }

    await auth.protect();

    const profile = await getCurrentUserAccessProfile(request);
    const role = profile?.userAccess?.role;

    if (role === "athlete") {
      const { pathname } = request.nextUrl;
      if (!isAthleteAllowedRoute(pathname)) {
        return NextResponse.redirect(new URL("/athlete", request.url));
      }
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