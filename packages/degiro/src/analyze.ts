import type {
  PriceHistory,
  StockQuote,
  StructuredAnalyzeResult,
  StockRecommendation,
} from "./types.js";

const DAY_DROP_THRESHOLD = -0.03;
const WINDOW_DROP_THRESHOLD = -0.05;

export function structuredAnalyze(args: {
  quote: StockQuote;
  history: PriceHistory;
}): StructuredAnalyzeResult {
  const { quote, history } = args;
  const currentPrice = quote.lastPrice ?? history.last;
  const closePrice = quote.closePrice;
  const dayChangePct = quote.changePct;
  const recentHigh = history.high;
  const recentLow = history.low;

  let windowChangePct: number | null = null;
  if (
    currentPrice != null &&
    history.points.length > 0 &&
    history.points[0]
  ) {
    const first = history.points[0].price;
    if (first !== 0) {
      windowChangePct = (currentPrice - first) / first;
    }
  }

  const significantDrop =
    (dayChangePct != null && dayChangePct <= DAY_DROP_THRESHOLD) ||
    (windowChangePct != null && windowChangePct <= WINDOW_DROP_THRESHOLD);

  const dropReasons: string[] = [];
  if (dayChangePct != null && dayChangePct <= DAY_DROP_THRESHOLD) {
    dropReasons.push(
      `Down ${(dayChangePct * 100).toFixed(2)}% vs previous close.`,
    );
  }
  if (windowChangePct != null && windowChangePct <= WINDOW_DROP_THRESHOLD) {
    dropReasons.push(
      `Down ${(windowChangePct * 100).toFixed(2)}% over the short history window.`,
    );
  }
  if (
    currentPrice != null &&
    recentLow != null &&
    recentHigh != null &&
    recentHigh > recentLow
  ) {
    const rangePos = (currentPrice - recentLow) / (recentHigh - recentLow);
    if (rangePos <= 0.15) {
      dropReasons.push("Trading near the recent window low (weak support test).");
    } else if (rangePos >= 0.85 && significantDrop) {
      dropReasons.push(
        "Still near the recent high despite the drop — bounce may already be priced.",
      );
    }
  }
  if (
    currentPrice != null &&
    recentLow != null &&
    currentPrice < recentLow * 1.002
  ) {
    dropReasons.push("Price is at or below the recent window low (support broken).");
  }

  const currency = quote.currency ?? history.currency ?? "EUR";
  let buyRange: StructuredAnalyzeResult["buyRange"] = null;
  if (currentPrice != null && recentLow != null && recentHigh != null) {
    const mid = (recentLow + recentHigh) / 2;
    const low = Math.min(recentLow, currentPrice * 0.985);
    const high = Math.min(mid, currentPrice);
    if (low < high) {
      buyRange = { low, high, currency };
    } else {
      buyRange = {
        low: currentPrice * 0.97,
        high: currentPrice * 0.995,
        currency,
      };
    }
  } else if (currentPrice != null) {
    buyRange = {
      low: currentPrice * 0.97,
      high: currentPrice * 0.995,
      currency,
    };
  }

  const summaryParts = [
    `${quote.name}: last ${currentPrice ?? "n/a"} ${currency}`,
  ];
  if (dayChangePct != null) {
    summaryParts.push(`day ${(dayChangePct * 100).toFixed(2)}%`);
  }
  if (buyRange) {
    summaryParts.push(
      `short-term buy band ${buyRange.low.toFixed(2)}–${buyRange.high.toFixed(2)}`,
    );
  }

  return {
    productId: quote.productId,
    name: quote.name,
    symbol: quote.symbol,
    currency,
    currentPrice,
    closePrice,
    dayChangePct,
    windowChangePct,
    recentHigh,
    recentLow,
    buyRange,
    significantDrop,
    dropReasons,
    summary: summaryParts.join("; ") + ".",
  };
}

export function heuristicRecommendation(
  analyzed: StructuredAnalyzeResult,
): StockRecommendation {
  let action: StockRecommendation["action"] = "watch";
  if (analyzed.significantDrop && analyzed.buyRange) {
    action = "buy";
  } else if (
    analyzed.dayChangePct != null &&
    analyzed.dayChangePct > -0.01 &&
    analyzed.windowChangePct != null &&
    analyzed.windowChangePct > -0.02
  ) {
    action = "skip";
  }

  return {
    productId: analyzed.productId,
    name: analyzed.name,
    symbol: analyzed.symbol,
    action,
    buyRange: action === "skip" ? null : analyzed.buyRange,
    currentPrice: analyzed.currentPrice,
    significantDrop: analyzed.significantDrop,
    summary: analyzed.summary,
    dropReasons: analyzed.dropReasons,
    ai: false,
  };
}
