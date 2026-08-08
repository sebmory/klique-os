"use client";

import { useEffect, useRef, useState } from "react";
import { workspaces, type Workspace } from "./data";
import { ChevronsUpDown, ChevronDown } from "./icons";

type WorkspaceSwitcherProps = {
  collapsed?: boolean;
};

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(workspaces[0]);
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
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className={
                workspace.id === activeWorkspace.id ? "workspace-item is-active" : "workspace-item"
              }
              role="menuitemradio"
              aria-checked={workspace.id === activeWorkspace.id}
              onClick={() => {
                setActiveWorkspace(workspace);
                setOpen(false);
              }}
            >
              <span className="workspace-monogram" aria-hidden>
                {workspace.monogram}
              </span>
              <span className="workspace-meta">
                <strong>{workspace.name}</strong>
                <small>{workspace.description}</small>
              </span>
            </button>
          ))}
          <div className="workspace-menu-separator" />
          <button type="button" className="workspace-item workspace-create" role="menuitem" disabled>
            <span className="workspace-monogram" aria-hidden>
              +
            </span>
            <span className="workspace-meta">
              <strong>Creer un workspace</strong>
              <small>Bientot disponible</small>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
