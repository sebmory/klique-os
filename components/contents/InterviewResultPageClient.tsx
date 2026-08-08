"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InterviewResultScreen } from "@/components/contents/InterviewResultScreen";
import { ContentDocumentEditor } from "@/components/contents/ContentDocumentEditor";
import { ContentDocumentDraftService } from "@/services/content-documents/draft-service";
import type {
  PublicationGenerationRequest,
  PublicationGenerationResult,
  InterviewGenerationRequest,
  InterviewGenerationResult,
  ReelGenerationRequest,
  ReelGenerationResult,
} from "@/types/content-generation";
import type { ContentDocument } from "@/types/content-document";
import type { CreationPreparationPayload } from "@/services/content-creation-assistant";

const RESULT_STORAGE_KEY = "klique.contents.creation-assistant.interview-result.v1";

type StoredInterviewResult = {
  payload: CreationPreparationPayload;
  request: InterviewGenerationRequest | PublicationGenerationRequest | ReelGenerationRequest;
  result: InterviewGenerationResult | PublicationGenerationResult | ReelGenerationResult;
  createdAt: string;
};

export function InterviewResultPageClient() {
  const [parsed, setParsed] = useState<StoredInterviewResult | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<ContentDocument | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const restore = async () => {
      const raw = window.sessionStorage.getItem(RESULT_STORAGE_KEY);
      if (raw) {
        try {
          const next = JSON.parse(raw) as StoredInterviewResult;
          if (!active) return;
          setParsed(next);
          setRestoredDraft(null);
          setReady(true);
          return;
        } catch {
          // Ignore malformed session cache and fall back to persisted draft.
        }
      }

      const documentId = new URLSearchParams(window.location.search).get("documentId")?.trim() || "";
      if (documentId) {
        const draft = await ContentDocumentDraftService.loadDraft(documentId);
        if (!active) return;
        setRestoredDraft(draft);
      } else if (active) {
        setRestoredDraft(null);
      }

      if (active) {
        setParsed(null);
        setReady(true);
      }
    };

    void restore();

    return () => {
      active = false;
    };
  }, []);

  const saveDraft = async (document: ContentDocument) => {
    await ContentDocumentDraftService.saveDraft(document);
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
