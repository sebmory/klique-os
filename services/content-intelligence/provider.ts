import type {
  AnyContentGenerationRequest,
  AnyContentGenerationResult,
  PublicationAngleSuggestion,
  PublicationGenerationRequest,
  PublicationGenerationResult,
  PublicationRegenerateOneResult,
} from "@/types/content-generation";

export type ProviderGenerateArgs = {
  request: AnyContentGenerationRequest;
  prompt: string;
  correctionFeedback?: string;
};

export interface ContentGenerationProvider {
  id: string;
  model: string;
  generateJson(args: ProviderGenerateArgs): Promise<AnyContentGenerationResult>;
  generatePublicationAngles(args: { request: PublicationGenerationRequest; prompt: string }): Promise<PublicationAngleSuggestion[]>;
  regeneratePublicationProposal(args: {
    request: PublicationGenerationRequest;
    result: PublicationGenerationResult;
    proposalId: string;
  }): Promise<PublicationRegenerateOneResult>;
}
