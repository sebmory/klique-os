"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InterviewResultScreen } from "@/components/contents/InterviewResultScreen";
import { ContentDocumentEditor } from "@/components/contents/ContentDocumentEditor";
import { ContentDocumentDraftService } from "@/services/content-documents/draft-service";
import { runContentsBackfill } from "@/services/content-backfill";
import {
  restoreInterviewResultSession,
  type StoredInterviewResult,
} from "@/services/content-result-sessions";
import type { ContentDocument } from "@/types/content-document";
import type { ContentDocumentDraftSaveResult } from "@/services/content-documents/draft-service";

export function InterviewResultPageClient() {
  const [parsed, setParsed] = useState<StoredInterviewResult | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<ContentDocument | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void runContentsBackfill();

    const restore = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("sessionId")?.trim() || "";
      const documentId = params.get("documentId")?.trim() || "";

      const restored = await restoreInterviewResultSession(sessionId, documentId);
      if (!active) return;

      if (restored.source === "cloud" || restored.source === "sessionStorage") {
        setParsed(restored.result);
        setRestoredDraft(null);
        setReady(true);
        return;
      }

      if (restored.source === "draft") {
        setParsed(null);
        setRestoredDraft(restored.document);
        setReady(true);
        return;
      }

      setParsed(null);
      setRestoredDraft(null);
      setReady(true);
    };

    void restore();

    return () => {
      active = false;
    };
  }, []);

  const saveDraft = async (document: ContentDocument): Promise<ContentDocumentDraftSaveResult> => {
    return ContentDocumentDraftService.saveDraft(document);
  };

  if (!ready) {
    return null;
  }

  if (!parsed) {
    if (restoredDraft) {
      return <ContentDocumentEditor initialDocument={restoredDraft} onSaveDraft={saveDraft} />;
    }

    return (
      <section className="interview-error" role="alert">
        <h1>Resultat indisponible</h1>
        <p>Relancez une generation depuis l assistant de creation.</p>
        <Link href="/contents/create?step=summary" className="crm-primary-action">
          Revenir aux parametres
        </Link>
      </section>
    );
  }

  return (
    <InterviewResultScreen
      initialPayload={parsed.payload}
      initialRequest={parsed.request}
      initialResult={parsed.result}
      initialCreatedAt={parsed.createdAt}
    />
  );
}
