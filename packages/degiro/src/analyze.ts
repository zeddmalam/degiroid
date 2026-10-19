import type {
  PriceHistory,
  StockQuote,
  StructuredAnalyzeResult,
  StockRecommendation,
} from "./types.js";

const DAY_DROP_THRESHOLD = -0.03;
/** Intraday session move (history lookback is P1D, not a multi-day swing). */
const WINDOW_DROP_THRESHOLD = -0.05;

/** Price history used for day-trade structure (entry), not multi-day thesis. */
export const ANALYZE_HISTORY_PERIOD = "P1D";
export const ANALYZE_HISTORY_RESOLUTION = "PT1M";

/** Allowed share counts for sizing suggestions. */
export const SHARE_COUNT_STEPS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
] as const;

/** Largest allowed step that is ≤ `maxQty` (0 if none). */
export function largestShareStepAtMost(maxQty: number): number {
  let best = 0;
  for (const step of SHARE_COUNT_STEPS) {
    if (step <= maxQty) best = step;
    else break;
  }
  return best;
}

/**
 * Snap a share count to the nearest allowed step.
 * Ties prefer the lower step; values above 100 clamp to 100; ≤0 → 0.
 */
export function roundShareCount(quantity: number): number {
  const q = Math.floor(quantity);
  if (q <= 0) return 0;
  if (q >= 100) return 100;

  let best: number = SHARE_COUNT_STEPS[0]!;
  let bestDist = Math.abs(best - q);
  for (const step of SHARE_COUNT_STEPS) {
    const dist = Math.abs(step - q);
    if (dist < bestDist || (dist === bestDist && step < best)) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Suggest how many shares to buy so notional stays within `maxBuyEur`.
 * Uses the (conservative) unit price; result is always an allowed step (or 0).
 */
export function suggestBuyQuantity(
  unitPrice: number | null | undefined,
  maxBuyEur: number,
): number {
  if (
    unitPrice == null ||
    !(unitPrice > 0) ||
    !(maxBuyEur > 0) ||
    unitPrice > maxBuyEur
  ) {
    return 0;
  }

  const maxAffordable = Math.floor(maxBuyEur / unitPrice);
  if (maxAffordable < 1) return 0;

  let qty = largestShareStepAtMost(maxAffordable);
  while (qty > 0 && qty * unitPrice > maxBuyEur) {
    qty = largestShareStepAtMost(qty - 1);
  }
  return qty;
}

export function entryPriceForQuantity(args: {
  buyRange: { low: number; high: number } | null;
  currentPrice: number | null;
}): number | null {
  if (args.buyRange) return args.buyRange.high;
  return args.currentPrice;
}

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
      `Down ${(windowChangePct * 100).toFixed(2)}% within the session (intraday).`,
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
      dropReasons.push("Trading near the session low (weak support test).");
    } else if (rangePos >= 0.85 && significantDrop) {
      dropReasons.push(
        "Still near the session high despite the drop — bounce may already be priced.",
      );
    }
  }
  if (
    currentPrice != null &&
    recentLow != null &&
    currentPrice < recentLow * 1.002
  ) {
    dropReasons.push("Price is at or below the session low (support broken).");
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

  let sellRange: StructuredAnalyzeResult["sellRange"] = null;
  if (currentPrice != null && recentHigh != null && recentHigh > currentPrice) {
    // Take-profit: session resistance first; ceiling allows holding up to ~1 week.
    const low = Math.max(currentPrice * 1.01, (currentPrice + recentHigh) / 2);
    const high = Math.max(
      low * 1.005,
      recentHigh * 1.01,
      currentPrice * 1.04,
    );
    sellRange = { low, high, currency };
  } else if (currentPrice != null) {
    sellRange = {
      low: currentPrice * 1.015,
      high: currentPrice * 1.04,
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
      `intraday buy band ${buyRange.low.toFixed(2)}–${buyRange.high.toFixed(2)}`,
    );
  }
  if (sellRange) {
    summaryParts.push(
      `TP (≤~1w) ${sellRange.low.toFixed(2)}–${sellRange.high.toFixed(2)}`,
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
    sellRange,
    significantDrop,
    dropReasons,
    summary: summaryParts.join("; ") + ".",
  };
}

export function heuristicRecommendation(
  analyzed: StructuredAnalyzeResult,
  options?: { maxBuyEur?: number },
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

  const buyRange = action === "skip" ? null : analyzed.buyRange;
  const sellRange = action === "skip" ? null : analyzed.sellRange;
  const maxBuyEur = options?.maxBuyEur;
  const quantity =
    action === "skip" || maxBuyEur == null
      ? 0
      : suggestBuyQuantity(
          entryPriceForQuantity({
            buyRange,
            currentPrice: analyzed.currentPrice,
          }),
          maxBuyEur,
        );

  return {
    productId: analyzed.productId,
    name: analyzed.name,
    symbol: analyzed.symbol,
    action,
    buyRange,
    sellRange,
    quantity,
    currentPrice: analyzed.currentPrice,
    significantDrop: analyzed.significantDrop,
    summary: analyzed.summary,
    dropReasons: analyzed.dropReasons,
    fundamentalReasons: [],
    ai: false,
  };
}
