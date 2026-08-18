"use client";

import { Breadcrumb } from "./Breadcrumb";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsMenu } from "./NotificationsMenu";
import { UserMenu } from "./UserMenu";
import { Menu } from "./icons";

type HeaderProps = {
  pathname: string;
  onOpenMobileSidebar: () => void;
  isAdmin?: boolean;
};

export function Header({ pathname, onOpenMobileSidebar, isAdmin = false }: HeaderProps) {
  return (
    <header className="klique-header">
      <div className="header-left">
        <button
          type="button"
          className="header-icon-button mobile-only"
          aria-label="Ouvrir la navigation"
          onClick={onOpenMobileSidebar}
        >
          <Menu className="app-icon" />
        </button>
        <Breadcrumb pathname={pathname} />
      </div>

      <div className="header-center">
        <GlobalSearch />
      </div>

      <div className="header-right">
        <div className="desktop-hidden">
          <GlobalSearch compact />
        </div>
        <NotificationsMenu isAdmin={isAdmin} />
        <UserMenu />
      </div>
    </header>
  );
}
