"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InterviewResultScreen } from "@/components/contents/InterviewResultScreen";
import { ArticleResultScreen } from "@/components/contents/ArticleResultScreen";
import { ArticleDocumentEditor } from "@/components/contents/ArticleDocumentEditor";
import { ContentDocumentEditor } from "@/components/contents/ContentDocumentEditor";
import { ContentDocumentDraftService } from "@/services/content-documents/draft-service";
import { mapArticleGenerationToDocument } from "@/services/content-documents/document-mapper";
import { runContentsBackfill } from "@/services/content-backfill";
import {
  restoreArticleResultSession,
  restoreInterviewResultSession,
  type StoredArticleResult,
  type StoredInterviewResult,
} from "@/services/content-result-sessions";
import type { ArticleDocument, ContentDocument } from "@/types/content-document";
import type { ContentDocumentDraftSaveResult } from "@/services/content-documents/draft-service";

export function InterviewResultPageClient() {
  const [parsed, setParsed] = useState<StoredInterviewResult | null>(null);
  const [articleResult, setArticleResult] = useState<StoredArticleResult | null>(null);
  const [articleDocument, setArticleDocument] = useState<ArticleDocument | null>(null);
  const [articleEditing, setArticleEditing] = useState(false);
  const [articleEditError, setArticleEditError] = useState<string | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<ContentDocument | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void runContentsBackfill();

    const restore = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("sessionId")?.trim() || "";
      const documentId = params.get("documentId")?.trim() || "";

      if (documentId) {
        const storedDocument = await ContentDocumentDraftService.loadDraft(documentId);
        if (!active) return;
        if (storedDocument?.type === "article") {
          setArticleDocument(storedDocument);
          setArticleResult(null);
          setParsed(null);
          setRestoredDraft(null);
          setReady(true);
          return;
        }
      }

      const restoredArticle = await restoreArticleResultSession(sessionId);
      if (!active) return;
      if (restoredArticle) {
        setArticleResult(restoredArticle);
        setArticleDocument(null);
        setParsed(null);
        setRestoredDraft(null);
        setReady(true);
        return;
      }

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

  const startArticleEditing = async () => {
    if (!articleResult || articleEditing) return;
    setArticleEditing(true);
    setArticleEditError(null);
    try {
      const document = mapArticleGenerationToDocument({ storedArticleResult: articleResult });
      const saved = await ContentDocumentDraftService.saveDraft(document);
      if (saved.cloud.status === "conflict") {
        throw new Error(saved.cloud.message || "Conflit de version du brouillon Article.");
      }
      setArticleDocument(saved.document as ArticleDocument);
      const url = new URL(window.location.href);
      url.searchParams.set("documentId", saved.document.id);
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    } catch (error) {
      setArticleEditError(error instanceof Error ? error.message : "Impossible de préparer l’éditeur Article.");
    } finally {
      setArticleEditing(false);
    }
  };

  const saveArticleDocument = async (document: ArticleDocument) => {
    const saved = await ContentDocumentDraftService.saveDraft(document);
    if (saved.cloud.status === "conflict") {
      throw new Error(saved.cloud.message || "Conflit de version du brouillon Article.");
    }
    setArticleDocument(saved.document as ArticleDocument);
  };

  if (!ready) {
    return null;
  }

  if (!parsed) {
    if (articleDocument) {
      return (
        <>
          {articleResult ? <button type="button" className="contents-secondary-button" onClick={() => setArticleDocument(null)}>Revenir à l’aperçu</button> : null}
          <ArticleDocumentEditor initialDocument={articleDocument} onDocumentChange={setArticleDocument} onSave={saveArticleDocument} />
        </>
      );
    }
    if (articleResult) {
      return <ArticleResultScreen request={articleResult.request} result={articleResult.result} onEdit={() => void startArticleEditing()} editing={articleEditing} editError={articleEditError} />;
    }
    if (restoredDraft) {
      return <ContentDocumentEditor initialDocument={restoredDraft} onSaveDraft={saveDraft} isPersistedInCloud />;
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
