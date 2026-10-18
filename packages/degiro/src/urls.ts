export const DEGIRO_TRADER_ORIGIN = "https://trader.degiro.nl";
export const DEGIRO_TRADER_HOST = "trader.degiro.nl";
export const DEGIRO_TRADER_MATCH = `${DEGIRO_TRADER_ORIGIN}/*`;
export const DEGIRO_CHARTING_ORIGIN = "https://charting.vwdservices.com";

export function isTraderHost(hostname: string): boolean {
  return hostname.toLowerCase() === DEGIRO_TRADER_HOST;
}

export function isDegiroHost(hostname: string): boolean {
  return isTraderHost(hostname);
}

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
