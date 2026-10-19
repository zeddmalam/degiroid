import type { StockRecommendation } from "@repo/degiro";
import { heuristicRecommendation } from "@repo/degiro";
import { MAX_BUY_ORDER_AMOUNT, RECS_CACHE_TTL_MS } from "./env";
import {
  heuristicLoserRecommendations,
  structuredAnalyzeByQuery,
} from "./market";
import { runLosersRecommender, runStockAnalyst } from "./mastra/agents";

type CacheEntry = {
  at: number;
  recommendations: StockRecommendation[];
  ai: boolean;
};

let losersCache: CacheEntry | null = null;

export async function analyzeStock(query: string) {
  const structured = await structuredAnalyzeByQuery(query);

  try {
    const ai = await runStockAnalyst(query);
    return {
      ...structured,
      recommendation: ai.recommendation,
      ai: true as const,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "NO_MODEL_KEY") {
      return {
        ...structured,
        recommendation: heuristicRecommendation(structured.analysis, {
          maxBuyEur: MAX_BUY_ORDER_AMOUNT,
        }),
        ai: false as const,
      };
    }
    // Fall back to structured if MCP/Mastra fails
    return {
      ...structured,
      recommendation: heuristicRecommendation(structured.analysis, {
        maxBuyEur: MAX_BUY_ORDER_AMOUNT,
      }),
      ai: false as const,
      aiError: error instanceof Error ? error.message : "AI analyze failed",
    };
  }
}

export async function recommendLosers(options?: {
  productIds?: string[];
  force?: boolean;
}) {
  if (
    !options?.force &&
    losersCache &&
    Date.now() - losersCache.at < RECS_CACHE_TTL_MS
  ) {
    return {
      recommendations: losersCache.recommendations,
      ai: losersCache.ai,
      cached: true,
    };
  }

  try {
    const ai = await runLosersRecommender(options?.productIds);
    losersCache = {
      at: Date.now(),
      recommendations: ai.recommendations,
      ai: true,
    };
    return {
      recommendations: ai.recommendations,
      ai: true,
      cached: false,
    };
  } catch (error) {
    const recommendations = await heuristicLoserRecommendations();
    const filtered =
      options?.productIds && options.productIds.length > 0
        ? recommendations.filter((r: { productId: string }) =>
            options.productIds!.includes(r.productId),
          )
        : recommendations;
    losersCache = {
      at: Date.now(),
      recommendations: filtered,
      ai: false,
    };
    return {
      recommendations: filtered,
      ai: false,
      cached: false,
      aiError:
        error instanceof Error && error.message !== "NO_MODEL_KEY"
          ? error.message
          : undefined,
    };
  }
}

export function getCachedLoserRecommendations() {
  if (!losersCache) return null;
  if (Date.now() - losersCache.at >= RECS_CACHE_TTL_MS) return null;
  return {
    recommendations: losersCache.recommendations,
    ai: losersCache.ai,
    cached: true,
  };
}
