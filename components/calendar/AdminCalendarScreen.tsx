"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminCalendarEvent,
  AdminCalendarEventType,
  AdminOperationalCalendar,
} from "@/lib/admin-operational-calendar";

type CalendarView = "upcoming" | "month";
type TypeFilter = "all" | AdminCalendarEventType;

const typeLabels: Record<TypeFilter, string> = {
  all: "Tous",
  mission: "Missions",
  service_request: "Demandes",
  production: "Productions",
  media_day: "Journées média",
  calendar: "Autres événements",
};

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const getZurichToday = (): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const filterEvent = (
  event: AdminCalendarEvent,
  type: TypeFilter,
  query: string,
): boolean => {
  if (type !== "all" && event.type !== type) return false;
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return normalizeSearch([
    event.title,
    event.entityLabel,
    event.location,
    event.status,
    event.sourceLabel,
    event.nextAction,
  ].filter(Boolean).join(" ")).includes(normalizedQuery);
};

export const filterCalendarEvents = ({
  events,
  type,
  query,
}: {
  events: AdminCalendarEvent[];
  type: TypeFilter;
  query: string;
}) => events.filter((event) => filterEvent(event, type, query));

export const scopeCalendarDatedEvents = ({
  events,
  view,
  today,
  monthKey,
}: {
  events: AdminCalendarEvent[];
  view: CalendarView;
  today: string;
  monthKey: string;
}) => events.filter((event) => (
  view === "upcoming"
    ? Boolean(event.date && event.date >= today)
    : event.date?.startsWith(`${monthKey}-`)
));

export const getCalendarTypeCounts = (
  events: AdminCalendarEvent[],
): Record<TypeFilter, number> => Object.fromEntries(
  (Object.keys(typeLabels) as TypeFilter[]).map((filter) => [
    filter,
    filter === "all"
      ? events.length
      : events.filter((event) => event.type === filter).length,
  ]),
) as Record<TypeFilter, number>;

const civilDateForDisplay = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

const formatDay = (value: string) => new Intl.DateTimeFormat("fr-CH", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(civilDateForDisplay(value));

const formatMonth = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-CH", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1, 12));
};

const shiftMonth = (value: string, offset: number) => {
  const [year, month] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};

const monthCells = (monthKey: string): Array<string | null> => {
  const [year, month] = monthKey.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: dayCount },
      (_, index) => `${monthKey}-${String(index + 1).padStart(2, "0")}`,
    ),
  ];
};

const CalendarEventCard = ({
  event,
  compact = false,
}: {
  event: AdminCalendarEvent;
  compact?: boolean;
}) => (
  <article className={`admin-calendar-event is-${event.type}${compact ? " is-compact" : ""}`}>
    <div className="admin-calendar-event-heading">
      <span className="admin-calendar-source">{event.sourceLabel}</span>
      {event.time ? <time dateTime={`${event.date ?? ""}T${event.time}`}>{event.time}</time> : null}
    </div>
    <h3>
      <Link href={event.href} aria-label={`Ouvrir ${event.title} dans son module d’origine`}>
        {event.title}
      </Link>
    </h3>
    {!compact && (event.entityLabel || event.location) ? (
      <p>{[event.entityLabel, event.location].filter(Boolean).join(" · ")}</p>
    ) : null}
    <div className="admin-calendar-event-footer">
      <span>{event.status}</span>
      {!compact && event.nextAction ? <strong>{event.nextAction}</strong> : null}
    </div>
  </article>
);

export function AdminCalendarScreen() {
  const [calendar, setCalendar] = useState<AdminOperationalCalendar | null>(null);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const [view, setView] = useState<CalendarView>("upcoming");
  const [type, setType] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const today = useMemo(() => getZurichToday(), []);
  const [monthKey, setMonthKey] = useState(today.slice(0, 7));

  const load = useCallback(async (signal: AbortSignal) => {
    setError("");
    try {
      const response = await fetch("/api/admin/calendar", {
        cache: "no-store",
        signal,
      });
      const payload = await response.json() as AdminOperationalCalendar & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Impossible de charger le calendrier.");
      }
      setCalendar({ dated: payload.dated, unscheduled: payload.unscheduled });
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger le calendrier.");
      setCalendar(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load, retryToken]);

  const scopedDated = useMemo(
    () => scopeCalendarDatedEvents({
      events: calendar?.dated ?? [],
      view,
      today,
      monthKey,
    }),
    [calendar, monthKey, today, view],
  );
  const countedDated = useMemo(
    () => filterCalendarEvents({ events: scopedDated, type: "all", query }),
    [query, scopedDated],
  );
  const counts = useMemo(
    () => getCalendarTypeCounts(countedDated),
    [countedDated],
  );
  const visibleDated = useMemo(
    () => filterCalendarEvents({ events: scopedDated, type, query }),
    [query, scopedDated, type],
  );
  const unscheduled = useMemo(
    () => filterCalendarEvents({ events: calendar?.unscheduled ?? [], type, query }),
    [calendar, type, query],
  );
  const groupedUpcoming = useMemo(() => {
    const groups = new Map<string, AdminCalendarEvent[]>();
    visibleDated.forEach((event) => {
      if (!event.date) return;
      groups.set(event.date, [...groups.get(event.date) ?? [], event]);
    });
    return [...groups.entries()];
  }, [visibleDated]);
  const monthEvents = useMemo(() => {
    const byDay = new Map<string, AdminCalendarEvent[]>();
    visibleDated.forEach((event) => {
      if (event.date) byDay.set(event.date, [...byDay.get(event.date) ?? [], event]);
    });
    return byDay;
  }, [visibleDated]);

  return (
    <section className="admin-calendar-screen" aria-labelledby="admin-calendar-title">
      <header className="admin-calendar-header">
        <div>
          <p>Pilotage opérationnel</p>
          <h1 id="admin-calendar-title">Calendrier opérationnel</h1>
          <span>Retrouvez les dates fiables de chaque module sans déplacer leur suivi métier.</span>
        </div>
        <CalendarDays size={30} aria-hidden />
      </header>

      <div className="admin-calendar-toolbar">
        <div className="admin-calendar-view-tabs" role="group" aria-label="Vue du calendrier">
          <button
            type="button"
            className={view === "upcoming" ? "is-active" : ""}
            aria-pressed={view === "upcoming"}
            onClick={() => setView("upcoming")}
          >
            À venir
          </button>
          <button
            type="button"
            className={view === "month" ? "is-active" : ""}
            aria-pressed={view === "month"}
            onClick={() => setView("month")}
          >
            Mois
          </button>
        </div>

        <label className="admin-calendar-search">
          <span>Rechercher</span>
          <span>
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Titre, statut, Athlète, lieu…"
            />
          </span>
        </label>

        <div className="admin-calendar-filters" aria-label="Filtrer par type">
          {(Object.keys(typeLabels) as TypeFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              className={type === filter ? "is-active" : ""}
              aria-pressed={type === filter}
              onClick={() => setType(filter)}
            >
              {typeLabels[filter]} <span>{counts[filter]}</span>
            </button>
          ))}
          <span className="admin-calendar-unscheduled-count">
            À planifier <strong>{unscheduled.length}</strong>
          </span>
        </div>
      </div>

      {view === "month" ? (
        <nav className="admin-calendar-month-navigation" aria-label="Navigation mensuelle">
          <button type="button" onClick={() => setMonthKey((value) => shiftMonth(value, -1))}>
            <ChevronLeft size={17} aria-hidden /> <span>Mois précédent</span>
          </button>
          <strong aria-live="polite">{formatMonth(monthKey)}</strong>
          <div>
            <button type="button" onClick={() => setMonthKey(today.slice(0, 7))}>Aujourd’hui</button>
            <button type="button" onClick={() => setMonthKey((value) => shiftMonth(value, 1))}>
              <span>Mois suivant</span> <ChevronRight size={17} aria-hidden />
            </button>
          </div>
        </nav>
      ) : null}

      {!calendar && !error ? (
        <div className="admin-calendar-state" role="status">
          <strong>Chargement du calendrier…</strong>
          <p>Les sources opérationnelles sont en cours de lecture.</p>
        </div>
      ) : null}

      {error ? (
        <div className="admin-calendar-state is-error" role="alert">
          <strong>Le calendrier n’a pas pu être chargé.</strong>
          <p>{error}</p>
          <button type="button" onClick={() => setRetryToken((value) => value + 1)}>Réessayer</button>
        </div>
      ) : null}

      {calendar && view === "upcoming" ? (
        groupedUpcoming.length > 0 ? (
          <div className="admin-calendar-upcoming">
            {groupedUpcoming.map(([date, events]) => (
              <section key={date} className="admin-calendar-day" aria-labelledby={`calendar-day-${date}`}>
                <h2 id={`calendar-day-${date}`}>
                  <time dateTime={date}>{formatDay(date)}</time>
                </h2>
                <div>{events.map((event) => <CalendarEventCard key={event.id} event={event} />)}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="admin-calendar-state">
            <strong>Aucun événement à venir.</strong>
            <p>Modifiez les filtres ou consultez la vue mensuelle.</p>
          </div>
        )
      ) : null}

      {calendar && view === "month" ? (
        <section className="admin-calendar-month" aria-label={`Calendrier de ${formatMonth(monthKey)}`}>
          <div className="admin-calendar-weekdays" aria-hidden>
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="admin-calendar-month-grid">
            {monthCells(monthKey).map((date, index) => {
              const events = date ? monthEvents.get(date) ?? [] : [];
              return (
                <div
                  key={date ?? `empty-${index}`}
                  className={`admin-calendar-month-day${date === today ? " is-today" : ""}${!date ? " is-empty" : ""}`}
                >
                  {date ? (
                    <>
                      <time dateTime={date} aria-label={formatDay(date)}>{Number(date.slice(-2))}</time>
                      <div>{events.map((event) => <CalendarEventCard key={event.id} event={event} compact />)}</div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          {visibleDated.length === 0 ? (
            <p className="admin-calendar-month-empty">Aucun événement pour ce mois et ces filtres.</p>
          ) : null}
        </section>
      ) : null}

      {calendar && unscheduled.length > 0 ? (
        <section className="admin-calendar-unscheduled" aria-labelledby="admin-calendar-unscheduled-title">
          <header>
            <div>
              <p>Sans date fiable</p>
              <h2 id="admin-calendar-unscheduled-title">À planifier</h2>
            </div>
            <span>{unscheduled.length}</span>
          </header>
          <div>{unscheduled.map((event) => <CalendarEventCard key={event.id} event={event} />)}</div>
        </section>
      ) : null}
    </section>
  );
}
