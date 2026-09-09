import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import {
  MediaSubjectValidationError,
  createMediaSubject,
  deleteMediaSubject,
  listMediaSubjects,
  updateMediaSubject,
} from "@/lib/media-subjects/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const errorResponse = (error: unknown) => {
  const accessResponse = contentAccessErrorResponse(error);
  if (accessResponse) return accessResponse;

  if (error instanceof MediaSubjectValidationError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message === "Forbidden") {
    return NextResponse.json({ ok: false, message: "Acces refuse." }, { status: 403 });
  }
  if (message === "NotFound") {
    return NextResponse.json({ ok: false, message: "Sujet introuvable." }, { status: 404 });
  }

  console.error(`[media_subjects] ${message}`);
  return NextResponse.json({ ok: false, message: "Impossible de traiter les sujets media." }, { status: 500 });
};

export async function GET(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const subjects = await listMediaSubjects(access);
    return NextResponse.json({ ok: true, subjects });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Payload JSON invalide." }, { status: 400 });
    }

    const subject = await createMediaSubject(access, {
      title: String(body.title ?? ""),
      summary: String(body.summary ?? ""),
      angle: String(body.angle ?? ""),
      sport: body.sport === undefined || body.sport === null ? null : String(body.sport),
      location: body.location === undefined || body.location === null ? null : String(body.location),
      date: body.date,
      coverImageUrl: body.coverImageUrl,
      availableRequestTypes: body.availableRequestTypes,
      athleteIds: body.athleteIds,
      status: body.status,
    });

    return NextResponse.json({ ok: true, subject }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Payload JSON invalide." }, { status: 400 });
    }

    const subjectId = String(body.subjectId ?? "").trim();
    if (!subjectId) {
      return NextResponse.json({ ok: false, message: "subjectId requis." }, { status: 400 });
    }

    const subject = await updateMediaSubject(access, subjectId, {
      title: String(body.title ?? ""),
      summary: String(body.summary ?? ""),
      angle: String(body.angle ?? ""),
      sport: body.sport === undefined || body.sport === null ? null : String(body.sport),
      location: body.location === undefined || body.location === null ? null : String(body.location),
      date: body.date,
      coverImageUrl: body.coverImageUrl,
      availableRequestTypes: body.availableRequestTypes,
      athleteIds: body.athleteIds,
      status: body.status,
    });

    return NextResponse.json({ ok: true, subject });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await requireContentAccess(request);
    const subjectId = new URL(request.url).searchParams.get("subjectId")?.trim() ?? "";
    if (!subjectId) {
      return NextResponse.json({ ok: false, message: "subjectId requis." }, { status: 400 });
    }

    await deleteMediaSubject(access, subjectId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
