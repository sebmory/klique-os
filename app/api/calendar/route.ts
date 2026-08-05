import { NextRequest, NextResponse } from "next/server";
import { demoCalendarEvents } from "@/lib/demo-calendar";
import {
  addCalendarEventToGoogleSheets,
  getCalendarEventsFromGoogleSheets,
} from "@/lib/google-sheets";
import type {
  CalendarResponse,
  NewCalendarEvent,
} from "@/types/calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await getCalendarEventsFromGoogleSheets();
    const response: CalendarResponse = {
      events,
      source: "google-sheets",
    };
    return NextResponse.json(response);
  } catch (error) {
    const response: CalendarResponse = {
      events: demoCalendarEvents,
      source: "demo",
      message:
        error instanceof Error ? error.message : "Erreur Calendrier.",
    };
    return NextResponse.json(response);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NewCalendarEvent;

    if (!body.title || !body.date) {
      return NextResponse.json(
        { error: "Le titre et la date sont obligatoires." },
        { status: 400 }
      );
    }

    await addCalendarEventToGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de créer l’événement.",
      },
      { status: 500 }
    );
  }
}
