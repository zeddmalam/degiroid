import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";
import { z } from "zod";
import { hasModelKey, MASTRA_MODEL, MCP_URL } from "../env";

const recommendationSchema = z.object({
  productId: z.string(),
  name: z.string(),
  symbol: z.string().optional(),
  action: z.enum(["buy", "watch", "skip"]),
  buyRange: z
    .object({
      low: z.number(),
      high: z.number(),
      currency: z.string(),
    })
    .nullable(),
  currentPrice: z.number().nullable(),
  significantDrop: z.boolean(),
  summary: z.string(),
  dropReasons: z.array(z.string()),
});

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

function buildStockAnalyst(tools: Awaited<ReturnType<typeof getMcpTools>>) {
  return new Agent({
    id: "stock-analyst",
    name: "Degiroid Stock Analyst",
    instructions: `You are a short-term (days) equities assistant for DEGIRO data via Degiroid MCP tools.
Always call lookup_stock / get_quote / get_price_history / structured_analyze as needed.
Recommend a buy price range for a short-term entry when appropriate.
If the drop is significant, explain clearly using price-structure reasons from tools.
Do NOT invent news or fundamental catalysts; say when catalysts are unknown.
Return concise JSON matching the schema. Not financial advice.`,
    model: MASTRA_MODEL,
    tools,
  });
}

function buildLosersRecommender(tools: Awaited<ReturnType<typeof getMcpTools>>) {
  return new Agent({
    id: "losers-recommender",
    name: "Degiroid Losers Recommender",
    instructions: `You recommend short-term (days) buy/watch/skip actions for German index day-losers.
Use Degiroid MCP tools only: get_index_losers, get_quote, get_price_history, structured_analyze.
For each loser (or the provided list), output action, buyRange, summary, significantDrop, dropReasons.
No invented news. Not financial advice. Respond with a JSON array of recommendation objects.`,
    model: MASTRA_MODEL,
    tools,
  });
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? text.trim();
  const start = raw.search(/[\[{]/);
  if (start < 0) throw new Error("No JSON in model response");
  return JSON.parse(raw.slice(start));
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
    `Analyze “${query}” for a short-term buy range. Use MCP tools. Reply with one JSON object only.`,
  );
  const text =
    typeof result.text === "string"
      ? result.text
      : JSON.stringify(result);
  const parsed = recommendationSchema.parse(extractJson(text));
  return { ai: true, recommendation: { ...parsed, ai: true }, raw: text };
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
    `${focus} Produce short-term recommendations. Reply with a JSON array only.`,
  );
  const text =
    typeof result.text === "string"
      ? result.text
      : JSON.stringify(result);
  const parsed = z.array(recommendationSchema).parse(extractJson(text));
  return {
    ai: true,
    recommendations: parsed.map((row) => ({ ...row, ai: true })),
    raw: text,
  };
}
