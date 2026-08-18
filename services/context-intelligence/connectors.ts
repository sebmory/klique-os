import { demoShootings } from "@/lib/demo-shootings";
import { getAthletesFromGoogleSheets, getShootingsFromGoogleSheets } from "@/lib/google-sheets";
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

export interface ContextConnector {
  id: ContextConnectorId;
  isAvailable(): Promise<boolean>;
  collect(request: ContextCollectionRequest, signal?: AbortSignal): Promise<ContextConnectorResult>;
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

  async collect(request: ContextCollectionRequest): Promise<ContextConnectorResult> {
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

    const athletes = await getAthletesFromGoogleSheets();
    const athlete = athletes.find((item) => item.key === request.subject.id);
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
      factualStatement: string,
      confidence: ContextConfidence = "high"
    ) => {
      const value = normalize(factualStatement);
      if (!value) return;
      items.push(
        buildItem({
          id: `crm-${athlete.key}-${fieldId}`,
          connectorId: this.id,
          category,
          title,
          summary: value,
          factualStatement: value,
          statementType: "fact",
          sourceType: "internal",
          sourceName: "CRM du workspace",
          confidence,
          verificationStatus: "verified",
          isEditable: true,
          internalReference: athlete.key,
          metadata: {
            subjectId: athlete.key,
            fieldId,
          },
        })
      );
    };

    push("name", "profile", "Nom", athlete.name);
    push("sport", "profile", "Sport", athlete.sport);
    push("position", "profile", "Discipline ou poste", athlete.position, "medium");
    push("club", "club_or_organization", "Club ou organisation", athlete.club);
    push("bio", "profile", "Biographie", athlete.notes, "medium");
    push("objective", "profile", "Objectif actuel", athlete.objective, "medium");
    push("longTerm", "profile", "Objectif long terme", athlete.longTerm, "medium");
    push("palmares", "performance", "Palmares", athlete.palmares, "medium");

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

  async collect(request: ContextCollectionRequest): Promise<ContextConnectorResult> {
    let shootings = [] as Awaited<ReturnType<typeof getShootingsFromGoogleSheets>>;
    try {
      shootings = await getShootingsFromGoogleSheets();
    } catch {
      shootings = demoShootings;
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

    const related = shootings.filter((shooting) => normalize(shooting.athlete).toLowerCase() === byName);

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
        statementType: "fact",
        sourceType: "internal",
        sourceName: "Production KLIQUE OS",
        confidence: "high",
        verificationStatus: "verified",
        isEditable: true,
        internalReference: shooting.row ? String(shooting.row) : undefined,
        metadata: {
          row: shooting.row ?? null,
          date: normalize(shooting.date),
          type: normalize(shooting.type),
          objective: normalize(shooting.objective),
          status: normalize(shooting.status),
        },
      });
    });

    return {
      connectorId: this.id,
      status: safeStatus(items),
      items,
      errorCode: items.length ? undefined : "PRODUCTION_LINK_NOT_FOUND",
      message: items.length ? undefined : "Aucune production liee trouvee.",
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

  async collect(request: ContextCollectionRequest, signal?: AbortSignal): Promise<ContextConnectorResult> {
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
      const result = await provider.search(request, signal);
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
