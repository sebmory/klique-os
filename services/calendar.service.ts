import type {
  CalendarEvent,
  CalendarResponse,
  NewCalendarEvent,
} from "@/types/calendar";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Une erreur est survenue.");
  }
  return data as T;
}

export const CalendarService = {
  async list(): Promise<CalendarResponse> {
    const response = await fetch("/api/calendar", { cache: "no-store" });
    return parseResponse<CalendarResponse>(response);
  },

  async create(event: NewCalendarEvent): Promise<void> {
    const response = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    await parseResponse<{ success: boolean }>(response);
  },

  monthKey(date: string): string {
    return date.slice(0, 7);
  },

  dayNumber(date: string): number {
    return Number(date.slice(8, 10));
  },

  sort(events: CalendarEvent[]): CalendarEvent[] {
    return [...events].sort((a, b) =>
      `${a.date}T${a.time || "00:00"}`.localeCompare(
        `${b.date}T${b.time || "00:00"}`
      )
    );
  },
};
