"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import {
  adminCreativeNavigationGroup,
  adminNavigationGroups,
  type NavGroup,
  type NavItem,
} from "./data";
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
  userIsPartner?: boolean;
  userIsCreative?: boolean;
  userPartnerLabel?: "Expert" | "Partenaire" | "Partenaire / Expert" | null;
  userName?: string | null;
};

function NavigationSection({
  items,
  pathname,
  collapsed,
  group,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  group: string;
  onNavigate?: () => void;
}) {
  const matchingItems = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length);
  const activeItemId = matchingItems[0]?.id ?? null;

  return (
    <>
      {!collapsed ? <p className="sidebar-group-label">{group}</p> : null}
      <ul className="sidebar-nav-list">
        {items.map((item) => {
          const Icon = iconByName[item.icon];
          const active = item.id === activeItemId;
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

const getActiveAdminGroupId = (groups: NavGroup[], pathname: string): string | null => {
  const matches = groups
    .flatMap((group) => group.items.map((item) => ({ groupId: group.id, href: item.href })))
    .filter((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
    .sort((left, right) => right.href.length - left.href.length);
  return matches[0]?.groupId ?? null;
};

function AdminNavigation({
  groups,
  pathname,
  collapsed,
  idPrefix,
  onNavigate,
  onExpandCollapsed,
}: {
  groups: NavGroup[];
  pathname: string;
  collapsed: boolean;
  idPrefix: string;
  onNavigate?: () => void;
  onExpandCollapsed?: () => void;
}) {
  const activeGroupId = getActiveAdminGroupId(groups, pathname);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroupId ? [activeGroupId] : []),
  );

  return (
    <ul className="sidebar-nav-groups">
      {groups.map((group) => {
        const GroupIcon = iconByName[group.icon];
        const isOpen = openGroups.has(group.id);
        const containsActiveRoute = activeGroupId === group.id;
        const submenuId = `${idPrefix}-sidebar-group-${group.id}`;
        const triggerClassName = [
          "sidebar-group-trigger",
          containsActiveRoute ? "is-active" : "",
          isOpen ? "is-open" : "",
        ].filter(Boolean).join(" ");

        return (
          <li key={group.id} className="sidebar-nav-group">
            <button
              type="button"
              className={triggerClassName}
              aria-expanded={!collapsed && isOpen}
              aria-controls={submenuId}
              title={collapsed ? group.label : undefined}
              data-tooltip={collapsed ? group.label : undefined}
              onClick={() => {
                if (collapsed) {
                  onExpandCollapsed?.();
                  setOpenGroups((current) => new Set([...current, group.id]));
                  return;
                }
                setOpenGroups((current) => {
                  const next = new Set(current);
                  if (next.has(group.id)) next.delete(group.id);
                  else next.add(group.id);
                  return next;
                });
              }}
            >
              <span className="sidebar-link-icon-wrap" aria-hidden>
                <GroupIcon className="app-icon" />
              </span>
              {!collapsed ? <span>{group.label}</span> : null}
              {!collapsed ? (
                <ChevronDown className={isOpen ? "app-icon sidebar-group-chevron is-open" : "app-icon sidebar-group-chevron"} />
              ) : null}
            </button>

            {!collapsed && isOpen ? (
              <div id={submenuId} className="sidebar-group-items">
                <NavigationSection
                  items={group.items}
                  pathname={pathname}
                  collapsed={false}
                  group=""
                  onNavigate={onNavigate}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
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
  userIsPartner,
  userIsCreative,
  userPartnerLabel,
  userName,
}: SidebarProps) {
  const { signOut } = useClerk();
  const profileMenuRootRef = useRef<HTMLDivElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [profileMenuPosition, setProfileMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const isAthlete = userIsAthlete ?? userRole === "athlete";
  const isMedia = (userIsMedia ?? userRole === "media") && !isAthlete;
  const isPartner = (userIsPartner ?? userRole === "partner_expert") && !isAthlete && !isMedia;
  const isCreative = (userIsCreative ?? userRole === "creative") && !isAthlete && !isMedia && !isPartner;
  const isCreativeOnly = isCreative && userRole !== "admin";
  const isAdmin = userRole === "admin" || (!userRole && !isAthlete && !isMedia && !isPartner && !isCreativeOnly);
  const profileName = userName?.trim() || "Compte Clerk";
  const profileLabel = isAthlete
    ? "Athlète"
    : isMedia
      ? "Média"
      : isPartner
        ? (userPartnerLabel ?? "Partenaire / Expert")
        : isCreativeOnly
          ? "Créatif"
          : "Administrateur";
  const profileInitials =
    profileName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")
    || "CK";
  const visibleMainNavigation = isAthlete
    ? [
        { id: "today", label: "Aujourd’hui", href: "/athlete", icon: "house" as const },
        { id: "profile", label: "Mon profil", href: "/athlete/profile", icon: "users" as const },
        { id: "pass", label: "Mon Pass KLIQUE", href: "/athlete/pass", icon: "sparkles" as const },
        { id: "services", label: "Services", href: "/athlete/services", icon: "contents" as const },
        { id: "media-requests", label: "Demandes médias", href: "/athlete/media-requests", icon: "newspaper" as const },
        { id: "media-bank", label: "Mes médias", href: "/athlete/media-bank", icon: "image" as const },
        { id: "media-days", label: "Media Days", href: "/athlete/media-days", icon: "calendar" as const },
        { id: "visibility", label: "Ma visibilité", href: "/athlete/visibilite", icon: "chart" as const },
        { id: "opportunities", label: "Opportunités", href: "/athlete/opportunities", icon: "folder" as const },
        { id: "ecosystem", label: "Écosystème", href: "/athlete/ecosysteme", icon: "network" as const },
        { id: "community", label: "Communauté", href: "/athlete/community", icon: "messages" as const },
        { id: "contact", label: "Contacter KLIQUE", href: "/athlete/contact", icon: "messages" as const },
      ]
    : isMedia
      ? [
          { id: "media-desk", label: "Media Desk", href: "/media-desk", icon: "newspaper" as const },
          { id: "athletes", label: "Athlètes", href: "/media/athletes", icon: "users" as const },
          { id: "contents", label: "Contenus", href: "/contents", icon: "contents" as const },
        ]
      : isPartner
        ? [
            { id: "today", label: "Aujourd’hui", href: "/partner", icon: "house" as const },
            { id: "athletes", label: "Athlètes", href: "/partner/athletes", icon: "users" as const },
            { id: "benefit-reservations", label: "Réservations d’avantages", href: "/partner/benefit-reservations", icon: "sparkles" as const },
            { id: "community", label: "Communauté", href: "/partner/community", icon: "messages" as const },
            { id: "contact-requests", label: "Mes mises en relation", href: "/partner/contact-requests", icon: "messages" as const },
          ]
        : isCreativeOnly
          ? [{ id: "creative", label: "Mes missions", href: "/creative", icon: "contents" as const }]
          : [];
  const visibleAdminGroups = isAdmin && isCreative
    ? [...adminNavigationGroups, adminCreativeNavigationGroup]
    : adminNavigationGroups;
  const homeHref = isAdmin ? "/today" : isPartner ? "/partner" : isCreativeOnly ? "/creative" : "/";

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
          <Link href={homeHref} className="klique-logo" aria-label="Accueil KLIQUE">
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

        {!isPartner ? <WorkspaceSwitcher collapsed={collapsed} /> : null}

        <div className="sidebar-scroll">
          <nav aria-label="Navigation principale" className="sidebar-nav-block">
            {isAdmin ? (
              <AdminNavigation
                key={pathname}
                groups={visibleAdminGroups}
                pathname={pathname}
                collapsed={collapsed}
                idPrefix="desktop"
                onExpandCollapsed={onToggleCollapsed}
              />
            ) : (
              <NavigationSection
                items={visibleMainNavigation}
                pathname={pathname}
                collapsed={collapsed}
                group="Navigation"
              />
            )}
          </nav>
        </div>

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
              {profileInitials}
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
              <Link href={homeHref} className="klique-logo" aria-label="Accueil KLIQUE" onClick={onCloseMobile}>
                <span>●</span>
                <strong>KLIQUE</strong>
              </Link>
              <button type="button" className="header-icon-button" onClick={onCloseMobile} aria-label="Fermer">
                <X className="app-icon" />
              </button>
            </header>

            {!isPartner ? <WorkspaceSwitcher /> : null}

            <div className="sidebar-scroll">
              <nav aria-label="Navigation principale" className="sidebar-nav-block">
                {isAdmin ? (
                  <AdminNavigation
                    key={pathname}
                    groups={visibleAdminGroups}
                    pathname={pathname}
                    collapsed={false}
                    idPrefix="mobile"
                    onNavigate={onCloseMobile}
                  />
                ) : (
                  <NavigationSection
                    items={visibleMainNavigation}
                    pathname={pathname}
                    collapsed={false}
                    group="Navigation"
                    onNavigate={onCloseMobile}
                  />
                )}
              </nav>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
