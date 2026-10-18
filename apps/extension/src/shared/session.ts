import { DEGIRO_TRADER_ORIGIN, withSessionId, withTradingJsessionId } from "@repo/degiro";
import { requestPageSessionId } from "./page-fetch";

export { withSessionId, withTradingJsessionId };

/**
 * DEGIRO session token (JSESSIONID cookie value).
 * - PA / product_search: `?sessionId=…`
 * - trading/secure: `…/{intAccount};jsessionid=…`
 */
export async function getDegiroSessionId(): Promise<string | null> {
  try {
    const cookie = await chrome.cookies.get({
      url: DEGIRO_TRADER_ORIGIN,
      name: "JSESSIONID",
    });
    if (cookie?.value) return cookie.value;
  } catch {
    /* cookies permission / API may be unavailable in some contexts */
  }

  return requestPageSessionId();
}
