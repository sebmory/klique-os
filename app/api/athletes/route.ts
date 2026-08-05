import { NextResponse } from "next/server";
import { demoAthletes } from "@/lib/demo-data";
import { getAthletesFromGoogleSheets } from "@/lib/google-sheets";
import type { AthletesResponse } from "@/types/athlete";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const athletes = await getAthletesFromGoogleSheets();

    const response: AthletesResponse = {
      athletes,
      source: "google-sheets",
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur Google Sheets.";

    const response: AthletesResponse = {
      athletes: demoAthletes,
      source: "demo",
      message,
    };

    return NextResponse.json(response);
  }
}
