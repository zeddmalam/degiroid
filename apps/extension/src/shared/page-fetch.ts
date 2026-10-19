const REQUEST = "DEGIROID_PAGE_FETCH";
const RESPONSE = "DEGIROID_PAGE_FETCH_RESULT";
const SESSION_REQUEST = "DEGIROID_PAGE_SESSION";
const SESSION_RESPONSE = "DEGIROID_PAGE_SESSION_RESULT";

const TRADER_ORIGIN = "https://trader.degiro.nl";

type PageFetchResult = {
  source: "degiroid";
  type: typeof RESPONSE;
  requestId: string;
  ok: boolean;
  status: number;
  bodyText: string;
  error?: string;
};

type PageSessionResult = {
  source: "degiroid";
  type: typeof SESSION_RESPONSE;
  requestId: string;
  sessionId: string | null;
};

export type PageFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Default: include for trader.degiro.nl, omit otherwise (avoids VWD CORS). */
  credentials?: RequestCredentials;
};

/**
 * Trader APIs go through the MAIN-world bridge (page cookies).
 * Charting / other hosts use the extension fetch (host_permissions bypass CORS)
 * with credentials omitted — VWD rejects credentialed cross-origin requests.
 */
export async function pageFetch(
  url: string,
  init: PageFetchInit = {},
): Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}> {
  const absolute = new URL(url, TRADER_ORIGIN).toString();
  const isTrader = new URL(absolute).origin === TRADER_ORIGIN;
  const credentials =
    init.credentials ?? (isTrader ? "include" : "omit");

  if (!isTrader) {
    return extensionFetch(absolute, { ...init, credentials });
  }

  try {
    return await bridgeFetch(absolute, { ...init, credentials });
  } catch {
    return extensionFetch(absolute, { ...init, credentials });
  }
}

async function extensionFetch(
  url: string,
  init: PageFetchInit & { credentials: RequestCredentials },
): Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}> {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    credentials: init.credentials,
    headers: init.headers,
    body: init.body,
  });
  const bodyText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText) as unknown,
  };
}

/** Ask the page bridge for sessionId from cookie / prior trader network calls. */
export function requestPageSessionId(): Promise<string | null> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, 3_000);

    function onMessage(event: MessageEvent): void {
      if (event.source !== window) return;
      const data = event.data as PageSessionResult | undefined;
      if (
        !data ||
        data.source !== "degiroid" ||
        data.type !== SESSION_RESPONSE ||
        data.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(data.sessionId);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        source: "degiroid",
        type: SESSION_REQUEST,
        requestId,
      },
      location.origin,
    );
  });
}

function bridgeFetch(
  url: string,
  init: PageFetchInit & { credentials: RequestCredentials },
): Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Page fetch bridge timeout"));
    }, 60_000);

    function onMessage(event: MessageEvent): void {
      if (event.source !== window) return;
      const data = event.data as PageFetchResult | undefined;
      if (
        !data ||
        data.source !== "degiroid" ||
        data.type !== RESPONSE ||
        data.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);

      if (data.error && !data.bodyText) {
        reject(new Error(data.error));
        return;
      }

      resolve({
        ok: data.ok,
        status: data.status,
        text: async () => data.bodyText,
        json: async () => JSON.parse(data.bodyText) as unknown,
      });
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        source: "degiroid",
        type: REQUEST,
        requestId,
        url,
        method: init.method,
        headers: init.headers,
        body: init.body,
        credentials: init.credentials,
      },
      location.origin,
    );
  });
}
