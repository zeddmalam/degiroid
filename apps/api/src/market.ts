import {
  heuristicRecommendation,
  structuredAnalyze,
  type PriceHistory,
  type StockLookupResult,
  type StockQuote,
  type DegiroIndexLoser,
  type StructuredAnalyzeResult,
  type StockRecommendation,
} from "@repo/degiro";
import { enqueueJob } from "./jobs";

export async function lookupStock(query: string, limit = 10) {
  return enqueueJob<StockLookupResult[]>("lookup_stock", { query, limit });
}

export async function getQuote(productId: string) {
  return enqueueJob<StockQuote>("get_quote", { productId });
}

export async function getPriceHistory(
  productId: string,
  period = "P5D",
  resolution = "PT1H",
) {
  return enqueueJob<PriceHistory>("get_price_history", {
    productId,
    period,
    resolution,
  });
}

export async function getIndexLosers() {
  return enqueueJob<DegiroIndexLoser[]>("get_index_losers", {});
}

export async function structuredAnalyzeByProductId(productId: string) {
  return enqueueJob<StructuredAnalyzeResult>("structured_analyze", {
    productId,
  });
}

export async function structuredAnalyzeByQuery(query: string) {
  const matches = await lookupStock(query, 5);
  const first = matches[0];
  if (!first) {
    throw new Error(`No stock found for “${query}”`);
  }
  const [quote, history] = await Promise.all([
    getQuote(first.id),
    getPriceHistory(first.id),
  ]);
  return {
    match: first,
    matches,
    analysis: structuredAnalyze({ quote, history }),
  };
}

export async function heuristicLoserRecommendations(): Promise<
  StockRecommendation[]
> {
  const losers = await getIndexLosers();
  const recs: StockRecommendation[] = [];
  for (const loser of losers) {
    try {
      const analysis = await structuredAnalyzeByProductId(loser.productId);
      recs.push(heuristicRecommendation(analysis));
    } catch (error) {
      recs.push({
        productId: loser.productId,
        name: loser.name,
        symbol: loser.symbol,
        action: "watch",
        buyRange: null,
        currentPrice: loser.lastPrice,
        significantDrop: (loser.changePct ?? 0) <= -0.03,
        summary:
          error instanceof Error ? error.message : "Could not analyze loser.",
        dropReasons: [],
        ai: false,
      });
    }
  }
  return recs;
}
