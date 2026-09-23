import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { getCurrentUserAccessProfile } from "@/lib/clerk-access/service";
import { isAthleteVisibleToExternalRoles } from "@/lib/public-athletes";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/internal/partner-application-sync",
  "/__clerk/(.*)",
]);

const accessPendingPath = "/access-pending";

const isApiRoute = (pathname: string): boolean => pathname === "/api" || pathname.startsWith("/api/");

export const isAdminPartnerBenefitReservationAuditApi = (pathname: string, method: string): boolean =>
  pathname === "/api/admin/partner-benefit-reservations" && method === "GET";

export const isPartnerApplicationSyncWebhook = (pathname: string, method: string): boolean =>
  pathname === "/api/internal/partner-application-sync" && method === "POST";

export const isAthleteAllowedRoute = (pathname: string, method: string): boolean => {
  if (pathname === "/api/notifications") {
    return method === "GET" || method === "PATCH";
  }

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

  // L athlete lit ses journees media et repond a l invitation : aucune autre action.
  if (pathname === "/api/media-days") {
    return method === "GET" || method === "PATCH";
  }

  if (pathname === "/api/athlete/subscription") {
    return method === "GET";
  }

  if (pathname === "/api/athlete/subscription/content-requests") {
    return method === "GET" || method === "POST";
  }

  if (pathname === "/api/athlete/membership-order") {
    return method === "GET" || method === "POST" || method === "DELETE";
  }

  if (pathname === "/api/athlete/partner-benefits") {
    return method === "GET" || method === "POST";
  }

  if (/^\/api\/athlete\/partner-benefit-reservations\/[^/]+$/.test(pathname)) {
    return method === "PATCH";
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

export const isMediaAllowedRoute = (pathname: string): boolean =>
  pathname === "/contents"
  || pathname === "/contents/create"
  || pathname === "/contents/create/result"
  || pathname === "/media-desk"
  || /^\/media-desk\/[^/]+$/.test(pathname)
  || pathname === "/media/athletes"
  || /^\/media\/athletes\/[^/]+$/.test(pathname);

// Le media consulte les sujets en lecture seule : toute ecriture reste reservee a l Admin.
export const isMediaAllowedApi = (pathname: string, method: string): boolean => {
  if (pathname === "/api/clerk/access") return method === "GET";
  if (pathname === "/api/notifications") return method === "GET" || method === "PATCH";
  if (pathname === "/api/media-subjects") return method === "GET";
  if (/^\/api\/media-subjects\/[^/]+$/.test(pathname)) return method === "GET";
  if (pathname === "/api/media-requests") return method === "GET" || method === "POST";
  if (pathname === "/api/media-bank") return method === "GET";
  if (pathname === "/api/ai-credits/balance") return method === "GET";
  if (pathname === "/api/media-subscriptions") return method === "GET";
  if (pathname === "/api/media/athletes") return method === "GET";
  if (/^\/api\/media\/athletes\/[^/]+$/.test(pathname)) return method === "GET";
  if (pathname === "/api/content/generate") return method === "POST";
  if (pathname === "/api/context/collect") return method === "POST";
  if (pathname === "/api/contents/generate/article") return method === "POST";
  if (pathname === "/api/contents/storage/drafts") return method === "GET" || method === "POST";
  if (/^\/api\/contents\/storage\/drafts\/[^/]+$/.test(pathname)) {
    return method === "GET" || method === "PATCH";
  }
  if (pathname === "/api/contents/storage/variants") return method === "GET" || method === "POST";
  if (/^\/api\/contents\/storage\/variants\/[^/]+$/.test(pathname)) return method === "GET";
  if (pathname === "/api/contents/storage/sessions") return method === "POST";
  if (/^\/api\/contents\/storage\/sessions\/[^/]+$/.test(pathname)) return method === "GET";

  return false;
};

export const isPartnerAllowedPage = (pathname: string): boolean => {
  return pathname === "/partner"
    || pathname === "/partner/athletes"
    || pathname === "/partner/benefit-reservations"
    || pathname === "/partner/community"
    || pathname === "/partner/contact-requests"
    || /^\/partner\/athletes\/[^/]+$/.test(pathname);
};

export const isPartnerAllowedApi = (pathname: string, method: string): boolean => {
  return (pathname === "/api/notifications" && (method === "GET" || method === "PATCH"))
    || pathname === "/api/clerk/access"
    || pathname === "/api/partners"
    || (pathname === "/api/partner/community" && method === "GET")
    || (pathname === "/api/partner/opportunities" && method === "GET")
    || (pathname === "/api/partner/benefits" && method === "GET")
    || (pathname === "/api/partner/benefit-reservations" && method === "GET")
    || (/^\/api\/partner\/benefit-reservations\/[^/]+$/.test(pathname) && method === "PATCH")
    || (pathname === "/api/partner/resources" && method === "GET")
    || (/^\/api\/partner\/resources\/[^/]+$/.test(pathname) && method === "GET")
    || (pathname === "/api/partner/contact-requests" && (method === "GET" || method === "POST"))
    || pathname === "/api/partner/athletes"
    || /^\/api\/partner\/athletes\/[^/]+$/.test(pathname);
};

export const isHiddenExternalAthleteProfileRoute = (pathname: string): boolean => {
  const match = /^\/(?:partner|media)\/athletes\/([^/]+)$/.exec(pathname);
  if (!match) return false;

  try {
    return !isAthleteVisibleToExternalRoles(decodeURIComponent(match[1]));
  } catch {
    return false;
  }
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

      const adminAuditPath = "/api/admin/partner-benefit-reservations";
      if (
        access.role === "admin"
        && (pathname === adminAuditPath || pathname.startsWith(`${adminAuditPath}/`))
        && !isAdminPartnerBenefitReservationAuditApi(pathname, request.method)
      ) {
        return apiAccessDenied();
      }

      if (access.role === "athlete" && !isAthleteAllowedRoute(pathname, request.method)) {
        return isApiRoute(pathname)
          ? apiAccessDenied()
          : NextResponse.redirect(new URL("/athlete", request.url));
      }

      if (access.role === "partner_expert") {
        if (isHiddenExternalAthleteProfileRoute(pathname)) {
          return new NextResponse(null, { status: 404 });
        }
        if (isApiRoute(pathname) && !isPartnerAllowedApi(pathname, request.method)) {
          return apiAccessDenied();
        }
        if (!isApiRoute(pathname) && !isPartnerAllowedPage(pathname)) {
          return NextResponse.redirect(new URL("/partner", request.url));
        }
      }

      // Les routes API conservent leurs propres controles : jamais de redirection HTML.
      if (access.role === "media") {
        if (isHiddenExternalAthleteProfileRoute(pathname)) {
          return new NextResponse(null, { status: 404 });
        }
        const isMediaAthleteDirectory = pathname === "/media/athletes"
          || /^\/media\/athletes\/[^/]+$/.test(pathname)
          || pathname === "/api/media/athletes"
          || /^\/api\/media\/athletes\/[^/]+$/.test(pathname);
        if (isMediaAthleteDirectory && !access.mediaId?.trim()) {
          return isApiRoute(pathname)
            ? apiAccessDenied()
            : NextResponse.redirect(new URL(accessPendingPath, request.url));
        }
        if (isApiRoute(pathname)) {
          if (!isMediaAllowedApi(pathname, request.method)) {
            return apiAccessDenied();
          }
        } else if (!isMediaAllowedRoute(pathname)) {
          return NextResponse.redirect(new URL("/media-desk", request.url));
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