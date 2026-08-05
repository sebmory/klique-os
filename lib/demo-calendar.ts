import type { CalendarEvent } from "@/types/calendar";

export const demoCalendarEvents: CalendarEvent[] = [
  {
    id: "demo-1",
    source: "shooting",
    title: "Portrait Premium",
    athlete: "Loan Cueto",
    date: "2026-08-06",
    time: "14:00",
    place: "Fribourg",
    status: "Planifié",
    priority: "Haute",
    notes: "",
  },
  {
    id: "demo-2",
    source: "publication",
    title: "Publication Instagram",
    athlete: "Mila Benjak",
    date: "2026-08-07",
    time: "11:00",
    place: "Instagram",
    status: "À publier",
    priority: "Moyenne",
    notes: "Portrait + texte bilingue",
  },
];
