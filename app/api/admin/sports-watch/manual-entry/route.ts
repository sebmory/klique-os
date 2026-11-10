import { NextResponse } from "next/server";
import { isSportsWatchEnabled } from "@/lib/sports-watch/activation";
import {
  SportsWatchManualEntryConflictError,
  SportsWatchManualEntryService,
} from "@/lib/sports-watch/manual-entry-service";
import {
  requireSportsWatchAdmin,
  sportsWatchErrorStatus,
} from "@/lib/sports-watch/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const disabledResponse = () => NextResponse.json(
  {
    ok: false,
    error: {
      code: "disabled",
      message: "La veille sportive est désactivée.",
    },
  },
  { status: 404, headers: { "Cache-Control": "private, no-store" } },
);

export async function POST(request: Request) {
  if (!isSportsWatchEnabled()) return disabledResponse();
  try {
    const identity = await requireSportsWatchAdmin(request);
    const body = await request.json() as unknown;
    const result = await SportsWatchManualEntryService.create(body, identity);
    return NextResponse.json(
      { ok: true, ...result },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Impossible de créer l’actualité manuelle.";
    const conflict = error instanceof SportsWatchManualEntryConflictError
      ? error.duplicates
      : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error instanceof SportsWatchManualEntryConflictError
            ? "potential_duplicate"
            : "manual_entry_failed",
          message,
          ...(conflict ? { duplicates: conflict } : {}),
        },
      },
      {
        status: sportsWatchErrorStatus(error),
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
