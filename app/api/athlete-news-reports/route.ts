import { NextResponse } from "next/server";
import {
  AthleteNewsReportService,
  athleteNewsErrorStatus,
  requireAthleteNewsIdentity,
} from "@/lib/athlete-news-reports/service";
import {
  deleteAthleteNewsPhoto,
  uploadAthleteNewsPhoto,
} from "@/lib/athlete-news-reports/photo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateJson = (body: unknown, init?: ResponseInit) => NextResponse.json(body, {
  ...init,
  headers: { ...init?.headers, "Cache-Control": "private, no-store" },
});

export async function GET(request: Request) {
  try {
    const identity = await requireAthleteNewsIdentity(request);
    const reports = await AthleteNewsReportService.listOwn(identity);
    return privateJson({ ok: true, reports });
  } catch (error) {
    return privateJson(
      { ok: false, message: error instanceof Error ? error.message : "Impossible de charger vos actualités." },
      { status: athleteNewsErrorStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  let uploadedPhotoUrl: string | null = null;
  let reportPersisted = false;
  try {
    const identity = await requireAthleteNewsIdentity(request);
    const formData = await request.formData();
    const clientRequestId = formData.get("clientRequestId");
    const existing = await AthleteNewsReportService.findByClientRequestId(clientRequestId, identity);
    if (existing) {
      await AthleteNewsReportService.notifyAdmins(existing, identity);
      return privateJson({ ok: true, report: existing });
    }

    const submittedPhoto = formData.get("photo");
    const photo = submittedPhoto instanceof File && submittedPhoto.size > 0
      ? await uploadAthleteNewsPhoto(submittedPhoto)
      : null;
    uploadedPhotoUrl = photo?.url ?? null;

    const result = await AthleteNewsReportService.create({
      clientRequestId,
      message: formData.get("message"),
      eventDate: formData.get("eventDate"),
      externalUrl: formData.get("externalUrl"),
      photo,
    }, identity);
    reportPersisted = true;
    if (!result.created && uploadedPhotoUrl) {
      await deleteAthleteNewsPhoto(uploadedPhotoUrl);
      uploadedPhotoUrl = null;
    }
    await AthleteNewsReportService.notifyAdmins(result.report, identity);
    uploadedPhotoUrl = null;
    return privateJson({ ok: true, report: result.report }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (uploadedPhotoUrl && !reportPersisted) {
      try {
        await deleteAthleteNewsPhoto(uploadedPhotoUrl);
      } catch {
        console.error("Nettoyage d’une photo de signalement Athlète impossible.");
      }
    }
    const message = error instanceof Error ? error.message : "Impossible de transmettre cette actualité.";
    return privateJson({ ok: false, message }, { status: athleteNewsErrorStatus(error) });
  }
}
