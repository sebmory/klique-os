import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import type { ContextCollectionResponse } from "@/types/context-intelligence";
import { collectContextIntelligence, toContextCollectionErrorResponse } from "@/services/context-intelligence/collector";
import { validateContextCollectionRequest } from "@/services/context-intelligence/request-validation";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const accessContext = await requireContentAccess(request);
    const body = await request.json();
    const payload = validateContextCollectionRequest(body);
    const usageContext = {
      workspaceId: accessContext.workspaceId,
      clerkUserId: accessContext.clerkUserId,
      role: accessContext.role,
      requestGroupId: randomUUID(),
    };
    const response = await collectContextIntelligence(payload, usageContext);

    if (!response.ok) {
      return NextResponse.json(response satisfies ContextCollectionResponse, {
        status:
          response.code === "INVALID_CONTEXT_REQUEST"
            ? 400
            : response.code === "AI_CREDIT_INSUFFICIENT" || response.code === "AI_CREDIT_NO_ACTIVE_PERIOD"
              ? 402
              : 502,
      });
    }

    return NextResponse.json(response satisfies ContextCollectionResponse);
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    const response = toContextCollectionErrorResponse(error);
    return NextResponse.json(response satisfies ContextCollectionResponse, {
      status:
        response.code === "INVALID_CONTEXT_REQUEST"
          ? 400
          : response.code === "AI_CREDIT_INSUFFICIENT" || response.code === "AI_CREDIT_NO_ACTIVE_PERIOD"
            ? 402
            : 500,
    });
  }
}
