import { NextResponse } from "next/server";
import type { ContextCollectionResponse } from "@/types/context-intelligence";
import { collectContextIntelligence, toContextCollectionErrorResponse } from "@/services/context-intelligence/collector";
import { validateContextCollectionRequest } from "@/services/context-intelligence/request-validation";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requireContentAccess(request);
    const body = await request.json();
    const payload = validateContextCollectionRequest(body);
    const response = await collectContextIntelligence(payload);

    if (!response.ok) {
      return NextResponse.json(response satisfies ContextCollectionResponse, {
        status: response.code === "INVALID_CONTEXT_REQUEST" ? 400 : 502,
      });
    }

    return NextResponse.json(response satisfies ContextCollectionResponse);
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    const response = toContextCollectionErrorResponse(error);
    return NextResponse.json(response satisfies ContextCollectionResponse, {
      status: response.code === "INVALID_CONTEXT_REQUEST" ? 400 : 500,
    });
  }
}
