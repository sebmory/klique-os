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

export const isAthleteAllowedRoute = (pathname: string, method: string): boolean => {
  // Lecture seule des ressources du Hub : la creation et la couverture restent reservees a l Admin.
  if (pathname === "/api/hub-resources" && method === "GET") {
    return true;
  }

  // L athlete lit ses demandes media liees et repond au consentement : aucune autre action.
  if (pathname === "/api/media-requests") {
    return method === "GET" || method === "PATCH";
  }

  // L athlete consulte uniquement ses propres lots medias.
  if (pathname === "/api/athlete-media-bank") {
    return method === "GET";
  }

  if (
    pathname === "/athlete/services"
    || pathname === "/api/athlete/services"
    || pathname === "/api/athlete/service-requests"
    || pathname === "/api/athlete/klique-visibility"
  ) {
    return true;
  }

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

export const isMediaAllowedRoute = (pathname: string): boolean => {
  if (pathname === "/contents" || pathname.startsWith("/contents/")) {
    return true;
  }

  if (pathname === "/media-desk" || pathname.startsWith("/media-desk/")) {
    return true;
  }

  return false;
};

const isMediaSubjectsApi = (pathname: string): boolean =>
  pathname === "/api/media-subjects" || pathname.startsWith("/api/media-subjects/");

// Le media consulte les sujets en lecture seule : toute ecriture reste reservee a l Admin.
export const isMediaAllowedApi = (pathname: string, method: string): boolean => {
  if (isMediaSubjectsApi(pathname)) {
    return method === "GET";
  }

  if (pathname === "/api/media-bank") {
    return method === "GET";
  }

  return true;
};

export const isPartnerAllowedPage = (pathname: string): boolean => {
  return pathname === "/partner"
    || pathname === "/partner/athletes"
    || /^\/partner\/athletes\/[^/]+$/.test(pathname);
};

export const isPartnerAllowedApi = (pathname: string, method: string): boolean => {
  return pathname === "/api/clerk/access"
    || pathname === "/api/partners"
    || (pathname === "/api/partner/contact-requests" && method === "POST")
    || pathname === "/api/partner/athletes"
    || /^\/api\/partner\/athletes\/[^/]+$/.test(pathname);
};

const apiAccessDenied = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 });

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
          (access.role === "athlete" && Boolean(access.athleteId?.trim())) ||
          (access.role === "partner_expert" && Boolean(access.partnerId?.trim())));

      if (!hasActiveAccess) {
        return isApiRoute(pathname)
          ? NextResponse.next()
          : NextResponse.redirect(new URL(accessPendingPath, request.url));
      }

      if (access.role === "athlete" && !isAthleteAllowedRoute(pathname, request.method)) {
        return isApiRoute(pathname)
          ? apiAccessDenied()
          : NextResponse.redirect(new URL("/athlete", request.url));
      }

      if (access.role === "partner_expert") {
        if (isApiRoute(pathname) && !isPartnerAllowedApi(pathname, request.method)) {
          return apiAccessDenied();
        }
        if (!isApiRoute(pathname) && !isPartnerAllowedPage(pathname)) {
          return NextResponse.redirect(new URL("/partner", request.url));
        }
      }

      // Les routes API conservent leurs propres controles : jamais de redirection HTML.
      if (access.role === "media") {
        if (isApiRoute(pathname)) {
          if (!isMediaAllowedApi(pathname, request.method)) {
            return apiAccessDenied();
          }
        } else if (!isMediaAllowedRoute(pathname)) {
          return NextResponse.redirect(new URL("/contents", request.url));
        }
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