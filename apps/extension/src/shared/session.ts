import { requestPageSessionId } from "./page-fetch";

const TRADER_ORIGIN = "https://trader.degiro.nl";

/**
 * DEGIRO session token (JSESSIONID cookie value).
 * - PA / product_search: `?sessionId=…`
 * - trading/secure: `…/{intAccount};jsessionid=…`
 */
export async function getDegiroSessionId(): Promise<string | null> {
  try {
    const cookie = await chrome.cookies.get({
      url: TRADER_ORIGIN,
      name: "JSESSIONID",
    });
    if (cookie?.value) return cookie.value;
  } catch {
    /* cookies permission / API may be unavailable in some contexts */
  }

  return requestPageSessionId();
}

/** PA-style: append `sessionId` (and optional extras) as query params. */
export function withSessionId(
  url: string | URL,
  sessionId: string,
  extra?: Record<string, string>,
): string {
  const parsed =
    typeof url === "string" ? new URL(url) : new URL(url.toString());
  parsed.searchParams.set("sessionId", sessionId);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      parsed.searchParams.set(key, value);
    }
  }
  return parsed.toString();
}

/**
 * Trading-style path matrix param, e.g.
 * `https://trader.degiro.nl/trading/secure/v5/account/info/31054529;jsessionid=….prod_dcv_ch51_2`
 */
export function withTradingJsessionId(
  absoluteUrl: string,
  sessionId: string,
  query?: Record<string, string>,
): string {
  const url = new URL(absoluteUrl);
  const path = url.pathname.replace(/;jsessionid=[^/]*/i, "");
  const search = new URLSearchParams(query ?? {});
  const qs = search.toString();
  return `${url.origin}${path};jsessionid=${sessionId}${qs ? `?${qs}` : ""}`;
}
