import type {
  AnyContentGenerationRequest,
  AnyContentGenerationResult,
  PublicationAngleSuggestion,
  PublicationGenerationRequest,
  PublicationGenerationResult,
  PublicationRegenerateOneResult,
} from "@/types/content-generation";
import type { AiUsageGenerationContext } from "@/types/ai-usage";

// Contexte transmis a une seule tentative d appel provider.
export type AiUsageCallContext = AiUsageGenerationContext & { retryNumber: number };

export type ProviderGenerateArgs = {
  request: AnyContentGenerationRequest;
  prompt: string;
  correctionFeedback?: string;
  // Present uniquement pour la generation principale (interview/publication/reel).
  usageContext?: AiUsageCallContext;
};

export interface ContentGenerationProvider {
  id: string;
  model: string;
  generateJson(args: ProviderGenerateArgs): Promise<AnyContentGenerationResult>;
  generatePublicationAngles(args: {
    request: PublicationGenerationRequest;
    prompt: string;
    usageContext?: AiUsageCallContext;
  }): Promise<PublicationAngleSuggestion[]>;
  regeneratePublicationProposal(args: {
    request: PublicationGenerationRequest;
    result: PublicationGenerationResult;
    proposalId: string;
    usageContext?: AiUsageCallContext;
  }): Promise<PublicationRegenerateOneResult>;
}
