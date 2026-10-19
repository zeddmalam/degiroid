import { API_HOST, API_ORIGIN, API_PORT, JOB_TIMEOUT_MS } from "./env";
import { completeJob, jobStats, requeueJob, takeNextJob } from "./jobs";
import {
  ANALYZE_HISTORY_PERIOD,
  ANALYZE_HISTORY_RESOLUTION,
} from "@repo/degiro";
import {
  getIndexLosers,
  getPriceHistory,
  getQuote,
  lookupStock,
  structuredAnalyzeByProductId,
  structuredAnalyzeByQuery,
} from "./market";
import { researchFundamentals } from "./fundamentals";
import {
  analyzeStock,
  getCachedLoserRecommendations,
  recommendLosers,
} from "./recommendations";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return json({ error: message }, status);
}

async function handleStockLookup(url: URL) {
  const q = url.searchParams.get("q")?.trim();
  if (!q) return json({ error: "Missing q" }, 400);
  const limit = Number(url.searchParams.get("limit") ?? 10);
  return json({ products: await lookupStock(q, limit) });
}

// Bun defaults to a 10s idleTimeout, which kills job long-polls and
// waiting /v1/stocks/* handlers. Cap is 255 seconds.
const idleTimeoutSec = Math.min(
  255,
  Math.max(60, Math.ceil(JOB_TIMEOUT_MS / 1000) + 5),
);

const server = Bun.serve({
  hostname: API_HOST,
  port: API_PORT,
  idleTimeout: idleTimeoutSec,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return json({ ok: true });
    }

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, ...jobStats() });
      }

      if (req.method === "GET" && url.pathname === "/jobs/next") {
        const wait = Number(url.searchParams.get("waitMs") ?? 25_000);
        const job = await takeNextJob(wait, req.signal);
        if (!job) return json({ job: null });
        if (req.signal.aborted) {
          requeueJob(job.id);
          return json({ job: null });
        }
        return json({ job });
      }

      if (req.method === "POST" && url.pathname.startsWith("/jobs/")) {
        const id = url.pathname.slice("/jobs/".length).replace(/\/result$/, "");
        if (!url.pathname.endsWith("/result")) {
          return json({ error: "Not found" }, 404);
        }
        const body = (await req.json()) as
          | { ok: true; data: unknown }
          | { ok: false; error: string };
        const ok = completeJob(id, body);
        return json({ ok });
      }

      if (
        req.method === "GET" &&
        (url.pathname === "/v1/stocks/lookup" || url.pathname === "/v1/stocks")
      ) {
        return handleStockLookup(url);
      }

      const quoteMatch = url.pathname.match(
        /^\/v1\/stocks\/([^/]+)\/quote$/,
      );
      if (req.method === "GET" && quoteMatch) {
        return json(await getQuote(decodeURIComponent(quoteMatch[1]!)));
      }

      const historyMatch = url.pathname.match(
        /^\/v1\/stocks\/([^/]+)\/history$/,
      );
      if (req.method === "GET" && historyMatch) {
        const productId = decodeURIComponent(historyMatch[1]!);
        const period =
          url.searchParams.get("period") ?? ANALYZE_HISTORY_PERIOD;
        const resolution =
          url.searchParams.get("resolution") ?? ANALYZE_HISTORY_RESOLUTION;
        return json(await getPriceHistory(productId, period, resolution));
      }

      if (req.method === "GET" && url.pathname === "/v1/indexes/losers") {
        return json({ losers: await getIndexLosers() });
      }

      if (
        req.method === "POST" &&
        url.pathname === "/v1/stocks/structured-analyze"
      ) {
        const body = (await req.json()) as {
          productId?: string;
          query?: string;
        };
        if (body.productId) {
          return json({
            analysis: await structuredAnalyzeByProductId(body.productId),
          });
        }
        if (body.query) {
          return json(await structuredAnalyzeByQuery(body.query));
        }
        return json({ error: "Provide productId or query" }, 400);
      }

      if (req.method === "POST" && url.pathname === "/v1/stocks/analyze") {
        const body = (await req.json()) as { query?: string };
        if (!body.query?.trim()) return json({ error: "Missing query" }, 400);
        return json(await analyzeStock(body.query.trim()));
      }

      if (
        req.method === "POST" &&
        url.pathname === "/v1/stocks/research-fundamentals"
      ) {
        const body = (await req.json()) as {
          name?: string;
          symbol?: string;
          query?: string;
          headlineLimit?: number;
        };
        if (!body.name?.trim() && !body.symbol?.trim() && !body.query?.trim()) {
          return json({ error: "Provide name, symbol, or query" }, 400);
        }
        return json(await researchFundamentals(body));
      }

      if (
        req.method === "GET" &&
        url.pathname === "/v1/recommendations/losers"
      ) {
        const cached = getCachedLoserRecommendations();
        if (cached) return json(cached);
        return json(await recommendLosers());
      }

      if (
        req.method === "POST" &&
        url.pathname === "/v1/recommendations/losers"
      ) {
        const body = (await req.json().catch(() => ({}))) as {
          productIds?: string[];
          force?: boolean;
        };
        return json(await recommendLosers(body));
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      return errorResponse(error);
    }
  },
});

console.log(`Degiroid API listening on ${API_ORIGIN}`);
console.log(`Jobs bridge: GET ${API_ORIGIN}/jobs/next`);

export default server;
