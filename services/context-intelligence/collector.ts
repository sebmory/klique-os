import type {
  ContextCollectionRequest,
  ContextCollectionResponse,
  ContextCollectionResponseError,
  ContextCollectionResponseSuccess,
  ContextConnectorId,
  ContextConnectorReport,
  ContextConnectorResult,
  ContextItem,
} from "@/types/context-intelligence";
import { contextIntelligenceConfig } from "@/services/context-intelligence/config";
import { resolveConnector } from "@/services/context-intelligence/connectors";
import { ContextCollectionError } from "@/services/context-intelligence/errors";
import { dedupeContextItems, normalize, shouldPreselect } from "@/services/context-intelligence/utils";

type CacheRecord = {
  expiresAt: number;
  value: ContextCollectionResponseSuccess;
};

const externalCache = new Map<string, CacheRecord>();

const buildCacheKey = (request: ContextCollectionRequest): string => {
  return [
    normalize(request.workspaceId) || "default",
    normalize(request.subject.id) || normalize(request.subject.displayName).toLowerCase(),
    request.dateRange.from,
    request.dateRange.to,
    request.sourcePreference,
    request.searchDepth,
    request.language,
    request.selectedConnectorIds.filter((id) => id === "external_news").join(","),
  ].join("|");
};

// Le controleur annule reellement l appel en cours au lieu de laisser la promesse tourner en arriere-plan.
const withAbortTimeout = async <T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> => {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | null = null;
  let timedOut = false;

  timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (timedOut) {
      throw new ContextCollectionError("CONTEXT_TIMEOUT", "La collecte de contexte a depasse le delai autorise.");
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const mergeReports = (results: ContextConnectorResult[]): ContextConnectorReport[] => {
  return results.map((result) => ({
    connectorId: result.connectorId,
    status: result.status,
    itemCount: result.items.length,
    message: result.message,
    errorCode: result.errorCode,
  }));
};

const enforceLimits = (items: ContextItem[]): ContextItem[] => {
  const capped = items.slice(0, contextIntelligenceConfig.limits.maxContextItems);
  let runningChars = 0;
  const selected: ContextItem[] = [];

  for (const item of capped) {
    const size = `${item.title}${item.summary}${item.factualStatement}`.length;
    if (runningChars + size > contextIntelligenceConfig.limits.maxTotalContextCharacters) continue;
    runningChars += size;
    selected.push(item);
  }

  return selected;
};

const collectSingleConnector = async (request: ContextCollectionRequest, connectorId: ContextConnectorId): Promise<ContextConnectorResult> => {
  const connector = resolveConnector(connectorId);
  if (!connector) {
    return {
      connectorId,
      status: "unavailable",
      items: [],
      errorCode: "CONNECTOR_NOT_AVAILABLE",
      message: "Connecteur non disponible dans ce sprint.",
    };
  }

  if (!(await connector.isAvailable())) {
    return {
      connectorId,
      status: "unavailable",
      items: [],
      errorCode: connectorId === "external_news" ? "EXTERNAL_SEARCH_NOT_CONFIGURED" : "CONNECTOR_NOT_AVAILABLE",
      message: connectorId === "external_news" ? "Recherche externe non configuree." : "Connecteur indisponible.",
    };
  }

  return withAbortTimeout(
    (signal) => connector.collect(request, signal),
    contextIntelligenceConfig.limits.searchTimeoutMs
  );
};

export const collectContextIntelligence = async (request: ContextCollectionRequest): Promise<ContextCollectionResponse> => {
  if (!request.subject || !normalize(request.subject.displayName)) {
    return {
      ok: false,
      code: "INVALID_CONTEXT_REQUEST",
      message: "Sujet invalide pour la collecte du contexte.",
      reports: [],
    };
  }

  const selectedConnectorIds = request.selectedConnectorIds.length
    ? request.selectedConnectorIds
    : contextIntelligenceConfig.defaultConnectors;

  const hasExternal = selectedConnectorIds.includes("external_news");
  const cacheKey = hasExternal ? buildCacheKey(request) : "";

  if (hasExternal) {
    const cached = externalCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const settled = await Promise.all(
    selectedConnectorIds.map(async (connectorId) => {
      try {
        return await collectSingleConnector(request, connectorId);
      } catch (error) {
        if (error instanceof ContextCollectionError) {
          return {
            connectorId,
            status: "error",
            items: [],
            errorCode: error.code,
            message: error.message,
          } as ContextConnectorResult;
        }

        return {
          connectorId,
          status: "error",
          items: [],
          errorCode: "EXTERNAL_CONTEXT_FAILED",
          message: "Collecte en erreur.",
        } as ContextConnectorResult;
      }
    })
  );

  const deduped = dedupeContextItems(settled.flatMap((result) => result.items));
  const limited = enforceLimits(deduped);

  const items = limited.map((item) => ({
    ...item,
    isSelected: shouldPreselect(item, request.sourcePreference),
  }));

  const reports = mergeReports(settled);
  const researchedAt = new Date().toISOString();
  const externalSources = new Set(
    items
      .filter((item) => item.connectorId === "external_news" && item.sourceUrl)
      .map((item) => `${item.sourceName}|${item.sourceUrl}`)
  );

  const warnings: string[] = [];
  const hasConnectorFailure = reports.some((report) => report.status === "error" || report.status === "unavailable");

  if (!items.length) {
    warnings.push("Aucune information recente verifiable n a ete trouvee pour cette recherche.");
  }

  if (hasConnectorFailure && items.length > 0) {
    warnings.push("CONTEXTE_PARTIEL: CONTEXT_COLLECTION_PARTIAL_SUCCESS");
  }

  if (deduped.length > limited.length) {
    warnings.push("Certaines informations ont ete limitees pour respecter les contraintes de taille.");
  }

  const response: ContextCollectionResponseSuccess = {
    ok: true,
    items,
    reports,
    summary: {
      totalItemsFound: items.length,
      selectedItemsCount: items.filter((item) => item.isSelected).length,
      externalSourcesCount: externalSources.size,
      researchedAt,
      dateRange: request.dateRange,
      warnings,
    },
  };

  if (hasExternal) {
    externalCache.set(cacheKey, {
      expiresAt: Date.now() + contextIntelligenceConfig.limits.cacheDurationMs,
      value: response,
    });
  }

  return response;
};

export const toContextCollectionErrorResponse = (error: unknown): ContextCollectionResponseError => {
  if (error instanceof ContextCollectionError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      reports: [],
    };
  }

  return {
    ok: false,
    code: "INVALID_CONTEXT_REQUEST",
    message: "Requete de contexte invalide.",
    reports: [],
  };
};
