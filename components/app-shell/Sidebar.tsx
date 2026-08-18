"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { mainNavigation, secondaryNavigation } from "./data";
import { ChevronDown, iconByName, LayoutGrid, X } from "./icons";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

type SidebarProps = {
  pathname: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userRole?: string | null;
  userIsAthlete?: boolean;
  userIsMedia?: boolean;
  userName?: string | null;
};

function NavigationSection({
  items,
  pathname,
  collapsed,
  group,
  onNavigate,
}: {
  items: typeof mainNavigation;
  pathname: string;
  collapsed: boolean;
  group: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {!collapsed ? <p className="sidebar-group-label">{group}</p> : null}
      <ul className="sidebar-nav-list">
        {items.map((item) => {
          const Icon = iconByName[item.icon];
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.href === "/today" && pathname === "/");
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={active ? "sidebar-link is-active" : "sidebar-link"}
                title={collapsed ? item.label : undefined}
                data-tooltip={collapsed ? item.label : undefined}
                onClick={onNavigate}
              >
                <span className="sidebar-link-icon-wrap" aria-hidden>
                  <Icon className="app-icon" />
                </span>
                {!collapsed ? <span>{item.label}</span> : null}
                {!collapsed && item.badge ? <small>{item.badge}</small> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Sidebar({
  pathname,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  userRole,
  userIsAthlete,
  userIsMedia,
  userName,
}: SidebarProps) {
  const { signOut } = useClerk();
  const profileMenuRootRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [profileMenuPosition, setProfileMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const isAthlete = userIsAthlete ?? userRole === "athlete";
  const isMedia = (userIsMedia ?? userRole === "media") && !isAthlete;
  const profileName = isAthlete || isMedia ? (userName ?? "Compte Clerk") : "Sebastien Mory";
  const profileLabel = isAthlete ? "Athlète" : isMedia ? "Média" : "Administrateur";
  const visibleMainNavigation = isAthlete
    ? [
        { id: "today", label: "Aujourd’hui", href: "/athlete", icon: "house" as const },
        { id: "profile", label: "Mon profil", href: "/athlete/profile", icon: "users" as const },
        { id: "pass", label: "Mon Pass KLIQUE", href: "/athlete/pass", icon: "sparkles" as const },
        { id: "opportunities", label: "Opportunités", href: "/athlete/opportunities", icon: "folder" as const },
        { id: "ecosystem", label: "Écosystème", href: "/athlete/ecosysteme", icon: "network" as const },
        { id: "community", label: "Communauté", href: "/athlete/community", icon: "messages" as const },
        { id: "contact", label: "Contacter KLIQUE", href: "/athlete/contact", icon: "messages" as const },
      ]
    : isMedia
      ? [{ id: "contents", label: "Contenus", href: "/contents", icon: "contents" as const }]
      : mainNavigation;

  const visibleSecondaryNavigation = isAthlete || isMedia ? [] : secondaryNavigation;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!profileMenuRootRef.current) return;
      if (!profileMenuRootRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    const updatePosition = () => {
      const trigger = profileTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 240;
      const spacing = 8;
      const left = Math.max(spacing, rect.right - menuWidth);
      const top = Math.max(spacing, rect.top - spacing);
      setProfileMenuPosition({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isProfileMenuOpen]);

  return (
    <>
      <aside className={collapsed ? "klique-sidebar is-collapsed" : "klique-sidebar"}>
        <div className="sidebar-top-row">
          <Link href="/" className="klique-logo" aria-label="Accueil KLIQUE">
            <span>●</span>
            {!collapsed ? <strong>KLIQUE</strong> : null}
          </Link>

          <button
            type="button"
            className="sidebar-collapse"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Agrandir la sidebar" : "Reduire la sidebar"}
          >
            <LayoutGrid className="app-icon" />
          </button>
        </div>

        <WorkspaceSwitcher collapsed={collapsed} />

        <nav aria-label="Navigation principale" className="sidebar-nav-block">
          <NavigationSection
            items={visibleMainNavigation}
            pathname={pathname}
            collapsed={collapsed}
            group="Navigation"
          />
        </nav>

        {!isAthlete && !isMedia ? (
          <nav aria-label="Navigation secondaire" className="sidebar-nav-block sidebar-nav-secondary">
            <NavigationSection
              items={visibleSecondaryNavigation}
              pathname={pathname}
              collapsed={collapsed}
              group="Espace"
            />
          </nav>
        ) : null}

        <div className="header-dropdown" ref={profileMenuRootRef}>
          <button
            ref={profileTriggerRef}
            type="button"
            className="sidebar-profile"
            title={collapsed ? profileName : undefined}
            data-tooltip={collapsed ? profileName : undefined}
            aria-label="Profil utilisateur"
            aria-haspopup="menu"
            aria-expanded={isProfileMenuOpen}
            onClick={() => setIsProfileMenuOpen((value) => !value)}
          >
            <span className="user-avatar" aria-hidden>
              SM
            </span>
            {!collapsed ? (
              <span className="user-meta">
                <strong>{profileName}</strong>
                <small>{profileLabel}</small>
              </span>
            ) : null}
            {!collapsed ? <ChevronDown className="app-icon sidebar-profile-chevron" /> : null}
          </button>

          {isProfileMenuOpen && profileMenuPosition ? (
            <div
              className="header-menu user-menu"
              role="menu"
              aria-label="Menu utilisateur"
              style={{
                position: "fixed",
                top: profileMenuPosition.top,
                left: profileMenuPosition.left,
                transform: "translateY(-100%)",
                width: "240px",
                zIndex: 9999,
              }}
            >
              <ul>
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    onClick={async () => {
                      await signOut({ redirectUrl: "/sign-in" });
                    }}
                  >
                    <span>Se déconnecter</span>
                  </button>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      </aside>

      {mobileOpen ? (
        <div className="mobile-sidebar-layer" role="presentation">
          <button
            type="button"
            className="mobile-overlay"
            onClick={onCloseMobile}
            aria-label="Fermer le menu"
          />
          <aside className="mobile-sidebar-drawer" aria-label="Navigation mobile">
            <header>
              <Link href="/" className="klique-logo" aria-label="Accueil KLIQUE" onClick={onCloseMobile}>
                <span>●</span>
                <strong>KLIQUE</strong>
              </Link>
              <button type="button" className="header-icon-button" onClick={onCloseMobile} aria-label="Fermer">
                <X className="app-icon" />
              </button>
            </header>

            <WorkspaceSwitcher />

            <nav aria-label="Navigation principale" className="sidebar-nav-block">
              <NavigationSection
                items={visibleMainNavigation}
                pathname={pathname}
                collapsed={false}
                group="Navigation"
                onNavigate={onCloseMobile}
              />
            </nav>

            {!isAthlete && !isMedia ? (
              <nav aria-label="Navigation secondaire" className="sidebar-nav-block sidebar-nav-secondary">
                <NavigationSection
                  items={visibleSecondaryNavigation}
                  pathname={pathname}
                  collapsed={false}
                  group="Espace"
                  onNavigate={onCloseMobile}
                />
              </nav>
            ) : null}
          </aside>
        </div>
      ) : null}
    </>
  );
}
