"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "./icons";

type ContactRequest = {
  id: string;
  athleteId: string;
  subject: string;
  status: string;
  createdAt: string;
};

type PartnerApplication = {
  sourceRow?: number;
  moderationStatus?: string;
  moderation_status?: string;
};

type NotificationsMenuProps = {
  enabled?: boolean;
  isAdmin?: boolean;
  isAthlete?: boolean;
};

type PersonalNotification = {
  id: string;
  title: string;
  body: string | null;
  actionHref: string;
  readAt: string | null;
  createdAt: string;
};

type SlotDecision = {
  requestId: string;
  opportunityId: string;
  opportunityTitle: string;
  status: "confirmed" | "declined" | "cancelled";
  startsAt: string;
  seen: boolean;
};

const slotDecisionLabels: Record<SlotDecision["status"], string> = {
  confirmed: "Confirmée",
  declined: "Refusée",
  cancelled: "Annulée",
};

const slotDateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatSlotDateTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date inconnue" : slotDateTimeFormatter.format(parsed);
};

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const parseDateRank = (value: string): number => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date inconnue" : dateFormatter.format(parsed);
};

export function NotificationsMenu({ enabled = false, isAdmin = false, isAthlete = false }: NotificationsMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [personalNotifications, setPersonalNotifications] = useState<PersonalNotification[]>([]);
  const [personalUnreadCount, setPersonalUnreadCount] = useState(0);
  const [personalNotificationsLoading, setPersonalNotificationsLoading] = useState(false);
  const [openRequests, setOpenRequests] = useState<ContactRequest[]>([]);
  const [pendingPartnerCount, setPendingPartnerCount] = useState(0);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [slotDecisions, setSlotDecisions] = useState<SlotDecision[]>([]);
  const [slotDecisionsLoading, setSlotDecisionsLoading] = useState(false);
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

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    const loadPersonalNotifications = async () => {
      setPersonalNotificationsLoading(true);
      try {
        const response = await fetch("/api/notifications", { credentials: "include", cache: "no-store" });
        if (!response.ok) throw new Error("unavailable");
        const payload = (await response.json()) as {
          notifications?: PersonalNotification[];
          unreadCount?: number;
        };
        if (!active) return;
        setPersonalNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
        setPersonalUnreadCount(Number.isFinite(payload.unreadCount) ? Number(payload.unreadCount) : 0);
      } catch {
        if (active) {
          setPersonalNotifications([]);
          setPersonalUnreadCount(0);
        }
      } finally {
        if (active) setPersonalNotificationsLoading(false);
      }
    };

    void loadPersonalNotifications();

    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!isAdmin) return;

    let active = true;

    const loadOpenRequests = async () => {
      setRequestsLoading(true);
      try {
        const [response, partnersResponse] = await Promise.all([
          fetch("/api/contact-requests", { credentials: "include", cache: "no-store" }),
          fetch("/api/partners", { credentials: "include", cache: "no-store" }),
        ]);
        if (!response.ok) {
          throw new Error("unavailable");
        }

        const payload = (await response.json()) as { contactRequests?: ContactRequest[] };
        const requests = (payload?.contactRequests ?? []).filter((request) => request.status === "open");

        let pendingPartners = 0;
        if (partnersResponse.ok) {
          const partnersPayload = (await partnersResponse.json().catch(() => null)) as {
            partners?: PartnerApplication[];
          } | null;
          pendingPartners = (partnersPayload?.partners ?? []).filter((partner) => {
            const status = partner.moderationStatus ?? partner.moderation_status;
            return status?.toLowerCase() === "pending" && Number(partner.sourceRow) >= 2;
          }).length;
        }

        if (!active) return;
        setOpenRequests(requests);
        setPendingPartnerCount(pendingPartners);

        if (requests.length === 0) {
          setAthleteNames({});
          return;
        }

        const athletesResponse = await fetch("/api/athletes", { credentials: "include", cache: "no-store" });
        if (!athletesResponse.ok || !active) return;

        const athletesPayload = (await athletesResponse.json()) as {
          athletes?: { key?: string; name?: string }[];
        };

        if (!active) return;
        setAthleteNames(
          (athletesPayload?.athletes ?? []).reduce<Record<string, string>>((accumulator, athlete) => {
            if (athlete.key && athlete.name) accumulator[athlete.key] = athlete.name;
            return accumulator;
          }, {}),
        );
      } catch {
        if (active) {
          setOpenRequests([]);
          setAthleteNames({});
          setPendingPartnerCount(0);
        }
      } finally {
        if (active) setRequestsLoading(false);
      }
    };

    void loadOpenRequests();

    return () => {
      active = false;
    };
  }, [isAdmin]);

  const recentOpenRequests = useMemo(
    () => [...openRequests].sort((a, b) => parseDateRank(b.createdAt) - parseDateRank(a.createdAt)).slice(0, 3),
    [openRequests],
  );

  const resolveAthleteLabel = useCallback(
    (athleteId: string) => athleteNames[athleteId] || athleteId || "Athlète inconnu",
    [athleteNames],
  );

  const openRequestsCount = openRequests.length;
  const adminNotificationsCount = openRequestsCount + pendingPartnerCount;

  const loadSlotDecisions = useCallback(async () => {
    setSlotDecisionsLoading(true);
    try {
      const [slotsResponse, opportunitiesResponse] = await Promise.all([
        fetch("/api/hub-opportunity-slots", { credentials: "include", cache: "no-store" }),
        fetch("/api/hub-opportunities", { credentials: "include", cache: "no-store" }),
      ]);

      if (!slotsResponse.ok) throw new Error("unavailable");

      const slotsPayload = (await slotsResponse.json()) as {
        slots?: { id: string; startsAt: string }[];
        requests?: {
          id: string;
          slotId: string;
          opportunityId: string;
          status: string;
          athleteSeenAt: string | null;
        }[];
      };

      let titles: Record<string, string> = {};
      if (opportunitiesResponse.ok) {
        const opportunitiesPayload = (await opportunitiesResponse.json()) as {
          opportunities?: { id?: string; title?: string }[];
        };
        titles = (opportunitiesPayload.opportunities ?? []).reduce<Record<string, string>>((accumulator, item) => {
          if (item.id && item.title) accumulator[item.id] = item.title;
          return accumulator;
        }, {});
      }

      const slotStarts = (slotsPayload.slots ?? []).reduce<Record<string, string>>((accumulator, slot) => {
        accumulator[slot.id] = slot.startsAt;
        return accumulator;
      }, {});

      setSlotDecisions(
        (slotsPayload.requests ?? [])
          .filter((item) => item.status === "confirmed" || item.status === "declined" || item.status === "cancelled")
          .map((item) => ({
            requestId: item.id,
            opportunityId: item.opportunityId,
            opportunityTitle: titles[item.opportunityId] || "Opportunité KLIQUE",
            status: item.status as SlotDecision["status"],
            startsAt: slotStarts[item.slotId] ?? "",
            seen: Boolean(item.athleteSeenAt),
          })),
      );
    } catch {
      setSlotDecisions([]);
    } finally {
      setSlotDecisionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAthlete) return;

    queueMicrotask(() => {
      void loadSlotDecisions();
    });
  }, [isAthlete, loadSlotDecisions]);

  const unseenDecisionsCount = slotDecisions.filter((decision) => !decision.seen).length;

  const handleOpenDecision = async (decision: SlotDecision) => {
    setOpen(false);
    if (decision.seen) return;

    try {
      await fetch("/api/hub-opportunity-slots", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-seen", requestId: decision.requestId }),
      });
      setSlotDecisions((current) =>
        current.map((item) => (item.requestId === decision.requestId ? { ...item, seen: true } : item)),
      );
    } catch {
      // La navigation reste prioritaire si le marquage echoue.
    }
  };

  const handleOpenPersonalNotification = async (
    event: React.MouseEvent<HTMLAnchorElement>,
    notification: PersonalNotification,
  ) => {
    event.preventDefault();
    setOpen(false);

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notification.id }),
      });
      if (response.ok && notification.readAt === null) {
        setPersonalNotifications((current) =>
          current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item),
        );
        setPersonalUnreadCount((current) => Math.max(0, current - 1));
      }
    } catch {
      // La navigation reste prioritaire si le marquage echoue.
    } finally {
      router.push(notification.actionHref);
    }
  };

  if (!enabled) {
    return null;
  }

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
        {personalUnreadCount > 0 ? (
          <span className="notification-count-badge" aria-hidden>
            {personalUnreadCount > 9 ? "9+" : personalUnreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="header-menu notification-menu" role="menu" aria-label="Mes notifications">
          <header className="notification-requests-header">
            <strong>Mes notifications</strong>
            <small>
              {personalUnreadCount > 0
                ? `${personalUnreadCount} notification${personalUnreadCount > 1 ? "s" : ""} non lue${personalUnreadCount > 1 ? "s" : ""}`
                : "Aucune notification non lue"}
            </small>
          </header>

          {personalNotificationsLoading && personalNotifications.length === 0 ? (
            <p className="menu-empty">Chargement des notifications...</p>
          ) : personalNotifications.length === 0 ? (
            <p className="menu-empty">Aucune notification</p>
          ) : (
            <ul className="notification-requests-list">
              {personalNotifications.map((notification) => (
                <li key={notification.id} className={notification.readAt === null ? "is-unread" : undefined}>
                  <Link href={notification.actionHref} onClick={(event) => handleOpenPersonalNotification(event, notification)}>
                    <strong>{notification.title}</strong>
                    {notification.body ? <span>{notification.body}</span> : null}
                    <small>{formatDate(notification.createdAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {isAthlete ? (
            <section className="notification-legacy-section" aria-label="Anciennes alertes Athlète">
              <header className="notification-requests-header">
                <strong>Mes demandes</strong>
                <small>{unseenDecisionsCount > 0 ? `${unseenDecisionsCount} nouvelle(s) réponse(s)` : "Aucune nouvelle réponse"}</small>
              </header>
              {slotDecisionsLoading && slotDecisions.length === 0 ? (
                <p className="menu-empty">Chargement des demandes...</p>
              ) : slotDecisions.length === 0 ? (
                <p className="menu-empty">Aucune demande récente</p>
              ) : (
                <ul className="notification-requests-list">
                  {slotDecisions.map((decision) => (
                    <li key={decision.requestId} className={decision.seen ? undefined : "is-unread"}>
                      <Link
                        href={`/athlete/opportunities/${encodeURIComponent(decision.opportunityId)}`}
                        onClick={() => handleOpenDecision(decision)}
                      >
                        <strong>Demande {slotDecisionLabels[decision.status]}</strong>
                        <span>{decision.opportunityTitle}</span>
                        <small>{decision.startsAt ? formatSlotDateTime(decision.startsAt) : "Créneau non renseigné"}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {isAdmin ? (
            <section className="notification-legacy-section" aria-label="Anciennes alertes Admin">
              <header className="notification-requests-header">
                <strong>Demandes KLIQUE</strong>
                <small>{adminNotificationsCount > 0 ? `${adminNotificationsCount} nouvelle(s) demande(s)` : "Aucune nouvelle demande"}</small>
              </header>
              {requestsLoading && recentOpenRequests.length === 0 && pendingPartnerCount === 0 ? (
                <p className="menu-empty">Chargement des demandes...</p>
              ) : recentOpenRequests.length === 0 && pendingPartnerCount === 0 ? (
                <p className="menu-empty">Aucune nouvelle demande</p>
              ) : (
                <ul className="notification-requests-list">
                  {pendingPartnerCount > 0 ? (
                    <li className="is-unread">
                      <Link href="/crm/demandes?tab=partners" onClick={() => setOpen(false)}>
                        <strong>{pendingPartnerCount} partenaire{pendingPartnerCount > 1 ? "s" : ""} à valider</strong>
                      </Link>
                    </li>
                  ) : null}
                  {recentOpenRequests.map((request) => (
                    <li key={request.id} className="is-unread">
                      <Link href="/crm/demandes" onClick={() => setOpen(false)}>
                        <strong>{resolveAthleteLabel(request.athleteId)}</strong>
                        <span>{request.subject}</span>
                        <small>{formatDate(request.createdAt)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <footer>
                <Link href="/crm/demandes" className="menu-action-link" onClick={() => setOpen(false)}>
                  Voir toutes les demandes
                </Link>
              </footer>
            </section>
          ) : null}

          <style>{`
            .notification-requests-header {
              display: grid;
              gap: 2px;
              padding: var(--kl-spacing-3) var(--kl-spacing-3) var(--kl-spacing-2);
            }

            .notification-requests-header strong {
              font-size: 0.95rem;
              line-height: 1.3;
            }

            .notification-requests-header small {
              color: var(--kl-color-textMuted, #7b7b7b);
              font-size: var(--kl-typography-sizes-caption);
            }

            .notification-legacy-section {
              border-top: 1px solid var(--kl-color-border, #e5e5e5);
            }

            .notification-requests-list li a {
              display: grid;
              gap: 2px;
              text-decoration: none;
              color: inherit;
            }

            .notification-requests-list li a span {
              font-size: 0.85rem;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .notification-requests-list li a small {
              color: var(--kl-color-textMuted, #7b7b7b);
            }
          `}</style>
        </div>
      ) : null}

      <style>{`
        .notification-count-badge {
          position: absolute;
          top: 2px;
          right: 2px;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: var(--kl-radius-full, 999px);
          background: #ffd54a;
          color: #1f1f1f;
          font-size: 0.68rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
