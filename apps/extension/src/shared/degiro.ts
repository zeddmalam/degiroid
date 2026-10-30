import {
  createDegiroApi,
  DEGIRO_TRADER_ORIGIN,
  detectPageKind,
  emptySnapshot,
  type DegiroClientInfo,
  type DegiroIndexLoser,
  type DegiroSessionSnapshot,
  type ProductInfo,
} from "@repo/degiro";
import { pageFetch } from "./page-fetch";
import { getDegiroSessionId } from "./session";

export {
  DEGIRO_CHARTING_ORIGIN,
  DEGIRO_TRADER_HOST,
  DEGIRO_TRADER_MATCH,
  DEGIRO_TRADER_ORIGIN,
  DegiroOrderType,
  DegiroTimeType,
  GERMAN_INDEXES,
  deltaTone,
  detectPageKind,
  emptySnapshot,
  formatChangePct,
  formatDelta,
  formatMoney,
  formatPrice,
  unrealizedPnl,
  isDegiroHost,
  isTraderHost,
  sessionStatusLabel,
  type DegiroClientInfo,
  type DegiroIndexLoser,
  type DegiroOrder,
  type DegiroOrderSide,
  type DegiroPageKind,
  type DegiroPosition,
  type DegiroSessionSnapshot,
  type GermanIndexKey,
  type PlaceOrderResult,
} from "@repo/degiro";

/** Offset applied when creating a quick GTC stop-loss from an open position. */
export const STOP_LOSS_OFFSET = 0.5;

/** Max relative drift from portfolio mark when applying a live last. */
const LIVE_VS_PORTFOLIO_MAX = 0.08;
/** Portfolio within this of previous close is treated as a stale close mark. */
const STUCK_ON_CLOSE_PCT = 0.003;

export function stopLossPriceFromCurrent(currentPrice: number): number {
  return Math.round((currentPrice - STOP_LOSS_OFFSET) * 100) / 100;
}

/** Refresh portfolio mark with a live last only when the print looks trustworthy. */
function pickMarkPrice(args: {
  portfolioPrice: number | undefined;
  livePrice: number | undefined;
  previousClose: number | undefined;
  breakEvenPrice: number | undefined;
  size: number | undefined;
}): number | undefined {
  const { portfolioPrice, livePrice, previousClose, breakEvenPrice, size } =
    args;
  if (livePrice == null || !(livePrice > 0)) return portfolioPrice;
  if (portfolioPrice == null || !(portfolioPrice > 0)) return livePrice;

  const drift = Math.abs(livePrice - portfolioPrice) / portfolioPrice;
  const stuckOnClose =
    previousClose != null &&
    previousClose > 0 &&
    Math.abs(portfolioPrice - previousClose) / previousClose <=
      STUCK_ON_CLOSE_PCT;

  // Small drift: always prefer fresher live.
  if (drift <= LIVE_VS_PORTFOLIO_MAX) return livePrice;

  // Larger drift only if portfolio is still the prior close (Lufthansa case).
  if (!stuckOnClose) return portfolioPrice;
  if (drift > 0.2) return portfolioPrice;

  if (
    breakEvenPrice != null &&
    breakEvenPrice !== 0 &&
    size != null &&
    size !== 0
  ) {
    const pnlPortfolio = (portfolioPrice - breakEvenPrice) * size;
    const pnlLive = (livePrice - breakEvenPrice) * size;
    if (
      pnlPortfolio !== 0 &&
      Math.sign(pnlPortfolio) !== Math.sign(pnlLive) &&
      pnlLive !== 0
    ) {
      return portfolioPrice;
    }
  }

  return livePrice;
}

const SESSION_RETRY_MS = 1_000;
const SESSION_WAIT_MS = 45_000;

async function waitForDegiroClient(signal?: AbortSignal): Promise<{
  client: DegiroClientInfo | null;
  sessionId: string | null;
  lastError: string | null;
}> {
  const deadline = Date.now() + SESSION_WAIT_MS;
  let lastError: string | null = null;
  let sessionId: string | null = null;

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      return { client: null, sessionId, lastError: "Sync cancelled" };
    }

    try {
      sessionId = await getDegiroSessionId();
      if (!sessionId) {
        lastError = "No DEGIRO sessionId (JSESSIONID) on this page yet";
      } else {
        const api = createDegiroApi({
          fetch: pageFetch,
          sessionId,
          intAccount: 0,
        });
        const client = await api.fetchClient();
        if (client?.intAccount) {
          return { client, sessionId, lastError: null };
        }
        lastError = "DEGIRO client API returned no account yet";
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Client request failed";
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SESSION_RETRY_MS);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  return { client: null, sessionId, lastError };
}

export function createPageDegiroApi(session: {
  sessionId: string;
  intAccount: number;
  userToken?: number;
}) {
  return createDegiroApi({
    fetch: pageFetch,
    sessionId: session.sessionId,
    intAccount: session.intAccount,
    userToken: session.userToken,
  });
}

export async function syncDegiroSession(
  pageUrl: string,
  options?: { signal?: AbortSignal },
): Promise<DegiroSessionSnapshot> {
  const pageKind = detectPageKind(pageUrl);
  const base = emptySnapshot(pageUrl, pageKind);

  if (pageKind === "login") {
    return { ...base, error: "Log in on this page to activate Degiroid." };
  }

  if (pageKind !== "trader") {
    return {
      ...base,
      error: `Open ${DEGIRO_TRADER_ORIGIN} to sync your session.`,
    };
  }

  try {
    const { client, sessionId, lastError } = await waitForDegiroClient(
      options?.signal,
    );
    if (!client?.intAccount || !sessionId) {
      return {
        ...base,
        connected: false,
        error:
          lastError ??
          "Could not read the DEGIRO session from this page. Refresh the trader tab.",
      };
    }

    const api = createPageDegiroApi({
      sessionId,
      intAccount: client.intAccount,
      userToken: client.id,
    });

    const account = await api.fetchAccountUpdate();

    let products = new Map<string, ProductInfo>();
    let lastPrices = new Map<string, number>();
    let previousCloses = new Map<string, number>();
    let indexLosers: DegiroIndexLoser[] = [];
    let enrichError: string | null = null;

    try {
      products = await api.fetchProductInfos([
        ...account.orders.map((order) => order.productId),
        ...account.positions.map((position) => position.id),
      ]);
      const marks = await api.fetchLastPrices(products);
      lastPrices = marks.last;
      previousCloses = marks.previousClose;
    } catch (error) {
      enrichError =
        error instanceof Error
          ? error.message
          : "Could not enrich order prices.";
    }

    try {
      indexLosers = await api.fetchGermanIndexLosers();
    } catch (error) {
      const losersError =
        error instanceof Error
          ? error.message
          : "Could not load German index losers.";
      enrichError = enrichError ? `${enrichError} ${losersError}` : losersError;
    }

    const orders = api.enrichOrders({
      orders: account.orders,
      positions: account.positions,
      products,
      lastPrices,
    });

    const positions = account.positions.map((position) => {
      const product = products.get(String(position.id));
      const key = String(position.id);
      const rawLive = lastPrices.get(key);
      const livePrice =
        rawLive != null && Number.isFinite(rawLive) && rawLive > 0
          ? rawLive
          : undefined;
      const price = pickMarkPrice({
        portfolioPrice: position.price,
        livePrice,
        previousClose: previousCloses.get(key),
        breakEvenPrice: position.breakEvenPrice,
        size: position.size,
      });
      const size = position.size;
      const correction = position.portfolioValueCorrection ?? 0;
      const value =
        price != null && size != null
          ? price * size + correction
          : position.value;
      return {
        ...position,
        price,
        value,
        productName:
          position.productName ??
          product?.name ??
          product?.symbol ??
          undefined,
      };
    });

    return {
      connected: true,
      pageKind,
      url: pageUrl,
      client,
      positions,
      orders,
      indexLosers,
      cashValue: account.cashValue,
      portfolioValue: account.portfolioValue,
      lastSyncedAt: Date.now(),
      error: enrichError,
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "Failed to sync DEGIRO.",
    };
  }
}
