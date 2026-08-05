export type CalendarEvent = {
  id: string;
  source: "shooting" | "publication" | "meeting" | "task";
  title: string;
  athlete: string;
  date: string;
  time: string;
  place: string;
  status: string;
  priority: "Faible" | "Moyenne" | "Haute" | "Urgente";
  notes: string;
  shootingRow?: number;
};

export type CalendarResponse = {
  events: CalendarEvent[];
  source: "google-sheets" | "demo";
  message?: string;
};

export type NewCalendarEvent = Omit<CalendarEvent, "id">;
