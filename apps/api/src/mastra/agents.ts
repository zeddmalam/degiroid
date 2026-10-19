import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import {
  entryPriceForQuantity,
  largestShareStepAtMost,
  roundShareCount,
  suggestBuyQuantity,
} from "@repo/degiro";
import { z } from "zod";
import {
  hasModelKey,
  MAX_BUY_ORDER_AMOUNT,
  MASTRA_MODEL,
  MCP_URL,
} from "../env";

const priceRangeSchema = z
  .object({
    low: z.number(),
    high: z.number(),
    currency: z.string(),
  })
  .nullable();

const recommendationSchema = z.object({
  productId: z.string(),
  name: z.string(),
  symbol: z.string().optional(),
  action: z.enum(["buy", "watch", "skip"]),
  buyRange: priceRangeSchema,
  sellRange: priceRangeSchema,
  quantity: z.number().int().nonnegative(),
  currentPrice: z.number().nullable(),
  significantDrop: z.boolean(),
  summary: z.string(),
  dropReasons: z.array(z.string()),
  fundamentalReasons: z.array(z.string()).default([]),
});

const recommendationsSchema = z.array(recommendationSchema);

export type AiRecommendation = z.infer<typeof recommendationSchema> & {
  ai: boolean;
};

let mcpClient: MCPClient | null = null;

async function getMcpTools() {
  if (!mcpClient) {
    mcpClient = new MCPClient({
      id: "degiroid-api",
      servers: {
        degiroid: {
          url: new URL(MCP_URL),
        },
      },
    });
  }
  return mcpClient.listTools();
}

const schemaHint = `JSON fields: productId (string), name (string), symbol (optional string), action ("buy"|"watch"|"skip"), buyRange ({low, high, currency} or null), sellRange ({low, high, currency} or null), quantity (non-negative int share count; 0 if skip/unaffordable), currentPrice (number|null), significantDrop (boolean), summary (string; blend technical + fundamental in 1–3 sentences), dropReasons (string[]; technical/price-structure only), fundamentalReasons (string[]; only claims grounded in research_fundamentals output — empty if none).`;

const sizingHint = `Position sizing: suggest quantity (share count) so quantity × entry price (prefer buyRange.high, else currentPrice) does not exceed ${MAX_BUY_ORDER_AMOUNT} EUR. Quantity must be one of: 1–10, 20, 30, 40, 50, 60, 70, 80, 90, 100 (or 0 for skip / unaffordable).`;

const analysisHint = `Combine technical + fundamental analysis:
1) Technical (required): lookup_stock / get_quote / get_price_history / structured_analyze. Intraday lookback only (P1D / PT1M). Do NOT treat a multi-day (e.g. P5D) swing as the trade thesis. Entry = same-session day-trade; sellRange = take-profit that may clear same day or within ~1 week (forward plan, not lookback). buyRange from session structure; sellRange above buy band toward session resistance; keep sellRange.low > buyRange.high when both are set. Put price-structure points in dropReasons.
2) Fundamental (required for single-stock analyze; for losers, call research_fundamentals for each name you might buy/watch): research_fundamentals with name and/or ticker. Use companyOverview + headlines only. Put grounded business/news/catalyst points in fundamentalReasons. If research is empty or inconclusive, set fundamentalReasons to [] and say so in summary — never invent earnings, guidance, lawsuits, or headlines.
Weigh both: a clean technical bounce can still be skip/watch if headlines show a clear negative fundamental catalyst; a significant drop with benign/positive fundamentals can support buy.`;

function buildStockAnalyst(tools: Awaited<ReturnType<typeof getMcpTools>>) {
  return new Agent({
    id: "stock-analyst",
    name: "Degiroid Stock Analyst",
    instructions: `You are a day-trade equities assistant using Degiroid MCP tools (DEGIRO market data + public fundamental research).
Always run both technical and fundamental research before recommending.
Pass stock name and/or ticker when productId is unknown.
${analysisHint}
${sizingHint}
Return one recommendation object. ${schemaHint}
Not financial advice.`,
    model: MASTRA_MODEL,
    tools,
  });
}

function buildLosersRecommender(tools: Awaited<ReturnType<typeof getMcpTools>>) {
  return new Agent({
    id: "losers-recommender",
    name: "Degiroid Losers Recommender",
    instructions: `You recommend day-trade buy/watch/skip actions for German index day-losers.
Use Degiroid MCP tools: get_index_losers, get_quote, get_price_history, structured_analyze, research_fundamentals.
${analysisHint}
For each loser (or the provided list), output action, buyRange, sellRange, quantity, summary, significantDrop, dropReasons, fundamentalReasons.
Always suggest a sellRange take-profit band when action is buy or watch (null only for skip).
${sizingHint}
Not financial advice. Respond with a JSON array of recommendation objects.
Each item: ${schemaHint}`,
    model: MASTRA_MODEL,
    tools,
  });
}

function unwrapCandidate(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value;

  const record = value as Record<string, unknown>;
  if ("recommendation" in record) return record.recommendation;
  if ("recommendations" in record) return record.recommendations;
  return value;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? text.trim();
  const start = raw.search(/[\[{]/);
  if (start < 0) throw new Error("No JSON in model response");
  return unwrapCandidate(JSON.parse(raw.slice(start)));
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then: unknown }).then === "function"
  );
}

function textFromResult(result: {
  text?: unknown;
  steps?: Array<{ text?: unknown }>;
}): string | undefined {
  if (typeof result.text === "string" && result.text.trim()) {
    return result.text;
  }
  const steps = result.steps;
  if (!Array.isArray(steps)) return undefined;
  for (let i = steps.length - 1; i >= 0; i--) {
    const stepText = steps[i]?.text;
    if (typeof stepText === "string" && stepText.trim()) return stepText;
  }
  return undefined;
}

async function parseFromGenerateResult<T>(
  result: {
    object?: unknown;
    text?: unknown;
    error?: unknown;
    finishReason?: unknown;
    steps?: Array<{ text?: unknown }>;
  },
  schema: z.ZodType<T>,
): Promise<T> {
  let object = result.object;
  if (isThenable(object)) {
    object = await object;
  }

  if (object != null) {
    return schema.parse(unwrapCandidate(object));
  }

  const text = textFromResult(result);
  if (text) {
    return schema.parse(extractJson(text));
  }

  const detail =
    result.error instanceof Error
      ? result.error.message
      : typeof result.error === "string"
        ? result.error
        : typeof result.finishReason === "string"
          ? `finishReason=${result.finishReason}`
          : "empty object and text";
  throw new Error(`Model returned no structured object or JSON text (${detail})`);
}

function clampQuantity(
  row: z.infer<typeof recommendationSchema>,
): z.infer<typeof recommendationSchema> {
  if (row.action === "skip") {
    return { ...row, quantity: 0 };
  }

  const entry = entryPriceForQuantity({
    buyRange: row.buyRange,
    currentPrice: row.currentPrice,
  });
  const suggested = suggestBuyQuantity(entry, MAX_BUY_ORDER_AMOUNT);

  if (entry == null || suggested < 1) {
    return { ...row, quantity: 0 };
  }

  let qty = roundShareCount(row.quantity);
  while (qty > 0 && qty * entry > MAX_BUY_ORDER_AMOUNT) {
    qty = largestShareStepAtMost(qty - 1);
  }
  if (qty >= 1) {
    return { ...row, quantity: qty };
  }

  return { ...row, quantity: suggested };
}

export async function runStockAnalyst(query: string): Promise<{
  ai: boolean;
  recommendation: AiRecommendation;
  raw?: string;
}> {
  if (!hasModelKey()) {
    throw new Error("NO_MODEL_KEY");
  }

  const tools = await getMcpTools();
  const agent = buildStockAnalyst(tools);
  const result = await agent.generate(
    `Analyze “${query}” with technical (P1D/PT1M) and fundamental (research_fundamentals) inputs. Produce a day-trade buy range, take-profit sell range (same day or within ~1 week), share quantity (max ${MAX_BUY_ORDER_AMOUNT} EUR), dropReasons, and fundamentalReasons. Reply with one JSON object only.`,
    {
      maxSteps: 10,
      structuredOutput: {
        // Separate structuring pass: tool-calling steps often finish with empty
        // native structured output; a second model call coerces tool context → schema.
        schema: recommendationSchema,
        model: MASTRA_MODEL,
        jsonPromptInjection: "auto",
      },
    },
  );
  const parsed = clampQuantity(
    await parseFromGenerateResult(result, recommendationSchema),
  );
  return {
    ai: true,
    recommendation: { ...parsed, ai: true },
    raw: typeof result.text === "string" ? result.text : undefined,
  };
}

export async function runLosersRecommender(productIds?: string[]): Promise<{
  ai: boolean;
  recommendations: AiRecommendation[];
  raw?: string;
}> {
  if (!hasModelKey()) {
    throw new Error("NO_MODEL_KEY");
  }

  const tools = await getMcpTools();
  const agent = buildLosersRecommender(tools);
  const focus =
    productIds && productIds.length > 0
      ? `Focus on productIds: ${productIds.join(", ")}.`
      : "Use get_index_losers for the current list.";
  const result = await agent.generate(
    `${focus} Produce day-trade recommendations using technical + fundamental research; share quantities (max ${MAX_BUY_ORDER_AMOUNT} EUR each); TP horizon ≤~1 week. Include dropReasons and fundamentalReasons per name. Reply with a JSON array only.`,
    {
      maxSteps: 20,
      structuredOutput: {
        schema: recommendationsSchema,
        model: MASTRA_MODEL,
        jsonPromptInjection: "auto",
      },
    },
  );
  const parsed = (
    await parseFromGenerateResult(result, recommendationsSchema)
  ).map(clampQuantity);
  return {
    ai: true,
    recommendations: parsed.map((row) => ({ ...row, ai: true })),
    raw: typeof result.text === "string" ? result.text : undefined,
  };
}
