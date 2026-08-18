"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "./icons";

type ContactRequest = {
  id: string;
  athleteId: string;
  subject: string;
  status: string;
  createdAt: string;
};

type NotificationsMenuProps = {
  isAdmin?: boolean;
  isAthlete?: boolean;
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

export function NotificationsMenu({ isAdmin = false, isAthlete = false }: NotificationsMenuProps) {
  const [open, setOpen] = useState(false);
  const [openRequests, setOpenRequests] = useState<ContactRequest[]>([]);
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

  const unreadCount = useMemo(() => 0, []);

  useEffect(() => {
    if (!isAdmin) {
      setOpenRequests([]);
      setAthleteNames({});
      return;
    }

    let active = true;

    const loadOpenRequests = async () => {
      setRequestsLoading(true);
      try {
        const response = await fetch("/api/contact-requests", { credentials: "include", cache: "no-store" });
        if (!response.ok) {
          throw new Error("unavailable");
        }

        const payload = (await response.json()) as { contactRequests?: ContactRequest[] };
        const requests = (payload?.contactRequests ?? []).filter((request) => request.status === "open");

        if (!active) return;
        setOpenRequests(requests);

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
    if (!isAthlete) {
      setSlotDecisions([]);
      return;
    }

    void loadSlotDecisions();
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

  if (isAthlete) {
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
          {unseenDecisionsCount > 0 ? (
            <span className="notification-count-badge" aria-hidden>
              {unseenDecisionsCount > 9 ? "9+" : unseenDecisionsCount}
            </span>
          ) : null}
        </button>

        {open ? (
          <div className="header-menu notification-menu" role="menu" aria-label="Mes notifications">
            <header className="notification-requests-header">
              <strong>Mes demandes</strong>
              <small>
                {unseenDecisionsCount > 0 ? `${unseenDecisionsCount} nouvelle(s) r\u00e9ponse(s)` : "Aucune nouvelle notification"}
              </small>
            </header>

            {slotDecisionsLoading && slotDecisions.length === 0 ? (
              <p className="menu-empty">Chargement des notifications...</p>
            ) : slotDecisions.length === 0 ? (
              <p className="menu-empty">Aucune nouvelle notification</p>
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

          .notification-requests-header {
            display: grid;
            gap: 2px;
            padding: var(--kl-spacing-3) var(--kl-spacing-3) var(--kl-spacing-2);
          }

          .notification-requests-header small {
            color: var(--kl-color-textMuted, #7b7b7b);
            font-size: var(--kl-typography-sizes-caption);
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
    );
  }

  if (!isAdmin) {
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
        {openRequestsCount > 0 ? (
          <span className="notification-count-badge" aria-hidden>
            {openRequestsCount > 9 ? "9+" : openRequestsCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="header-menu notification-menu" role="menu" aria-label="Demandes KLIQUE">
          <header className="notification-requests-header">
            <strong>Demandes KLIQUE</strong>
            <small>
              {openRequestsCount > 0 ? `${openRequestsCount} nouvelle(s) demande(s)` : "Aucune nouvelle demande"}
            </small>
          </header>

          {requestsLoading && recentOpenRequests.length === 0 ? (
            <p className="menu-empty">Chargement des demandes...</p>
          ) : recentOpenRequests.length === 0 ? (
            <p className="menu-empty">Aucune nouvelle demande</p>
          ) : (
            <ul className="notification-requests-list">
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
