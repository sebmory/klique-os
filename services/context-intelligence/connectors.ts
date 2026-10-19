import { getShootingsFromGoogleSheets } from "@/lib/google-sheets";
import type {
  ContextCollectionRequest,
  ContextConfidence,
  ContextConnectorId,
  ContextConnectorResult,
  ContextConnectorStatus,
  ContextItem,
  ContextItemCategory,
  ContextSourceType,
  ContextStatementType,
  ContextVerificationStatus,
} from "@/types/context-intelligence";
import { contextIntelligenceConfig } from "@/services/context-intelligence/config";
import { ContextCollectionError } from "@/services/context-intelligence/errors";
import {
  clampText,
  isSafeHttpUrl,
  isSensitiveText,
  normalize,
  normalizePublishedAt,
} from "@/services/context-intelligence/utils";
import { ExternalContextProviderFactory } from "@/services/context-intelligence/external-provider";
import type { AiUsageGenerationContext } from "@/types/ai-usage";
import {
  EditorialGoogleSheetsWorkspaceError,
  readEditorialAthleteProjection,
} from "@/services/context-intelligence/editorial-athlete-projection";

export interface ContextConnector {
  id: ContextConnectorId;
  isAvailable(): Promise<boolean>;
  collect(request: ContextCollectionRequest, signal?: AbortSignal, usageContext?: AiUsageGenerationContext): Promise<ContextConnectorResult>;
}

const nowIso = () => new Date().toISOString();

const buildItem = (args: {
  id: string;
  connectorId: ContextConnectorId;
  category: ContextItemCategory;
  title: string;
  summary: string;
  factualStatement: string;
  statementType: ContextStatementType;
  sourceType: ContextSourceType;
  sourceName: string;
  sourceUrl?: string;
  publishedAt?: string;
  retrievedAt?: string;
  confidence: ContextConfidence;
  verificationStatus: ContextVerificationStatus;
  isEditable: boolean;
  internalReference?: string;
  metadata?: Record<string, string | number | boolean | null>;
}): ContextItem => ({
  id: args.id,
  connectorId: args.connectorId,
  category: args.category,
  title: clampText(normalize(args.title), contextIntelligenceConfig.limits.maxCharactersPerItem),
  summary: clampText(normalize(args.summary), contextIntelligenceConfig.limits.maxCharactersPerItem),
  factualStatement: clampText(normalize(args.factualStatement), contextIntelligenceConfig.limits.maxCharactersPerItem),
  statementType: args.statementType,
  sourceType: args.sourceType,
  sourceName: normalize(args.sourceName),
  sourceUrl: args.sourceUrl,
  publishedAt: normalizePublishedAt(args.publishedAt),
  retrievedAt: args.retrievedAt ?? nowIso(),
  confidence: args.confidence,
  verificationStatus: args.verificationStatus,
  isSelected: false,
  isEditable: args.isEditable,
  internalReference: args.internalReference,
  metadata: args.metadata ?? {},
  isSensitive: isSensitiveText(`${args.title} ${args.summary} ${args.factualStatement}`),
});

const safeStatus = (items: ContextItem[]): ContextConnectorStatus => (items.length ? "completed" : "empty");

class CRMContextConnector implements ContextConnector {
  id: ContextConnectorId = "crm";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async collect(request: ContextCollectionRequest, _signal?: AbortSignal, usageContext?: AiUsageGenerationContext): Promise<ContextConnectorResult> {
    if (request.subject.source !== "crm") {
      return {
        connectorId: this.id,
        status: "empty",
        items: [],
        message: "Sujet non CRM.",
      };
    }

    if (!request.subject.id) {
      return {
        connectorId: this.id,
        status: "error",
        items: [],
        errorCode: "CRM_SUBJECT_ID_MISSING",
        message: "Sujet CRM sans identifiant stable.",
      };
    }

    if (!usageContext || (usageContext.role !== "admin" && usageContext.role !== "media")) {
      return {
        connectorId: this.id,
        status: "error",
        items: [],
        errorCode: "INVALID_CONTEXT_REQUEST",
        message: "Acces editorial serveur manquant.",
      };
    }

    let athlete;
    try {
      athlete = await readEditorialAthleteProjection(request.subject.id, {
        workspaceId: usageContext.workspaceId,
        role: usageContext.role,
      });
    } catch (error) {
      if (error instanceof EditorialGoogleSheetsWorkspaceError) {
        return {
          connectorId: this.id,
          status: "unavailable",
          items: [],
          errorCode: "CONNECTOR_NOT_AVAILABLE",
          message: error.message,
        };
      }
      throw error;
    }
    if (!athlete) {
      return {
        connectorId: this.id,
        status: "error",
        items: [],
        errorCode: "CRM_SUBJECT_NOT_FOUND",
        message: "Le sujet CRM selectionne est introuvable.",
      };
    }

    const items: ContextItem[] = [];

    const push = (
      fieldId: string,
      category: ContextItemCategory,
      title: string,
      factualStatement: string | undefined,
      confidence: ContextConfidence = "medium"
    ) => {
      const value = normalize(factualStatement);
      if (!value) return;
      items.push(
        buildItem({
          id: `crm-${athlete.id}-${fieldId}`,
          connectorId: this.id,
          category,
          title,
          summary: value,
          factualStatement: value,
          statementType: "fact",
          sourceType: "internal",
          sourceName: "Projection editoriale Athlete",
          confidence,
          verificationStatus: "reported",
          isEditable: false,
          internalReference: athlete.id,
          metadata: {
            subjectId: athlete.id,
            fieldId,
          },
        })
      );
    };

    push("name", "profile", "Nom public", athlete.displayName);
    push("sport", "profile", "Sport", athlete.sport);
    push("position", "profile", "Discipline ou poste public", athlete.position);
    push("club", "club_or_organization", "Club ou organisation", athlete.club);
    push("bio", "profile", "Biographie publique", athlete.biography);
    push("palmares", "performance", "Palmares public", athlete.palmares);
    athlete.communicationObjectives.forEach((objective, index) => {
      push(`communication-objective-${index + 1}`, "profile", "Objectif autorise a la communication", objective);
    });
    athlete.publishedFacts.forEach((fact, index) => {
      push(`published-fact-${index + 1}`, "other", "Fait publie ou valide pour les medias", fact);
    });

    return {
      connectorId: this.id,
      status: safeStatus(items),
      items,
    };
  }
}

class ProductionsContextConnector implements ContextConnector {
  id: ContextConnectorId = "productions";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async collect(request: ContextCollectionRequest, _signal?: AbortSignal, usageContext?: AiUsageGenerationContext): Promise<ContextConnectorResult> {
    if (!usageContext || (usageContext.role !== "admin" && usageContext.role !== "media")) {
      return {
        connectorId: this.id,
        status: "error",
        items: [],
        errorCode: "INVALID_CONTEXT_REQUEST",
        message: "Acces editorial serveur manquant.",
      };
    }
    try {
      const defaultWorkspaceId = process.env.KLIQUE_DEFAULT_WORKSPACE_ID?.trim() ?? "";
      if (!defaultWorkspaceId || request.workspaceId !== defaultWorkspaceId) {
        throw new EditorialGoogleSheetsWorkspaceError();
      }
    } catch (error) {
      return {
        connectorId: this.id,
        status: "unavailable",
        items: [],
        errorCode: "CONNECTOR_NOT_AVAILABLE",
        message: error instanceof Error ? error.message : "Productions indisponibles.",
      };
    }

    let shootings: Awaited<ReturnType<typeof getShootingsFromGoogleSheets>>;
    try {
      shootings = await getShootingsFromGoogleSheets();
    } catch {
      return {
        connectorId: this.id,
        status: "unavailable",
        items: [],
        errorCode: "CONNECTOR_NOT_AVAILABLE",
        message: "La source Google Sheets Productions est indisponible.",
      };
    }

    const byName = normalize(request.subject.displayName).toLowerCase();
    if (!byName) {
      return {
        connectorId: this.id,
        status: "empty",
        items: [],
        message: "Sujet sans nom exploitable pour la liaison productions.",
      };
    }

    const related = shootings.filter((shooting) =>
      normalize(shooting.athlete).toLowerCase() === byName
      && (usageContext.role === "admin" || shooting.published));

    const items = related.slice(0, contextIntelligenceConfig.limits.maxExternalResults).map((shooting, index) => {
      const title = `${normalize(shooting.type) || "Production"} - ${normalize(shooting.date) || "Date inconnue"}`;
      const summary = [
        `Type: ${normalize(shooting.type) || "n/a"}`,
        `Objectif: ${normalize(shooting.objective) || "n/a"}`,
        `Statut: ${normalize(shooting.status) || "n/a"}`,
      ].join(" | ");

      return buildItem({
        id: `production-${shooting.row ?? index + 1}`,
        connectorId: this.id,
        category: "production",
        title,
        summary,
        factualStatement: summary,
        statementType: "editorial_lead",
        sourceType: "internal",
        sourceName: "Production KLIQUE OS",
        confidence: "low",
        verificationStatus: "unverified",
        isEditable: false,
        internalReference: shooting.row ? String(shooting.row) : undefined,
        metadata: {
          row: shooting.row ?? null,
          date: normalize(shooting.date),
          type: normalize(shooting.type),
          objective: normalize(shooting.objective),
          status: normalize(shooting.status),
          fragileNameMatch: true,
        },
      });
    });

    return {
      connectorId: this.id,
      status: safeStatus(items),
      items,
      errorCode: items.length ? undefined : "PRODUCTION_LINK_NOT_FOUND",
      message: items.length
        ? "Rapprochement temporaire par nom, fragile et non verifie."
        : "Aucune production liee trouvee par le rapprochement nominatif temporaire.",
    };
  }
}

class ManualContextConnector implements ContextConnector {
  id: ContextConnectorId = "manual";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async collect(request: ContextCollectionRequest): Promise<ContextConnectorResult> {
    const text = normalize(request.manualContext);
    if (!text) {
      return {
        connectorId: this.id,
        status: "empty",
        items: [],
      };
    }

    return {
      connectorId: this.id,
      status: "completed",
      items: [
        buildItem({
          id: `manual-${Date.now()}`,
          connectorId: this.id,
          category: "user_note",
          title: "Contexte fourni par l utilisateur",
          summary: text,
          factualStatement: text,
          statementType: "editorial_lead",
          sourceType: "user",
          sourceName: "Ajoute par l utilisateur",
          confidence: "unknown",
          verificationStatus: "user_provided",
          isEditable: true,
          metadata: {},
        }),
      ],
    };
  }
}

class ExternalNewsContextConnector implements ContextConnector {
  id: ContextConnectorId = "external_news";

  async isAvailable(): Promise<boolean> {
    return ExternalContextProviderFactory.get().isAvailable();
  }

  async collect(request: ContextCollectionRequest, signal?: AbortSignal, usageContext?: AiUsageGenerationContext): Promise<ContextConnectorResult> {
    const provider = ExternalContextProviderFactory.get();
    if (!(await provider.isAvailable())) {
      return {
        connectorId: this.id,
        status: "unavailable",
        items: [],
        errorCode: "EXTERNAL_SEARCH_NOT_CONFIGURED",
        message: "Recherche externe non configuree.",
      };
    }

    try {
      const result = await provider.search(request, signal, usageContext);
      const items = result.items
        .filter((row) => row.sourceUrl && isSafeHttpUrl(row.sourceUrl))
        .map((row, index) => {
          return buildItem({
            id: `external-news-${index + 1}-${Date.now()}`,
            connectorId: this.id,
            category: row.category,
            title: row.title,
            summary: row.summary,
            factualStatement: row.factualStatement || row.summary,
            statementType: row.statementType,
            sourceType: row.sourceType,
            sourceName: row.sourceName,
            sourceUrl: row.sourceUrl,
            publishedAt: row.publishedAt ?? undefined,
            retrievedAt: row.retrievedAt,
            confidence: row.confidence,
            verificationStatus: row.verificationStatus,
            isEditable: true,
            metadata: {
              query: result.querySummary,
              searchedAt: result.searchedAt,
            },
          });
        });

      return {
        connectorId: this.id,
        status: safeStatus(items),
        items,
        message: items.length ? undefined : "Aucune actualite recente verifiable n a ete trouvee pour cette periode.",
      };
    } catch (error) {
      if (error instanceof ContextCollectionError) {
        if (error.code === "NO_EXTERNAL_CONTEXT_FOUND" || error.code === "EXTERNAL_SEARCH_EMPTY") {
          return {
            connectorId: this.id,
            status: "empty",
            items: [],
            errorCode: error.code,
            message: error.message,
          };
        }

        return {
          connectorId: this.id,
          status:
            error.code === "EXTERNAL_SEARCH_NOT_CONFIGURED"
              ? "unavailable"
              : "error",
          items: [],
          errorCode: error.code,
          message: error.message,
        };
      }

      return {
        connectorId: this.id,
        status: "error",
        items: [],
        errorCode: "EXTERNAL_SEARCH_FAILED",
        message: "La recherche externe a echoue.",
      };
    }
  }
}

export const activeContextConnectors: Record<"crm" | "productions" | "manual" | "external_news", ContextConnector> = {
  crm: new CRMContextConnector(),
  productions: new ProductionsContextConnector(),
  manual: new ManualContextConnector(),
  external_news: new ExternalNewsContextConnector(),
};

export const resolveConnector = (id: ContextConnectorId): ContextConnector | null => {
  if (id === "crm") return activeContextConnectors.crm;
  if (id === "productions") return activeContextConnectors.productions;
  if (id === "manual") return activeContextConnectors.manual;
  if (id === "external_news") return activeContextConnectors.external_news;
  return null;
};
