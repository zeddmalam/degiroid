import type { DegiroPageKind, DegiroSessionSnapshot } from "./types.js";
import { isTraderHost } from "./urls.js";

export function detectPageKind(url: string): DegiroPageKind {
  try {
    const { hostname, pathname } = new URL(url);
    if (!isTraderHost(hostname)) return "unknown";
    if (pathname.includes("/login")) return "login";
    return "trader";
  } catch {
    return "unknown";
  }
}

export const emptySnapshot = (
  url = "",
  pageKind: DegiroPageKind = "unknown",
): DegiroSessionSnapshot => ({
  connected: false,
  pageKind,
  url,
  client: null,
  positions: [],
  orders: [],
  indexLosers: [],
  cashValue: null,
  portfolioValue: null,
  lastSyncedAt: null,
  error: null,
});
