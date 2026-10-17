/**
 * Runs in the page MAIN world so fetches share DEGIRO's real browser session
 * (cookies), unlike isolated-world content-script fetch.
 */

const REQUEST = "DEGIROID_PAGE_FETCH";
const RESPONSE = "DEGIROID_PAGE_FETCH_RESULT";
const SESSION_REQUEST = "DEGIROID_PAGE_SESSION";
const SESSION_RESPONSE = "DEGIROID_PAGE_SESSION_RESULT";

type PageFetchRequest = {
  source: "degiroid";
  type: typeof REQUEST;
  requestId: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  credentials?: RequestCredentials;
};

type PageSessionRequest = {
  source: "degiroid";
  type: typeof SESSION_REQUEST;
  requestId: string;
};

type PageFetchResult = {
  source: "degiroid";
  type: typeof RESPONSE;
  requestId: string;
  ok: boolean;
  status: number;
  bodyText: string;
  error?: string;
};

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url, location.origin);
    return (
      parsed.origin === "https://trader.degiro.nl" ||
      parsed.origin === "https://charting.vwdservices.com"
    );
  } catch {
    return false;
  }
}

function readSessionIdFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)JSESSIONID=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function readSessionIdFromPerformance(): string | null {
  try {
    const entries = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const name = entries[i]?.name;
      if (!name?.includes("sessionId=")) continue;
      const sessionId = new URL(name).searchParams.get("sessionId");
      if (sessionId) return sessionId;
    }
  } catch {
    /* ignore */
  }
  return null;
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data as PageFetchRequest | PageSessionRequest | undefined;
  if (!data || data.source !== "degiroid") return;

  if (data.type === SESSION_REQUEST) {
    window.postMessage(
      {
        source: "degiroid",
        type: SESSION_RESPONSE,
        requestId: data.requestId,
        sessionId: readSessionIdFromCookie() ?? readSessionIdFromPerformance(),
      },
      location.origin,
    );
    return;
  }

  if (data.type !== REQUEST) return;

  void (async () => {
    const result: PageFetchResult = {
      source: "degiroid",
      type: RESPONSE,
      requestId: data.requestId,
      ok: false,
      status: 0,
      bodyText: "",
    };

    try {
      if (!isAllowedUrl(data.url)) {
        result.error = "URL not allowed";
        window.postMessage(result, location.origin);
        return;
      }

      const response = await fetch(data.url, {
        method: data.method ?? "GET",
        // Charting/VWD rejects credentialed CORS; trader needs cookies.
        credentials: data.credentials ?? "include",
        headers: data.headers,
        body: data.body,
      });

      result.status = response.status;
      result.ok = response.ok;
      result.bodyText = await response.text();
    } catch (error) {
      result.error = error instanceof Error ? error.message : "Fetch failed";
    }

    window.postMessage(result, location.origin);
  })();
});
