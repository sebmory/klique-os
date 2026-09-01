"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/app-shell/Header";
import { Sidebar } from "@/components/app-shell/Sidebar";

type AppShellProps = {
  children: ReactNode;
};

type ClerkUserAccessState = {
  role: string | null;
  isAthlete: boolean;
  athleteId: string | null;
  partnerId: string | null;
  workspaceId: string | null;
  status: string | null;
  clerkDisplayName: string | null;
  partnerProfileLabel: "Expert" | "Partenaire" | "Partenaire / Expert" | null;
};

type AccessLoadStatus = "loading" | "authorized" | "denied";

const sidebarStorageKey = "klique-sidebar-collapsed";

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const isPublicAuthRoute = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isAccessPendingRoute = pathname === "/access-pending";
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(sidebarStorageKey) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userAccess, setUserAccess] = useState<ClerkUserAccessState>({
    role: null,
    isAthlete: false,
    athleteId: null,
    partnerId: null,
    workspaceId: null,
    status: null,
    clerkDisplayName: null,
    partnerProfileLabel: null,
  });
  const [accessLoadStatus, setAccessLoadStatus] = useState<AccessLoadStatus>("loading");

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (isPublicAuthRoute || isAccessPendingRoute) {
      return;
    }

    let cancelled = false;

    const loadUserAccess = async () => {
      setAccessLoadStatus("loading");

      const denyAccess = () => {
        if (cancelled) return;
        setAccessLoadStatus("denied");
        router.replace("/access-pending");
      };

      try {
        const response = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!response.ok) {
          denyAccess();
          return;
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        const access = data?.userAccess ?? null;
        const hasWorkspace = typeof access?.workspaceId === "string" && access.workspaceId.trim().length > 0;
        const hasActiveAccess =
          access?.status === "active" &&
          hasWorkspace &&
          (access?.role === "admin" ||
            access?.role === "media" ||
            (access?.role === "athlete" && typeof access?.athleteId === "string" && access.athleteId.trim().length > 0) ||
            (access?.role === "partner_expert" && typeof access?.partnerId === "string" && access.partnerId.trim().length > 0));

        if (!hasActiveAccess) {
          denyAccess();
          return;
        }

        const resolvedDisplayName =
          user?.fullName ||
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.primaryEmailAddress?.emailAddress ||
          user?.emailAddresses?.[0]?.emailAddress ||
          data?.clerkUser?.email ||
          data?.clerkUser?.id ||
          null;

        let partnerProfileLabel: ClerkUserAccessState["partnerProfileLabel"] = null;
        if (access?.role === "partner_expert") {
          try {
            const partnerResponse = await fetch("/api/partners", { credentials: "include", cache: "no-store" });
            if (partnerResponse.ok) {
              const partnerPayload = await partnerResponse.json();
              const ownPartner = Array.isArray(partnerPayload?.partners) ? partnerPayload.partners[0] : null;
              const type = String(ownPartner?.type ?? ownPartner?.relationType ?? "").trim().toLowerCase();
              partnerProfileLabel = ownPartner?.expertKlique || type.includes("expert")
                ? "Expert"
                : type.includes("partenaire")
                  ? "Partenaire"
                  : "Partenaire / Expert";
            }
          } catch {
            partnerProfileLabel = "Partenaire / Expert";
          }
        }

        setUserAccess({
          role: access?.role ?? null,
          isAthlete: Boolean(data?.permissions?.isAthlete && data?.permissions?.isActive),
          athleteId: access?.athleteId ?? null,
          partnerId: access?.partnerId ?? null,
          workspaceId: access?.workspaceId ?? null,
          status: access?.status ?? null,
          clerkDisplayName: resolvedDisplayName,
          partnerProfileLabel,
        });
        setAccessLoadStatus("authorized");
      } catch {
        denyAccess();
      }
    };

    loadUserAccess();

    return () => {
      cancelled = true;
    };
  }, [isAccessPendingRoute, isPublicAuthRoute, router, user?.id]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  if (isPublicAuthRoute || isAccessPendingRoute) {
    return <>{children}</>;
  }

  if (accessLoadStatus !== "authorized") {
    return null;
  }

  return (
    <div className={collapsed ? "klique-app is-collapsed" : "klique-app"}>
      <Sidebar
        pathname={pathname}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        userRole={userAccess.role}
        userIsAthlete={userAccess.isAthlete}
        userIsMedia={userAccess.role === "media" && userAccess.status === "active"}
        userIsPartner={userAccess.role === "partner_expert" && userAccess.status === "active"}
        userPartnerLabel={userAccess.partnerProfileLabel}
        userName={userAccess.clerkDisplayName}
      />

      <div className="klique-main-layout">
        <Header
          pathname={pathname}
          onOpenMobileSidebar={() => setMobileOpen(true)}
          isAdmin={userAccess.role === "admin"}
          isAthlete={userAccess.role === "athlete"}
        />
        <main className="klique-main-content">{children}</main>
      </div>
    </div>
  );
}
