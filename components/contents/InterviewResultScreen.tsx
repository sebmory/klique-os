"use client";

import { useMemo, useState } from "react";
import type {
  GenerateContentApiResponse,
  PublicationGenerationRequest,
  PublicationGenerationResult,
  InterviewGenerationRequest,
  InterviewGenerationResult,
  ReelGenerationRequest,
  ReelGenerationResult,
} from "@/types/content-generation";
import type { ContentDocument } from "@/types/content-document";
import type { CreationPreparationPayload } from "@/services/content-creation-assistant";
import { ContentDocumentEditor } from "@/components/contents/ContentDocumentEditor";
import { ContentDocumentDraftService } from "@/services/content-documents/draft-service";
import { mapInterviewGenerationToDocument, mapPublicationGenerationToDocument, mapReelGenerationToDocument } from "@/services/content-documents/document-mapper";

type InterviewResultScreenProps = {
  initialPayload: CreationPreparationPayload;
  initialRequest: InterviewGenerationRequest | PublicationGenerationRequest | ReelGenerationRequest;
  initialResult: InterviewGenerationResult | PublicationGenerationResult | ReelGenerationResult;
  initialCreatedAt?: string;
};

export function InterviewResultScreen({
  initialPayload,
  initialRequest,
  initialResult,
  initialCreatedAt,
}: InterviewResultScreenProps) {
  const isPublicationFlow = initialRequest.requestType === "publication";
  const isReelFlow = initialRequest.requestType === "reel";

  const payloadForGeneration = useMemo(() => {
    return {
      ...initialPayload,
      parameters: {
        ...initialPayload.parameters,
        language: initialPayload.parameters?.language || "fr-CH",
      },
    };
  }, [initialPayload]);

  const [request, setRequest] = useState<InterviewGenerationRequest | PublicationGenerationRequest | ReelGenerationRequest>(initialRequest);
  const [result, setResult] = useState<InterviewGenerationResult | PublicationGenerationResult | ReelGenerationResult>(initialResult);
  const [documentId] = useState(() => `document-${initialCreatedAt || initialResult.metadata.generatedAt}`);
  const [selectedPublicationProposalId, setSelectedPublicationProposalId] = useState<string | null>(null);
  const [selectedReelConceptId, setSelectedReelConceptId] = useState<string | null>(null);

  const document = useMemo(() => {
    if (request.requestType === "interview") {
      return mapInterviewGenerationToDocument({
        request,
        result: result as InterviewGenerationResult,
        createdAt: initialCreatedAt,
        documentId,
      });
    }

    if (request.requestType === "publication") {
      const publicationResult = result as PublicationGenerationResult;
      const selectedId = selectedPublicationProposalId || publicationResult.proposals[0]?.id || "proposal-1";
      return mapPublicationGenerationToDocument({
        request,
        result: publicationResult,
        selectedProposalId: selectedId,
        createdAt: initialCreatedAt,
        documentId,
      });
    }

    if (request.requestType === "reel") {
      const reelResult = result as ReelGenerationResult;
      const selectedId = selectedReelConceptId || reelResult.concepts[0]?.id || "concept-1";
      return mapReelGenerationToDocument({
        request,
        result: reelResult,
        selectedConceptId: selectedId,
        createdAt: initialCreatedAt,
        documentId,
      });
    }

    return null;
  }, [documentId, initialCreatedAt, request, result, selectedPublicationProposalId, selectedReelConceptId]);

  const saveDraft = async (contentDocument: ContentDocument) => {
    await ContentDocumentDraftService.saveDraft(contentDocument);
  };

  const regenerateDocument = async (): Promise<ContentDocument> => {
    const response = await fetch("/api/content/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ payload: payloadForGeneration }),
    });

    const payload = (await response.json()) as GenerateContentApiResponse;
    if (!payload.ok) {
      throw new Error(payload.message || "Impossible de regenerer le document");
    }

    if (!("request" in payload) || !("result" in payload)) {
      throw new Error("Format de generation inattendu");
    }

    if (payload.request.requestType === "interview") {
      setRequest(payload.request);
      setResult(payload.result as InterviewGenerationResult);
      return mapInterviewGenerationToDocument({
        request: payload.request,
        result: payload.result as InterviewGenerationResult,
        createdAt: initialCreatedAt,
        documentId,
      });
    }

    if (payload.request.requestType === "publication") {
      setRequest(payload.request);
      setResult(payload.result as PublicationGenerationResult);
      const publicationResult = payload.result as PublicationGenerationResult;
      const selectedId = publicationResult.proposals[0]?.id || "proposal-1";
      setSelectedPublicationProposalId(selectedId);
      return mapPublicationGenerationToDocument({
        request: payload.request,
        result: publicationResult,
        selectedProposalId: selectedId,
        createdAt: initialCreatedAt,
        documentId,
      });
    }

    if (payload.request.requestType === "reel") {
      setRequest(payload.request);
      setResult(payload.result as ReelGenerationResult);
      const reelResult = payload.result as ReelGenerationResult;
      const selectedId = reelResult.concepts[0]?.id || "concept-1";
      setSelectedReelConceptId(selectedId);
      return mapReelGenerationToDocument({
        request: payload.request,
        result: reelResult,
        selectedConceptId: selectedId,
        createdAt: initialCreatedAt,
        documentId,
      });
    }

    throw new Error("Format de generation inattendu");
  };

  const regenerateSinglePublicationProposal = async (proposalId: string) => {
    if (request.requestType !== "publication") return;
    const publicationResult = result as PublicationGenerationResult;

    const response = await fetch("/api/content/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        operation: "publication_regenerate_one",
        publication: {
          request,
          result: publicationResult,
          proposalId,
        },
      }),
    });

    const payload = (await response.json()) as GenerateContentApiResponse;
    if (!payload.ok) {
      throw new Error(payload.message || "Impossible de regenerer la proposition");
    }
    if (!("operation" in payload) || payload.operation !== "publication_regenerate_one") {
      throw new Error("Operation non valide");
    }

    setResult((current) => {
      if (request.requestType !== "publication") return current;
      const typedCurrent = current as PublicationGenerationResult;
      return {
        ...typedCurrent,
        proposals: typedCurrent.proposals.map((proposal) =>
          proposal.id === proposalId ? { ...payload.result.proposal, id: proposalId } : proposal
        ),
      };
    });
  };

  if (!document) {
    return null;
  }

  if (isPublicationFlow && request.requestType === "publication" && !selectedPublicationProposalId) {
    const publicationResult = result as PublicationGenerationResult;
    const publicationRequest = request;

    return (
      <section className="interview-result-screen" aria-label="Resultat publication">
        <header className="interview-result-hero">
          <div className="interview-result-title-stack">
            <p className="interview-result-kicker">PUBLICATION</p>
            <h1>{publicationResult.title}</h1>
            <p>{publicationResult.selectedAngle}</p>
          </div>
        </header>

        <section className="interview-section" aria-labelledby="publication-proposals-title">
          <h2 id="publication-proposals-title">3 propositions</h2>
          <p>Choisissez une proposition pour ouvrir le Document Editor premium.</p>
          <div className="interview-ideas-grid">
            {publicationResult.proposals.map((proposal) => (
              <article key={proposal.id} className="interview-idea-card">
                <header>
                  <span className="interview-idea-type">Proposition</span>
                  <strong>{proposal.hook}</strong>
                </header>
                <p>{proposal.text}</p>
                {proposal.cta.trim() ? <small>CTA: {proposal.cta}</small> : null}
                {proposal.hashtags.length > 0 ? <small>Hashtags: {proposal.hashtags.join(" ")}</small> : null}
                <small>Visuel: {proposal.visualSuggestion}</small>
                <div className="interview-result-actions">
                  <button type="button" className="crm-primary-action" onClick={() => setSelectedPublicationProposalId(proposal.id)}>
                    Choisir
                  </button>
                  <button
                    type="button"
                    className="contents-secondary-button"
                    onClick={() => {
                      const lines = [
                        proposal.hook,
                        "",
                        proposal.text,
                      ];
                      if (proposal.cta.trim()) {
                        lines.push("", proposal.cta);
                      }
                      if (proposal.hashtags.length > 0) {
                        lines.push("", proposal.hashtags.join(" "));
                      }
                      void navigator.clipboard.writeText(lines.join("\n"));
                    }}
                  >
                    Copier
                  </button>
                  <button
                    type="button"
                    className="contents-ghost-button"
                    onClick={() => {
                      void regenerateSinglePublicationProposal(proposal.id);
                    }}
                  >
                    Regenerer cette proposition
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="interview-chip-row">
            <span className="interview-chip">Plateforme: {publicationRequest.brief.platform}</span>
            <span className="interview-chip">Ton: {publicationRequest.brief.tone}</span>
            <span className="interview-chip">Audience: {publicationRequest.brief.audience}</span>
            <span className="interview-chip">Longueur: {publicationRequest.brief.length}</span>
          </div>
        </section>
      </section>
    );
  }

  if (isReelFlow && request.requestType === "reel" && !selectedReelConceptId) {
    const reelResult = result as ReelGenerationResult;
    const reelRequest = request;

    return (
      <section className="interview-result-screen" aria-label="Resultat reel">
        <header className="interview-result-hero">
          <div className="interview-result-title-stack">
            <p className="interview-result-kicker">REEL</p>
            <h1>{reelResult.title}</h1>
            <p>{reelResult.selectedAngle}</p>
          </div>
        </header>

        <section className="interview-section" aria-labelledby="reel-concepts-title">
          <h2 id="reel-concepts-title">3 concepts Reel</h2>
          <p>Choisissez un concept pour ouvrir le Document Editor.</p>
          <div className="interview-ideas-grid">
            {reelResult.concepts.map((concept) => (
              <article key={concept.id} className="interview-idea-card">
                <header>
                  <span className="interview-idea-type">Concept</span>
                  <strong>{concept.hook}</strong>
                </header>
                <p>{concept.concept}</p>
                <small>{`Scenes: ${concept.scenes.length}`}</small>
                {concept.cta.trim() ? <small>{`CTA: ${concept.cta}`}</small> : null}
                {concept.hashtags.length > 0 ? <small>{`Hashtags: ${concept.hashtags.join(" ")}`}</small> : null}
                <small>{`Cover: ${concept.coverIdea}`}</small>
                <div className="interview-result-actions">
                  <button type="button" className="crm-primary-action" onClick={() => setSelectedReelConceptId(concept.id)}>
                    Choisir
                  </button>
                  <button
                    type="button"
                    className="contents-secondary-button"
                    onClick={() => {
                      const lines = [concept.hook, "", concept.concept, "", concept.caption, "", `Cover: ${concept.coverIdea}`];
                      if (concept.cta.trim()) {
                        lines.push("", concept.cta);
                      }
                      if (concept.hashtags.length > 0) {
                        lines.push("", concept.hashtags.join(" "));
                      }
                      void navigator.clipboard.writeText(lines.join("\n"));
                    }}
                  >
                    Copier
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="interview-chip-row">
            <span className="interview-chip">Plateforme: {reelRequest.brief.platform}</span>
            <span className="interview-chip">Ton: {reelRequest.brief.tone}</span>
            <span className="interview-chip">Audience: {reelRequest.brief.audience}</span>
            <span className="interview-chip">Duree: {reelRequest.brief.duration}</span>
            <span className="interview-chip">Format: {reelRequest.brief.format}</span>
          </div>
        </section>
      </section>
    );
  }

  return (
    <ContentDocumentEditor
      initialDocument={document}
      onSaveDraft={saveDraft}
      onRegenerateDocument={regenerateDocument}
    />
  );
}
