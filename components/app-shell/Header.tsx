"use client";

import { Breadcrumb } from "./Breadcrumb";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsMenu } from "./NotificationsMenu";
import { UserMenu } from "./UserMenu";
import { Menu } from "./icons";

type HeaderProps = {
  pathname: string;
  onOpenMobileSidebar: () => void;
  notificationsEnabled?: boolean;
  isAdmin?: boolean;
  isAthlete?: boolean;
  userName?: string | null;
  userRole?: string | null;
};

export function Header({
  pathname,
  onOpenMobileSidebar,
  notificationsEnabled = false,
  isAdmin = false,
  isAthlete = false,
  userName,
  userRole,
}: HeaderProps) {
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
        <GlobalSearch userRole={userRole} />
      </div>

      <div className="header-right">
        <div className="desktop-hidden">
          <GlobalSearch compact userRole={userRole} />
        </div>
        <NotificationsMenu enabled={notificationsEnabled} isAdmin={isAdmin} isAthlete={isAthlete} />
        <UserMenu userName={userName} userRole={userRole} />
      </div>
    </header>
  );
}
