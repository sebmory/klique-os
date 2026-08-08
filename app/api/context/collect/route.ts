import { NextResponse } from "next/server";
import type { ContextCollectionResponse } from "@/types/context-intelligence";
import { collectContextIntelligence, toContextCollectionErrorResponse } from "@/services/context-intelligence/collector";
import { validateContextCollectionRequest } from "@/services/context-intelligence/request-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
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
    const response = toContextCollectionErrorResponse(error);
    return NextResponse.json(response satisfies ContextCollectionResponse, {
      status: response.code === "INVALID_CONTEXT_REQUEST" ? 400 : 500,
    });
  }
}
