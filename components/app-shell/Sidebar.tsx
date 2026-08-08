"use client";

import Link from "next/link";
import { mainNavigation, secondaryNavigation } from "./data";
import { ChevronDown, iconByName, LayoutGrid, X } from "./icons";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

type SidebarProps = {
  pathname: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
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
}: SidebarProps) {
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
            items={mainNavigation}
            pathname={pathname}
            collapsed={collapsed}
            group="Navigation"
          />
        </nav>

        <nav aria-label="Navigation secondaire" className="sidebar-nav-block sidebar-nav-secondary">
          <NavigationSection
            items={secondaryNavigation}
            pathname={pathname}
            collapsed={collapsed}
            group="Espace"
          />
        </nav>

        <button
          type="button"
          className="sidebar-profile"
          title={collapsed ? "Sebastien Mory" : undefined}
          data-tooltip={collapsed ? "Sebastien Mory" : undefined}
          aria-label="Profil utilisateur"
        >
          <span className="user-avatar" aria-hidden>
            SM
          </span>
          {!collapsed ? (
            <span className="user-meta">
              <strong>Sebastien Mory</strong>
              <small>Administrateur</small>
            </span>
          ) : null}
          {!collapsed ? <ChevronDown className="app-icon sidebar-profile-chevron" /> : null}
        </button>
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
                items={mainNavigation}
                pathname={pathname}
                collapsed={false}
                group="Navigation"
                onNavigate={onCloseMobile}
              />
            </nav>

            <nav aria-label="Navigation secondaire" className="sidebar-nav-block sidebar-nav-secondary">
              <NavigationSection
                items={secondaryNavigation}
                pathname={pathname}
                collapsed={false}
                group="Espace"
                onNavigate={onCloseMobile}
              />
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
