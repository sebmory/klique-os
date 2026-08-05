"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Athlete } from "@/types/athlete";
import type {
  CalendarEvent,
  NewCalendarEvent,
} from "@/types/calendar";
import { CalendarService } from "@/services/calendar.service";
import { Modal } from "@/components/ui/Modal";

const monthLabels = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

const emptyEvent: NewCalendarEvent = {
  source: "task",
  title: "",
  athlete: "",
  date: "",
  time: "09:00",
  place: "",
  status: "Planifié",
  priority: "Moyenne",
  notes: "",
};

export function CalendarModule({
  athletes,
  events,
  source,
  message,
  onRefresh,
}: {
  athletes: Athlete[];
  events: CalendarEvent[];
  source: "google-sheets" | "demo";
  message: string;
  onRefresh: () => Promise<void>;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<NewCalendarEvent>(emptyEvent);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthEvents = useMemo(
    () =>
      CalendarService.sort(
        events.filter((event) => event.date.startsWith(monthKey))
      ),
    [events, monthKey]
  );

  const days = Array.from(
    { length: firstWeekday + daysInMonth },
    (_, index) => {
      if (index < firstWeekday) return null;
      return index - firstWeekday + 1;
    }
  );

  const selectedDayEvents = selectedDay
    ? CalendarService.sort(
        events.filter((event) => event.date === selectedDay)
      )
    : [];

  const upcoming = CalendarService.sort(
    events.filter((event) => event.date >= today.toISOString().slice(0, 10))
  ).slice(0, 6);

  const createEvent = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFeedback("");

    try {
      await CalendarService.create(form);
      setFeedback("L’événement a été ajouté au calendrier.");
      setShowCreate(false);
      setForm(emptyEvent);
      await onRefresh();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Création impossible."
      );
    } finally {
      setSaving(false);
    }
  };

  const openDay = (day: number) => {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    setSelectedDay(date);
  };

  const goToPreviousMonth = () =>
    setCursor(new Date(year, month - 1, 1));
  const goToNextMonth = () =>
    setCursor(new Date(year, month + 1, 1));

  const priorityClass = (priority: CalendarEvent["priority"]) =>
    priority.toLowerCase();

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Calendrier intelligent · V0.9</p>
          <h2>Calendrier</h2>
          <p>
            Shootings, publications, rendez-vous et tâches dans une seule vue.
          </p>
        </div>
        <button className="primary-button" onClick={() => setShowCreate(true)}>
          + Nouvel événement
        </button>
      </section>

      {source === "demo" && (
        <div className="connection-banner">
          <strong>Mode démo pour le calendrier</strong>
          <small>{message}</small>
        </div>
      )}

      {feedback && <div className="success-banner">{feedback}</div>}

      <section className="calendar-kpis">
        <article>
          <span>Ce mois</span>
          <strong>{monthEvents.length}</strong>
          <small>événements planifiés</small>
        </article>
        <article>
          <span>Shootings</span>
          <strong>
            {monthEvents.filter((event) => event.source === "shooting").length}
          </strong>
          <small>production photo/vidéo</small>
        </article>
        <article>
          <span>Publications</span>
          <strong>
            {monthEvents.filter((event) => event.source === "publication").length}
          </strong>
          <small>contenus à publier</small>
        </article>
        <article>
          <span>Urgents</span>
          <strong>
            {monthEvents.filter((event) => event.priority === "Urgente").length}
          </strong>
          <small>actions prioritaires</small>
        </article>
      </section>

      <section className="calendar-layout">
        <article className="calendar-panel">
          <header className="calendar-header">
            <button onClick={goToPreviousMonth}>←</button>
            <div>
              <p className="eyebrow">{year}</p>
              <h3>{monthLabels[month]}</h3>
            </div>
            <button onClick={goToNextMonth}>→</button>
          </header>

          <div className="calendar-weekdays">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {days.map((day, index) =>
              day === null ? (
                <div className="calendar-day empty" key={`empty-${index}`} />
              ) : (
                <button
                  className="calendar-day"
                  key={day}
                  onClick={() => openDay(day)}
                >
                  <span className="calendar-day-number">{day}</span>

                  <div className="calendar-day-events">
                    {monthEvents
                      .filter(
                        (event) =>
                          CalendarService.dayNumber(event.date) === day
                      )
                      .slice(0, 3)
                      .map((event) => (
                        <span
                          key={event.id}
                          className={`calendar-mini-event ${event.source}`}
                          title={`${event.time} · ${event.title}`}
                        >
                          {event.time && <b>{event.time}</b>}
                          {event.title}
                        </span>
                      ))}

                    {monthEvents.filter(
                      (event) =>
                        CalendarService.dayNumber(event.date) === day
                    ).length > 3 && (
                      <small>
                        +
                        {monthEvents.filter(
                          (event) =>
                            CalendarService.dayNumber(event.date) === day
                        ).length - 3}
                      </small>
                    )}
                  </div>
                </button>
              )
            )}
          </div>
        </article>

        <aside className="calendar-sidebar">
          <article className="panel calendar-upcoming">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">À venir</p>
                <h3>Prochains événements</h3>
              </div>
            </div>

            <div className="calendar-upcoming-list">
              {upcoming.map((event) => (
                <button
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                >
                  <div className={`event-source-dot ${event.source}`} />
                  <div>
                    <span>
                      {event.date} {event.time && `· ${event.time}`}
                    </span>
                    <strong>{event.title}</strong>
                    <small>
                      {event.athlete || event.place || "KLIQUE"}
                    </small>
                  </div>
                  <span className={`priority ${priorityClass(event.priority)}`}>
                    {event.priority}
                  </span>
                </button>
              ))}
            </div>
          </article>

          <article className="panel calendar-legend">
            <p className="eyebrow">Légende</p>
            <h3>Types d’événements</h3>
            <div>
              <span><i className="shooting" /> Shooting</span>
              <span><i className="publication" /> Publication</span>
              <span><i className="meeting" /> Rendez-vous</span>
              <span><i className="task" /> Tâche</span>
            </div>
          </article>
        </aside>
      </section>

      {showCreate && (
        <Modal title="Créer un événement" onClose={() => setShowCreate(false)}>
          <form className="modal-form" onSubmit={createEvent}>
            <label>
              <span>Type</span>
              <select
                value={form.source}
                onChange={(event) =>
                  setForm({
                    ...form,
                    source: event.target.value as NewCalendarEvent["source"],
                  })
                }
              >
                <option value="shooting">Shooting</option>
                <option value="publication">Publication</option>
                <option value="meeting">Rendez-vous</option>
                <option value="task">Tâche</option>
              </select>
            </label>

            <label>
              <span>Athlète</span>
              <select
                value={form.athlete}
                onChange={(event) =>
                  setForm({ ...form, athlete: event.target.value })
                }
              >
                <option value="">Aucun / général</option>
                {athletes.map((athlete) => (
                  <option key={athlete.name}>{athlete.name}</option>
                ))}
              </select>
            </label>

            <label className="modal-wide">
              <span>Titre</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                required
              />
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
                required
              />
            </label>

            <label>
              <span>Heure</span>
              <input
                type="time"
                value={form.time}
                onChange={(event) =>
                  setForm({ ...form, time: event.target.value })
                }
              />
            </label>

            <label>
              <span>Lieu / plateforme</span>
              <input
                value={form.place}
                onChange={(event) =>
                  setForm({ ...form, place: event.target.value })
                }
              />
            </label>

            <label>
              <span>Priorité</span>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm({
                    ...form,
                    priority: event.target.value as NewCalendarEvent["priority"],
                  })
                }
              >
                <option>Faible</option>
                <option>Moyenne</option>
                <option>Haute</option>
                <option>Urgente</option>
              </select>
            </label>

            <label className="modal-wide">
              <span>Notes</span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
              />
            </label>

            <div className="modal-actions modal-wide">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCreate(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={saving}>
                {saving ? "Création…" : "Créer l’événement"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selectedDay && (
        <Modal
          title={`Événements du ${selectedDay}`}
          onClose={() => setSelectedDay(null)}
        >
          <div className="day-events-modal">
            {selectedDayEvents.length === 0 ? (
              <div className="empty-day-message">
                <strong>Aucun événement</strong>
                <p>Cette journée est libre.</p>
              </div>
            ) : (
              selectedDayEvents.map((event) => (
                <button
                  key={event.id}
                  className="day-event-row"
                  onClick={() => {
                    setSelectedDay(null);
                    setSelectedEvent(event);
                  }}
                >
                  <div className={`event-source-dot ${event.source}`} />
                  <div>
                    <span>{event.time || "Toute la journée"}</span>
                    <strong>{event.title}</strong>
                    <small>{event.athlete || event.place || "KLIQUE"}</small>
                  </div>
                  <span className={`priority ${priorityClass(event.priority)}`}>
                    {event.priority}
                  </span>
                </button>
              ))
            )}
          </div>
        </Modal>
      )}

      {selectedEvent && (
        <Modal
          title={selectedEvent.title}
          onClose={() => setSelectedEvent(null)}
        >
          <div className="calendar-event-detail">
            <section>
              <div>
                <span>Date</span>
                <strong>{selectedEvent.date}</strong>
              </div>
              <div>
                <span>Heure</span>
                <strong>{selectedEvent.time || "Toute la journée"}</strong>
              </div>
              <div>
                <span>Priorité</span>
                <strong>{selectedEvent.priority}</strong>
              </div>
            </section>

            <div className="calendar-event-info">
              <div>
                <span>Athlète</span>
                <strong>{selectedEvent.athlete || "Événement général"}</strong>
              </div>
              <div>
                <span>Lieu</span>
                <strong>{selectedEvent.place || "Non renseigné"}</strong>
              </div>
              <div>
                <span>Statut</span>
                <strong>{selectedEvent.status}</strong>
              </div>
              <div>
                <span>Notes</span>
                <strong>{selectedEvent.notes || "Aucune note"}</strong>
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => setSelectedEvent(null)}
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
