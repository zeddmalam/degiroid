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
  GERMAN_INDEXES,
  deltaTone,
  detectPageKind,
  emptySnapshot,
  formatChangePct,
  formatDelta,
  formatMoney,
  formatPrice,
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
} from "@repo/degiro";

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
    let indexLosers: DegiroIndexLoser[] = [];
    let enrichError: string | null = null;

    try {
      products = await api.fetchProductInfos([
        ...account.orders.map((order) => order.productId),
        ...account.positions.map((position) => position.id),
      ]);
      lastPrices = await api.fetchLastPrices(products);
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
      return {
        ...position,
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
