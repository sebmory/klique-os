import { NextRequest, NextResponse } from "next/server";
import { demoPartners } from "@/lib/demo-partners";
import {
  addPartnerToGoogleSheets,
  deletePartnerFromGoogleSheets,
  getPartnersFromGoogleSheets,
  updatePartnerInGoogleSheets,
} from "@/lib/google-sheets";
import type {
  NewPartner,
  PartnerResponse,
  PartnerUpdate,
} from "@/types/partner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const partners = await getPartnersFromGoogleSheets();
    const response: PartnerResponse = {
      partners,
      source: "google-sheets",
    };
    return NextResponse.json(response);
  } catch (error) {
    const response: PartnerResponse = {
      partners: demoPartners,
      source: "demo",
      message:
        error instanceof Error ? error.message : "Erreur Partenaires.",
    };
    return NextResponse.json(response);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NewPartner;

    if (!body.name || !body.category) {
      return NextResponse.json(
        { error: "Le nom et la catégorie sont obligatoires." },
        { status: 400 }
      );
    }

    await addPartnerToGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible d’ajouter le partenaire.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as PartnerUpdate;

    if (!body.row) {
      return NextResponse.json(
        { error: "La ligne partenaire est obligatoire." },
        { status: 400 }
      );
    }

    await updatePartnerInGoogleSheets(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de modifier le partenaire.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const row = Number(request.nextUrl.searchParams.get("row"));

    if (!row) {
      return NextResponse.json(
        { error: "La ligne partenaire est obligatoire." },
        { status: 400 }
      );
    }

    await deletePartnerFromGoogleSheets(row);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de supprimer le partenaire.",
      },
      { status: 500 }
    );
  }
}
