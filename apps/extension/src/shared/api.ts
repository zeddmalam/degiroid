import { DEGIROID_API_ORIGIN } from "@/env";

export { DEGIROID_API_ORIGIN };

export type StockRecommendation = {
  productId: string;
  name: string;
  symbol?: string;
  action: "buy" | "watch" | "skip";
  buyRange: { low: number; high: number; currency: string } | null;
  currentPrice: number | null;
  significantDrop: boolean;
  summary: string;
  dropReasons: string[];
  ai: boolean;
};

export async function fetchLoserRecommendations(options?: {
  force?: boolean;
  productIds?: string[];
}): Promise<{
  recommendations: StockRecommendation[];
  ai: boolean;
  cached?: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${DEGIROID_API_ORIGIN}/v1/recommendations/losers`,
      {
        method: options?.force || options?.productIds ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body:
          options?.force || options?.productIds
            ? JSON.stringify({
                force: options.force,
                productIds: options.productIds,
              })
            : undefined,
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        recommendations: [],
        ai: false,
        error: body?.error ?? `API ${response.status}`,
      };
    }
    return (await response.json()) as {
      recommendations: StockRecommendation[];
      ai: boolean;
      cached?: boolean;
    };
  } catch {
    return {
      recommendations: [],
      ai: false,
      error: "Start the Degiroid API (bun run dev --filter=api).",
    };
  }
}
