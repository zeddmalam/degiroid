import { JOB_POLL_WAIT_MS, JOB_TIMEOUT_MS } from "./env";

export type JobMethod =
  | "lookup_stock"
  | "get_quote"
  | "get_price_history"
  | "get_index_losers"
  | "structured_analyze";

export type Job = {
  id: string;
  method: JobMethod;
  params: Record<string, unknown>;
  createdAt: number;
};

type Pending = {
  job: Job;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const queue: Pending[] = [];
const inFlight = new Map<string, Pending>();
const waiters: Array<() => void> = [];

function wake(): void {
  while (waiters.length > 0 && queue.length > 0) {
    const wakeOne = waiters.shift();
    wakeOne?.();
  }
}

export function enqueueJob<T = unknown>(
  method: JobMethod,
  params: Record<string, unknown> = {},
): Promise<T> {
  const id = crypto.randomUUID();
  const job: Job = { id, method, params, createdAt: Date.now() };

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = queue.findIndex((p) => p.job.id === id);
      if (idx >= 0) queue.splice(idx, 1);
      inFlight.delete(id);
      reject(
        new Error(
          "Timed out waiting for the Degiroid extension. Open https://trader.degiro.nl with Degiroid loaded and the API running.",
        ),
      );
    }, JOB_TIMEOUT_MS);

    queue.push({
      job,
      resolve: (value) => resolve(value as T),
      reject,
      timer,
    });
    wake();
  });
}

export async function takeNextJob(
  waitMs = JOB_POLL_WAIT_MS,
  signal?: AbortSignal,
): Promise<Job | null> {
  if (signal?.aborted) return null;

  if (queue.length === 0) {
    const gotJob = await new Promise<boolean>((resolve) => {
      if (signal?.aborted) {
        resolve(false);
        return;
      }

      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const idx = waiters.indexOf(onWake);
        if (idx >= 0) waiters.splice(idx, 1);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      };

      const timer = setTimeout(() => finish(false), waitMs);
      const onWake = () => finish(true);
      const onAbort = () => finish(false);

      waiters.push(onWake);
      signal?.addEventListener("abort", onAbort, { once: true });
    });

    if (!gotJob || signal?.aborted || queue.length === 0) return null;
  }

  if (signal?.aborted) return null;

  const pending = queue.shift();
  if (!pending) return null;
  inFlight.set(pending.job.id, pending);
  return pending.job;
}

/** Put a job back on the queue if the long-poll client disconnected. */
export function requeueJob(id: string): boolean {
  const pending = inFlight.get(id);
  if (!pending) return false;
  inFlight.delete(id);
  queue.unshift(pending);
  wake();
  return true;
}

export function completeJob(
  id: string,
  result: { ok: true; data: unknown } | { ok: false; error: string },
): boolean {
  const pending = inFlight.get(id) ?? queue.find((p) => p.job.id === id);
  if (!pending) return false;

  clearTimeout(pending.timer);
  inFlight.delete(id);
  const idx = queue.findIndex((p) => p.job.id === id);
  if (idx >= 0) queue.splice(idx, 1);

  if (result.ok) pending.resolve(result.data);
  else pending.reject(new Error(result.error));
  return true;
}

export function jobStats() {
  return { queued: queue.length, inFlight: inFlight.size };
}
