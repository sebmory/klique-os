"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Header } from "@/components/app-shell/Header";
import { Sidebar } from "@/components/app-shell/Sidebar";

type AppShellProps = {
  children: ReactNode;
};

type ClerkUserAccessState = {
  role: string | null;
  isAthlete: boolean;
  athleteId: string | null;
  workspaceId: string | null;
  status: string | null;
  clerkDisplayName: string | null;
};

const sidebarStorageKey = "klique-sidebar-collapsed";

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const isPublicAuthRoute = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(sidebarStorageKey) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userAccess, setUserAccess] = useState<ClerkUserAccessState>({
    role: null,
    isAthlete: false,
    athleteId: null,
    workspaceId: null,
    status: null,
    clerkDisplayName: null,
  });

  useEffect(() => {
    window.localStorage.setItem(sidebarStorageKey, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    let cancelled = false;

    const loadUserAccess = async () => {
      try {
        const response = await fetch("/api/clerk/access", { credentials: "include", cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        const access = data?.userAccess ?? null;
        const resolvedDisplayName =
          user?.fullName ||
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.primaryEmailAddress?.emailAddress ||
          user?.emailAddresses?.[0]?.emailAddress ||
          data?.clerkUser?.email ||
          data?.clerkUser?.id ||
          null;

        setUserAccess({
          role: access?.role ?? null,
          isAthlete: Boolean(data?.permissions?.isAthlete && data?.permissions?.isActive),
          athleteId: access?.athleteId ?? null,
          workspaceId: access?.workspaceId ?? null,
          status: access?.status ?? null,
          clerkDisplayName: resolvedDisplayName,
        });
      } catch {
        if (!cancelled) {
          setUserAccess({
            role: null,
            isAthlete: false,
            athleteId: null,
            workspaceId: null,
            status: null,
            clerkDisplayName: null,
          });
        }
      }
    };

    loadUserAccess();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  if (isPublicAuthRoute) {
    return <>{children}</>;
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
        userName={userAccess.clerkDisplayName}
      />

      <div className="klique-main-layout">
        <Header
          pathname={pathname}
          onOpenMobileSidebar={() => setMobileOpen(true)}
        />
        <main className="klique-main-content">{children}</main>
      </div>
    </div>
  );
}
