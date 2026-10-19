import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { marketApi } from "./api-client";
import {
  hasStockIdentifier,
  pickLookupMatch,
  searchTextFromRef,
  type LookupProduct,
  type StockRef,
} from "./stock-ref";

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

const stockRefSchema = {
  productId: z.string().optional().describe("DEGIRO product id"),
  name: z.string().optional().describe("Company / product name"),
  ticker: z.string().optional().describe("Stock ticker / symbol"),
  query: z
    .string()
    .optional()
    .describe("Free-text fallback: name, ticker, or ISIN"),
};

async function resolveProductId(ref: StockRef): Promise<{
  productId: string;
  match: LookupProduct;
  matches: LookupProduct[];
}> {
  if (ref.productId?.trim()) {
    const productId = ref.productId.trim();
    return {
      productId,
      match: { id: productId, name: productId },
      matches: [],
    };
  }

  const search = searchTextFromRef(ref);
  const { products } = await marketApi.lookup(search, 10);
  const list = products as LookupProduct[];
  const match = pickLookupMatch(list, ref);
  if (!match) {
    throw new Error(`No stock found for “${search}”`);
  }
  return { productId: match.id, match, matches: list };
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
        "Look up DEGIRO stock products by name and/or ticker (or ISIN via query).",
      inputSchema: z.object({
        name: z.string().optional().describe("Company / product name"),
        ticker: z.string().optional().describe("Stock ticker / symbol"),
        query: z
          .string()
          .optional()
          .describe("Free-text: name, ticker, or ISIN"),
        limit: z.number().int().min(1).max(25).optional(),
      }),
    },
    async ({ name, ticker, query, limit }) => {
      const ref = { name, ticker, query };
      if (!hasStockIdentifier(ref)) {
        throw new Error("Provide name, ticker, or query");
      }
      const search = searchTextFromRef(ref);
      const result = await marketApi.lookup(search, limit);
      const products = result.products as LookupProduct[];
      const bestMatch = pickLookupMatch(products, ref) ?? null;
      return textResult({ ...result, bestMatch });
    },
  );

  server.registerTool(
    "get_quote",
    {
      description:
        "Get last price, previous close, and day change. Identify the stock by productId, name, and/or ticker.",
      inputSchema: z.object(stockRefSchema),
    },
    async (ref) => {
      if (!hasStockIdentifier(ref)) {
        throw new Error("Provide productId, name, ticker, or query");
      }
      if (ref.productId?.trim() && !ref.name && !ref.ticker && !ref.query) {
        return textResult(await marketApi.quote(ref.productId.trim()));
      }
      const { productId, match } = await resolveProductId(ref);
      return textResult({
        match,
        quote: await marketApi.quote(productId),
      });
    },
  );

  server.registerTool(
    "get_price_history",
    {
      description:
        "Intraday price history for day-trade structure (default P1D / PT1M). Identify the stock by productId, name, and/or ticker.",
      inputSchema: z.object({
        ...stockRefSchema,
        period: z
          .string()
          .optional()
          .describe("ISO-8601 period; default P1D for day-trade lookback"),
        resolution: z
          .string()
          .optional()
          .describe("Default PT1M for intraday bars"),
      }),
    },
    async ({ period, resolution, ...ref }) => {
      if (!hasStockIdentifier(ref)) {
        throw new Error("Provide productId, name, ticker, or query");
      }
      if (ref.productId?.trim() && !ref.name && !ref.ticker && !ref.query) {
        return textResult(
          await marketApi.history(ref.productId.trim(), period, resolution),
        );
      }
      const { productId, match } = await resolveProductId(ref);
      return textResult({
        match,
        history: await marketApi.history(productId, period, resolution),
      });
    },
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
        "Deterministic day-trade buy-band analysis from intraday history (no LLM). Identify by productId, name, and/or ticker.",
      inputSchema: z.object(stockRefSchema),
    },
    async (ref) => {
      if (!hasStockIdentifier(ref)) {
        throw new Error("Provide productId, name, ticker, or query");
      }
      if (ref.productId?.trim()) {
        return textResult(
          await marketApi.structuredAnalyze({
            productId: ref.productId.trim(),
          }),
        );
      }
      const { productId, match, matches } = await resolveProductId(ref);
      const result = await marketApi.structuredAnalyze({ productId });
      return textResult({ match, matches, ...((result as object) ?? {}) });
    },
  );

  server.registerTool(
    "research_fundamentals",
    {
      description:
        "Public fundamental context: company overview (Wikipedia) and recent news headlines (Google News RSS). Use before recommending buy/watch/skip. Does not invent facts — only returns fetched snippets.",
      inputSchema: z.object({
        name: z.string().optional().describe("Company / product name"),
        ticker: z.string().optional().describe("Stock ticker / symbol"),
        query: z
          .string()
          .optional()
          .describe("Free-text fallback: name, ticker, or ISIN"),
        headlineLimit: z.number().int().min(1).max(15).optional(),
      }),
    },
    async ({ name, ticker, query, headlineLimit }) => {
      if (!name?.trim() && !ticker?.trim() && !query?.trim()) {
        throw new Error("Provide name, ticker, or query");
      }
      return textResult(
        await marketApi.researchFundamentals({
          name,
          symbol: ticker,
          query,
          headlineLimit,
        }),
      );
    },
  );

  return server;
}
