import { NextRequest, NextResponse } from "next/server";
import { evaluateBusinessAccess, getCurrentUserPermissionContext } from "@/lib/clerk-access/service";
import * as googleSheets from "@/lib/google-sheets";
import { getEcosystemPartnersFrom06Partenaires } from "@/lib/google-sheets";
import type {
  NewPartner,
  PartnerResponse,
  PartnerUpdate,
} from "@/types/partner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const normalize = (value: unknown): string => String(value ?? "").trim();

const normalizeKey = (value: string): string =>
  normalize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isStructuredCategory = (value: string): boolean => {
  const text = normalize(value);
  if (!text) return false;
  if (text.length > 50) return false;
  if (/[.!?]/.test(text)) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return wordCount <= 6;
};

const resolvePublicType = (partner: PartnerResponse["partners"][number]): "Partenaire" | "Expert" | "Média" => {
  const relation = normalizeKey(partner.relationType ?? partner.type ?? "");
  if (partner.expertKlique || relation.includes("expert")) {
    return "Expert";
  }
  if (relation.includes("media") || relation.includes("média")) {
    return "Média";
  }
  const category = normalizeKey(partner.category ?? "");
  if (category.includes("media") || category.includes("média")) {
    return "Média";
  }
  return "Partenaire";
};

const splitSiteAndInstagram = (website: string, instagram: string): { website: string; instagram: string } => {
  const websiteText = normalize(website);
  const instagramText = normalize(instagram);

  const looksLikeInstagram = (value: string): boolean =>
    Boolean(value) && (value.toLowerCase().includes("instagram") || value.startsWith("@"));

  const resolvedInstagram = looksLikeInstagram(instagramText)
    ? instagramText
    : looksLikeInstagram(websiteText)
      ? websiteText
      : "";

  const resolvedWebsite = looksLikeInstagram(websiteText)
    ? ""
    : websiteText;

  return {
    website: resolvedWebsite,
    instagram: resolvedInstagram,
  };
};

const toAthleteEcosystemPartner = (partner: PartnerResponse["partners"][number]) => ({
  id: partner.id,
  name: partner.name,
  description: normalize(partner.description) || normalize(partner.expertise) || normalize(partner.services),
  type: resolvePublicType(partner),
  relationType: resolvePublicType(partner),
  category: isStructuredCategory(partner.category) ? normalize(partner.category) : "Non renseigne",
  contact: partner.contact,
  contactName: partner.contactName ?? "",
  email: isValidEmail(normalize(partner.email)) ? normalize(partner.email) : "",
  ...splitSiteAndInstagram(partner.website, partner.instagram),
  benefits: normalize(partner.benefits),
  benefitDetails: normalize(partner.benefitDetails),
  collaboration: normalize(partner.collaboration),
  memberOffer: normalize(partner.memberOffer) || normalize(partner.benefits) || normalize(partner.benefitDetails),
  expertise: normalize(partner.expertise),
  services: normalize(partner.services),
  expertKlique: partner.expertKlique,
});

export async function GET(request: NextRequest) {
  try {
    const permissionContext = await getCurrentUserPermissionContext(request);
    const canReadAsAdmin = permissionContext.isAdmin && permissionContext.isActive;
    const canReadAsAthlete = permissionContext.isAthlete && permissionContext.isActive;

    if (!canReadAsAdmin && !canReadAsAthlete) {
      return NextResponse.json({ partners: [], source: "google-sheets" }, { status: 403 });
    }

    const partners = canReadAsAthlete
      ? await getEcosystemPartnersFrom06Partenaires()
      : await googleSheets.getPartnersFromGoogleSheets();

    if (canReadAsAthlete) {
      return NextResponse.json({
        partners: partners.map(toAthleteEcosystemPartner),
        source: "google-sheets",
      });
    }

    const response: PartnerResponse = {
      partners,
      source: "google-sheets",
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        partners: [],
        source: "google-sheets",
        message:
          error instanceof Error ? error.message : "Erreur Partenaires.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await request.json()) as NewPartner;

    if (!body.name || !body.category) {
      return NextResponse.json(
        { error: "Le nom et la catégorie sont obligatoires." },
        { status: 400 }
      );
    }

    await googleSheets.addPartnerToGoogleSheets(body);
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
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const body = (await request.json()) as PartnerUpdate;

    if (!body.row) {
      return NextResponse.json(
        { error: "La ligne partenaire est obligatoire." },
        { status: 400 }
      );
    }

    await googleSheets.updatePartnerInGoogleSheets(body);
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
    const accessCheck = await evaluateBusinessAccess(request, { action: "write:crm" });
    if (!accessCheck.allowed) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const row = Number(request.nextUrl.searchParams.get("row"));

    if (!row) {
      return NextResponse.json(
        { error: "La ligne partenaire est obligatoire." },
        { status: 400 }
      );
    }

    await googleSheets.deletePartnerFromGoogleSheets(row);
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
