import { NextResponse } from "next/server";
import { contentAccessErrorResponse, requireContentAccess } from "@/lib/content-storage/access";
import { getMediaSubscription, listMediaSubscriptionsByWorkspace } from "@/lib/media-subscriptions/repository";
import type { MediaSubscriptionRecord } from "@/types/media-subscriptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Les identifiants fournisseur ne sont jamais exposes par cette route.
const toPublicSubscription = (subscription: MediaSubscriptionRecord) => ({
  id: subscription.id,
  clerkUserId: subscription.clerkUserId,
  planCode: subscription.planCode,
  status: subscription.status,
  billingProvider: subscription.billingProvider,
  priceCents: subscription.priceCents,
  currency: subscription.currency,
  creditsPerPeriod: subscription.creditsPerPeriod,
  interval: subscription.interval,
  currentPeriodStart: subscription.currentPeriodStart,
  currentPeriodEnd: subscription.currentPeriodEnd,
  cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
});

export async function GET(request: Request) {
  try {
    const accessContext = await requireContentAccess(request);
    const url = new URL(request.url);
    const requestedClerkUserId = url.searchParams.get("clerkUserId")?.trim() ?? "";

    if (!accessContext.isAdmin) {
      const subscription = await getMediaSubscription({
        workspaceId: accessContext.workspaceId,
        clerkUserId: accessContext.clerkUserId,
      });

      return NextResponse.json({ ok: true, subscription: subscription ? toPublicSubscription(subscription) : null });
    }

    if (requestedClerkUserId) {
      const subscription = await getMediaSubscription({
        workspaceId: accessContext.workspaceId,
        clerkUserId: requestedClerkUserId,
      });

      return NextResponse.json({ ok: true, subscription: subscription ? toPublicSubscription(subscription) : null });
    }

    const subscriptions = await listMediaSubscriptionsByWorkspace(accessContext.workspaceId);

    return NextResponse.json({ ok: true, subscriptions: subscriptions.map(toPublicSubscription) });
  } catch (error) {
    const accessResponse = contentAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[media_subscriptions] Failed to read subscriptions: ${reason}`);
    return NextResponse.json({ ok: false, message: "Impossible de lire les abonnements media." }, { status: 500 });
  }
}
