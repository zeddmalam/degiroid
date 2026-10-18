import { createPageDegiroApi } from "./degiro";
import { getDegiroSessionId } from "./session";
import { DEGIROID_API_ORIGIN } from "./api";

type Job = {
  id: string;
  method: string;
  params: Record<string, unknown>;
};

let running = false;
let loopPromise: Promise<void> | null = null;

async function resolveSession(): Promise<{
  sessionId: string;
  intAccount: number;
  userToken?: number;
} | null> {
  const sessionId = await getDegiroSessionId();
  if (!sessionId) return null;
  const bootstrap = createPageDegiroApi({
    sessionId,
    intAccount: 0,
  });
  const client = await bootstrap.fetchClient();
  if (!client?.intAccount) return null;
  return {
    sessionId,
    intAccount: client.intAccount,
    userToken: client.id,
  };
}

async function runJob(job: Job): Promise<unknown> {
  const session = await resolveSession();
  if (!session) {
    throw new Error("No DEGIRO session on this page");
  }
  const api = createPageDegiroApi(session);
  const params = job.params;

  switch (job.method) {
    case "lookup_stock":
      return api.lookupStocks(
        String(params.query ?? ""),
        Number(params.limit ?? 10),
      );
    case "get_quote":
      return api.getQuote(String(params.productId));
    case "get_price_history":
      return api.getPriceHistory(
        String(params.productId),
        String(params.period ?? "P5D"),
        String(params.resolution ?? "PT1H"),
      );
    case "get_index_losers":
      return api.fetchGermanIndexLosers();
    case "structured_analyze":
      return api.structuredAnalyzeProduct(String(params.productId));
    default:
      throw new Error(`Unknown job method: ${job.method}`);
  }
}

async function pollOnce(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${DEGIROID_API_ORIGIN}/jobs/next?waitMs=20000`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    await sleep(2_000);
    return;
  }

  if (!response.ok) {
    await sleep(1_000);
    return;
  }

  const body = (await response.json()) as { job: Job | null };
  if (!body.job) return;

  try {
    const data = await runJob(body.job);
    await fetch(`${DEGIROID_API_ORIGIN}/jobs/${body.job.id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, data }),
    });
  } catch (error) {
    await fetch(`${DEGIROID_API_ORIGIN}/jobs/${body.job.id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Job failed",
      }),
    }).catch(() => undefined);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function loop(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    await pollOnce();
  }
}

export function startJobWorker(signal?: AbortSignal): void {
  if (running) return;
  running = true;
  const controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  loopPromise = loop(controller.signal).finally(() => {
    running = false;
    loopPromise = null;
  });
}
