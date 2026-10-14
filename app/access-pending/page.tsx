"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type AccessPayload = {
  userAccess?: {
    role?: string;
    status?: string;
    athleteId?: string | null;
    partnerId?: string | null;
    mediaId?: string | null;
    workspaceId?: string | null;
  } | null;
  creativeAccess?: {
    status?: string;
    creativeProfileStatus?: string | null;
  } | null;
};

export const resolveActivatedAccessPath = (payload: AccessPayload): string | null => {
  const access = payload.userAccess;
  const hasWorkspace = typeof access?.workspaceId === "string" && access.workspaceId.trim().length > 0;
  if (access?.status === "active" && hasWorkspace) {
    if (access.role === "admin") return "/today";
    if (access.role === "athlete" && access.athleteId?.trim()) return "/athlete";
    if (access.role === "partner_expert" && access.partnerId?.trim()) return "/partner";
    if (access.role === "media") return "/media-desk";
  }

  if (
    payload.creativeAccess?.status === "active"
    && payload.creativeAccess.creativeProfileStatus === "active"
  ) {
    return "/creative";
  }

  return null;
};

export default function AccessPendingPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const attemptedRef = useRef(false);
  const [isActivating, setIsActivating] = useState(true);
  const [activationError, setActivationError] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || attemptedRef.current) return;
    attemptedRef.current = true;

    const activate = async () => {
      try {
        const response = await fetch("/api/clerk/access", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return;

        const destination = resolveActivatedAccessPath(await response.json() as AccessPayload);
        if (destination) {
          router.replace(destination);
          return;
        }
      } catch {
        setActivationError(true);
      } finally {
        setIsActivating(false);
      }
    };

    void activate();
  }, [isLoaded, isSignedIn, router]);

  const showActivation = isActivating && (!isLoaded || isSignedIn);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "var(--color-bg, #f7f7f5)",
        color: "var(--color-text, #171717)",
      }}
    >
      <section style={{ width: "100%", maxWidth: "560px", textAlign: "center" }}>
        <h1 style={{ margin: "0 0 12px", fontSize: "28px", lineHeight: 1.2 }}>
          {showActivation ? "Activation de votre accès…" : "Accès KLIQUE en attente"}
        </h1>
        {showActivation ? (
          <p style={{ margin: 0, lineHeight: 1.6 }}>Nous vérifions votre invitation KLIQUE.</p>
        ) : (
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            {activationError
              ? "La vérification automatique n’a pas abouti. Votre accès reste inchangé."
              : "Votre accès KLIQUE n’est pas encore activé. Contactez un administrateur si vous pensez qu’il s’agit d’une erreur."}
          </p>
        )}
      </section>
    </main>
  );
}