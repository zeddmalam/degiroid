import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { marketApi } from "./api-client";

function textResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function createDegiroidMcpServer(): McpServer {
  const server = new McpServer({
    name: "degiroid",
    version: "0.1.0",
  });

  server.registerTool(
    "lookup_stock",
    {
      description:
        "Look up DEGIRO stock products by name, ticker, or ISIN (via Degiroid extension session).",
      inputSchema: z.object({
        query: z.string().describe("Name, ticker, or ISIN"),
        limit: z.number().int().min(1).max(25).optional(),
      }),
    },
    async ({ query, limit }) => textResult(await marketApi.lookup(query, limit)),
  );

  server.registerTool(
    "get_quote",
    {
      description: "Get last price, previous close, and day change for a product.",
      inputSchema: z.object({
        productId: z.string().describe("DEGIRO product id"),
      }),
    },
    async ({ productId }) => textResult(await marketApi.quote(productId)),
  );

  server.registerTool(
    "get_price_history",
    {
      description:
        "Short-term price history for support/resistance (default ~5 days).",
      inputSchema: z.object({
        productId: z.string(),
        period: z.string().optional().describe("ISO-8601 period, e.g. P5D"),
        resolution: z.string().optional().describe("e.g. PT1H"),
      }),
    },
    async ({ productId, period, resolution }) =>
      textResult(await marketApi.history(productId, period, resolution)),
  );

  server.registerTool(
    "get_index_losers",
    {
      description:
        "Top German index day-losers (DAX/MDAX/SDAX/TecDAX) from the live session.",
      inputSchema: z.object({}),
    },
    async () => textResult(await marketApi.losers()),
  );

  server.registerTool(
    "structured_analyze",
    {
      description:
        "Deterministic short-term buy-band analysis (no LLM). Provide productId or query.",
      inputSchema: z.object({
        productId: z.string().optional(),
        query: z.string().optional(),
      }),
    },
    async ({ productId, query }) => {
      if (!productId && !query) {
        throw new Error("Provide productId or query");
      }
      return textResult(
        await marketApi.structuredAnalyze({ productId, query }),
      );
    },
  );

  return server;
}
