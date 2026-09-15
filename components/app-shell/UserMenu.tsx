"use client";

import { useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { ChevronDown, CircleUserRound } from "./icons";

const mainMenuItems = ["Mon profil", "Préférences", "Changer de workspace"];

type UserMenuProps = {
  userName?: string | null;
  userRole?: string | null;
};

const accessLabel = (role: string | null | undefined): string => {
  if (role === "admin") return "Administrateur";
  if (role === "athlete") return "Athlète";
  if (role === "partner_expert") return "Partenaire / Expert";
  if (role === "media") return "Média";
  return "Compte utilisateur";
};

const userInitials = (name: string): string => {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  }
  return name.slice(0, 2).toUpperCase();
};

export function UserMenu({ userName, userRole }: UserMenuProps) {
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const profileName = userName?.trim() || "Compte Clerk";
  const profileAccessLabel = accessLabel(userRole);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div className="header-dropdown" ref={rootRef}>
      <button
        type="button"
        className="user-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="user-avatar" aria-hidden>
          {userInitials(profileName)}
        </span>
        <span className="user-meta">
          <strong>{profileName}</strong>
          <small>{profileAccessLabel}</small>
        </span>
        <ChevronDown className="app-icon" />
      </button>

      {open ? (
        <div className="header-menu user-menu" role="menu" aria-label="Menu utilisateur">
          <div className="user-menu-head">
            <CircleUserRound className="app-icon" />
            <div>
              <strong>{profileName}</strong>
              <small>{profileAccessLabel}</small>
            </div>
          </div>
          <ul>
            {mainMenuItems.map((item) => (
              <li key={item}>
                <button type="button" role="menuitem" className="menu-item-disabled" disabled aria-disabled="true">
                  <span>{item}</span>
                  <small>Bientôt disponible</small>
                </button>
              </li>
            ))}
            <li className="menu-separator" role="separator" aria-hidden />
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
  );
}
