"use client";

import { useEffect, useRef, useState } from "react";
import { workspaces } from "./data";
import { ChevronsUpDown, ChevronDown } from "./icons";

type WorkspaceSwitcherProps = {
  collapsed?: boolean;
};

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const activeWorkspace = workspaces[0];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = "workspace-switcher-menu";

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
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
    <div className="workspace-switcher" ref={rootRef}>
      <button
        type="button"
        className="workspace-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label="Changer de workspace"
        data-tooltip={collapsed ? activeWorkspace.name : undefined}
      >
        <span className="workspace-monogram" aria-hidden>
          {activeWorkspace.monogram}
        </span>
        {!collapsed ? (
          <span className="workspace-meta">
            <strong>{activeWorkspace.name}</strong>
            <small>{activeWorkspace.description}</small>
          </span>
        ) : null}
        {!collapsed ? <ChevronsUpDown className="app-icon" /> : <ChevronDown className="app-icon" />}
      </button>

      {open ? (
        <div className="workspace-menu" role="menu" id={menuId} aria-label="Liste des workspaces">
          <div className="workspace-item is-active" role="menuitemradio" aria-checked="true">
            <span className="workspace-monogram" aria-hidden>
              {activeWorkspace.monogram}
            </span>
            <span className="workspace-meta">
              <strong>{activeWorkspace.name}</strong>
              <small>{activeWorkspace.description}</small>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
