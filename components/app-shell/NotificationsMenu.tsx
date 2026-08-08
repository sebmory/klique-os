"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { notificationsSeed } from "./data";
import { Bell } from "./icons";

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(notificationsSeed);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const unreadCount = useMemo(() => notifications.filter((item) => item.unread).length, [notifications]);

  return (
    <div className="header-dropdown" ref={rootRef}>
      <button
        type="button"
        className="header-icon-button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className="app-icon" />
        {unreadCount > 0 ? <span className="notification-dot" aria-hidden /> : null}
      </button>

      {open ? (
        <div className="header-menu notification-menu" role="menu" aria-label="Liste des notifications">
          <header>
            <div>
              <strong>Notifications</strong>
              <small>{unreadCount > 0 ? `${unreadCount} non lue(s)` : "Tout est a jour"}</small>
            </div>
            <button
              type="button"
              className="menu-action-link"
              onClick={() => {
                setNotifications((current) => current.map((item) => ({ ...item, unread: false })));
              }}
            >
              Tout marquer comme lu
            </button>
          </header>

          {notifications.length === 0 ? (
            <p className="menu-empty">Aucune notification pour le moment.</p>
          ) : (
            <ul>
              {notifications.map((item) => (
                <li key={item.id} className={item.unread ? "is-unread" : undefined}>
                  <p>{item.text}</p>
                  <small>{item.dateLabel}</small>
                </li>
              ))}
            </ul>
          )}

          <footer>
            <button type="button" className="menu-footer-button">
              Voir toutes les notifications
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
