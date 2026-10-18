import { API_ORIGIN } from "./env";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `API ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export const marketApi = {
  lookup: (q: string, limit = 10) =>
    api<{ products: unknown[] }>(
      `/v1/stocks/lookup?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
  quote: (productId: string) =>
    api<unknown>(`/v1/stocks/${encodeURIComponent(productId)}/quote`),
  history: (productId: string, period = "P5D", resolution = "PT1H") =>
    api<unknown>(
      `/v1/stocks/${encodeURIComponent(productId)}/history?period=${encodeURIComponent(period)}&resolution=${encodeURIComponent(resolution)}`,
    ),
  losers: () => api<{ losers: unknown[] }>("/v1/indexes/losers"),
  structuredAnalyze: (body: { productId?: string; query?: string }) =>
    api<unknown>("/v1/stocks/structured-analyze", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
