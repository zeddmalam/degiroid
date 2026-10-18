import { pageFetch } from "./page-fetch";
import {
  getDegiroSessionId,
  withSessionId,
  withTradingJsessionId,
} from "./session";

/** Canonical DEGIRO web trader URL. */
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

export type DegiroPageKind = "trader" | "login" | "unknown";

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

export type DegiroClientInfo = {
  id?: number;
  intAccount?: number;
  displayName?: string;
  username?: string;
  currency?: string;
  locale?: string;
};

export type DegiroPosition = {
  id: number | string;
  positionType?: string;
  size?: number;
  price?: number;
  value?: number;
  breakEvenPrice?: number;
  productName?: string;
};

export type DegiroOrderSide = "BUY" | "SELL";

export type DegiroOrder = {
  id: string;
  productId: number | string;
  productName?: string;
  side: DegiroOrderSide;
  size?: number;
  orderPrice?: number;
  marketPrice?: number | null;
  /** marketPrice − orderPrice */
  priceDelta?: number | null;
  /** (marketPrice − orderPrice) / orderPrice */
  priceDeltaPct?: number | null;
  currency?: string;
  orderType?: string;
};

export type GermanIndexKey = "dax" | "mdax" | "sdax" | "tecdax";

export type DegiroIndexLoser = {
  /** Indexes this product appears in (e.g. DAX + TecDAX). */
  indexes: string[];
  productId: string;
  name: string;
  symbol?: string;
  currency?: string;
  lastPrice: number | null;
  closePrice: number | null;
  change: number | null;
  changePct: number | null;
};

export type DegiroSessionSnapshot = {
  connected: boolean;
  pageKind: DegiroPageKind;
  url: string;
  client: DegiroClientInfo | null;
  positions: DegiroPosition[];
  orders: DegiroOrder[];
  /** Top day-losers across DAX / MDAX / SDAX / TecDAX (deduped). */
  indexLosers: DegiroIndexLoser[];
  cashValue: number | null;
  portfolioValue: number | null;
  lastSyncedAt: number | null;
  error: string | null;
};

export const GERMAN_INDEXES: ReadonlyArray<{
  key: GermanIndexKey;
  name: string;
  indexId: number;
}> = [
  { key: "dax", name: "DAX", indexId: 6 },
  { key: "mdax", name: "MDAX", indexId: 106001 },
  { key: "sdax", name: "SDAX", indexId: 106002 },
  { key: "tecdax", name: "TecDAX", indexId: 106003 },
];

/** DEGIRO `stockCountries` id for Germany. */
const GERMANY_STOCK_COUNTRY_ID = 906;
const INDEX_LOSERS_LIMIT = 10;
const CHART_SERIES_BATCH = 25;

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

type ClientApiResponse = {
  data?: {
    id?: number;
    intAccount?: number;
    displayName?: string;
    username?: string;
    currency?: string;
    locale?: string;
  };
};

type NamedValue = { name?: string; value?: unknown };

type UpdateRow = {
  id?: number | string;
  positionType?: string;
  size?: number;
  price?: number;
  value?: number | NamedValue[];
  breakEvenPrice?: number;
  name?: string;
  product?: string;
  productId?: number | string;
  buysell?: string;
  quantity?: number;
  stopPrice?: number;
  orderType?: string;
  orderTypeId?: number;
  currency?: string;
};

type UpdateApiResponse = {
  portfolio?: { value?: UpdateRow[] };
  orders?: { value?: UpdateRow[] };
};

type ProductInfo = {
  id?: string;
  name?: string;
  symbol?: string;
  currency?: string;
  closePrice?: number;
  vwdId?: string;
  vwdIdSecondary?: string;
  vwdIdentifierType?: string;
};

type ProductInfoResponse = {
  data?: Record<string, ProductInfo>;
};

type StocksSearchResponse = {
  products?: ProductInfo[];
  total?: number;
};

type ChartSeries = {
  type?: string;
  data?: { lastPrice?: number };
};

type ChartApiResponse = {
  series?: ChartSeries[];
};

const ORDER_TYPE_LABELS: Record<number, string> = {
  0: "LIMIT",
  1: "STOP_LIMIT",
  2: "MARKET",
  3: "STOP_LOSS",
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

/** Normalize DEGIRO update rows that may be flat or `{ name, value }[]`. */
function flattenUpdateRow(row: UpdateRow): Record<string, unknown> {
  if (Array.isArray(row.value)) {
    const flat: Record<string, unknown> = { id: row.id };
    for (const entry of row.value) {
      if (entry?.name) flat[entry.name] = entry.value;
    }
    return flat;
  }
  return row as Record<string, unknown>;
}

function normalizeSide(value: unknown): DegiroOrderSide | null {
  const raw = asString(value)?.toUpperCase();
  if (!raw) return null;
  if (raw === "B" || raw === "BUY" || raw === "0") return "BUY";
  if (raw === "S" || raw === "SELL" || raw === "1") return "SELL";
  return null;
}

/**
 * Calls DEGIRO's same-origin trader APIs using the page session.
 * PA uses `?sessionId=`; trading/secure uses `;jsessionid=` on the path.
 * Must run in a content script on trader.degiro.nl.
 */
export async function fetchDegiroClient(
  sessionId: string,
): Promise<DegiroClientInfo | null> {
  const url = withSessionId(`${DEGIRO_TRADER_ORIGIN}/pa/secure/client`, sessionId);
  const response = await pageFetch(url, {
    headers: { Accept: "application/json" },
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`DEGIRO client request failed (${response.status})`);
  }

  const json = (await response.json()) as ClientApiResponse;
  const data = json.data;
  if (!data) return null;

  return {
    id: data.id,
    intAccount: data.intAccount,
    displayName: data.displayName,
    username: data.username,
    currency: data.currency,
    locale: data.locale,
  };
}

export async function fetchDegiroAccountUpdate(
  intAccount: number,
  sessionId: string,
): Promise<{
  positions: DegiroPosition[];
  orders: Array<{
    id: string;
    productId: number | string;
    productName?: string;
    side: DegiroOrderSide;
    size?: number;
    orderPrice?: number;
    currency?: string;
    orderType?: string;
  }>;
  cashValue: number | null;
  portfolioValue: number | null;
}> {
  const url = withTradingJsessionId(
    `${DEGIRO_TRADER_ORIGIN}/trading/secure/v5/update/${intAccount}`,
    sessionId,
    {
      portfolio: "0",
      totalPortfolio: "0",
      orders: "0",
    },
  );

  const response = await pageFetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`DEGIRO account update failed (${response.status})`);
  }

  const json = (await response.json()) as UpdateApiResponse;
  const portfolioRows = json.portfolio?.value ?? [];
  const orderRows = json.orders?.value ?? [];

  const positions: DegiroPosition[] = [];
  let cashValue: number | null = null;
  let portfolioValue = 0;

  for (const raw of portfolioRows) {
    const row = flattenUpdateRow(raw);
    const positionType = asString(row.positionType);
    const value = asNumber(row.value) ?? 0;

    if (positionType === "CASH") {
      cashValue = (cashValue ?? 0) + value;
      continue;
    }

    portfolioValue += value;
    positions.push({
      id: (row.id as number | string | undefined) ?? positions.length,
      positionType,
      size: asNumber(row.size),
      price: asNumber(row.price),
      value: asNumber(row.value),
      breakEvenPrice: asNumber(row.breakEvenPrice),
      productName: asString(row.name) ?? asString(row.product),
    });
  }

  const orders: Array<{
    id: string;
    productId: number | string;
    productName?: string;
    side: DegiroOrderSide;
    size?: number;
    orderPrice?: number;
    currency?: string;
    orderType?: string;
  }> = [];

  for (const raw of orderRows) {
    const row = flattenUpdateRow(raw);
    const productId = row.productId ?? row.product;
    const side = normalizeSide(row.buysell);
    if (productId == null || side == null) continue;

    const orderTypeId = asNumber(row.orderTypeId);
    orders.push({
      id: asString(row.id) ?? String(orders.length),
      productId: productId as number | string,
      productName: asString(row.product) ?? asString(row.name),
      side,
      size: asNumber(row.size) ?? asNumber(row.quantity),
      orderPrice: asNumber(row.price),
      currency: asString(row.currency),
      orderType:
        asString(row.orderType) ??
        (orderTypeId != null ? ORDER_TYPE_LABELS[orderTypeId] : undefined),
    });
  }

  return {
    positions,
    orders,
    cashValue,
    portfolioValue:
      positions.length > 0 || cashValue !== null ? portfolioValue : null,
  };
}

async function fetchProductInfos(
  productIds: Array<number | string>,
  sessionId: string,
  intAccount: number,
): Promise<Map<string, ProductInfo>> {
  const unique = [...new Set(productIds.map(String))];
  if (unique.length === 0) return new Map();

  const url = withSessionId(
    `${DEGIRO_TRADER_ORIGIN}/product_search/secure/v5/products/info`,
    sessionId,
    { intAccount: String(intAccount) },
  );

  const response = await pageFetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(unique),
  });

  if (!response.ok) {
    throw new Error(`DEGIRO product info failed (${response.status})`);
  }

  const json = (await response.json()) as ProductInfoResponse;
  const map = new Map<string, ProductInfo>();
  for (const [id, info] of Object.entries(json.data ?? {})) {
    map.set(id, { ...info, id: info.id ?? id });
  }
  return map;
}

async function fetchLastPricesBatch(
  entries: Array<[string, ProductInfo]>,
  userToken: number,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (entries.length === 0) return prices;

  const url = new URL(`${DEGIRO_CHARTING_ORIGIN}/hchart/v1/deGiro/data.js`);
  url.searchParams.set("requestid", "1");
  url.searchParams.set("resolution", "PT1M");
  url.searchParams.set("period", "P1D");
  url.searchParams.set("format", "json");
  url.searchParams.set("userToken", String(userToken));

  const vwdToProduct = new Map<string, string>();
  for (const [productId, product] of entries) {
    const vwdId = product.vwdId ?? product.vwdIdSecondary;
    if (!vwdId) continue;
    const identifierType = product.vwdIdentifierType ?? "issueid";
    const seriesKey = `${identifierType}:${vwdId}`;
    url.searchParams.append("series", seriesKey);
    url.searchParams.append("series", `price:${seriesKey}`);
    vwdToProduct.set(String(vwdId), productId);
    vwdToProduct.set(seriesKey, productId);
  }

  if (vwdToProduct.size === 0) return prices;

  try {
    const response = await pageFetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return prices;

    const json = (await response.json()) as ChartApiResponse;
    for (const series of json.series ?? []) {
      const data = series.data as
        | {
            lastPrice?: number;
            issueId?: number | string;
            identifier?: string;
          }
        | undefined;
      const lastPrice = data?.lastPrice;
      if (!data || typeof lastPrice !== "number") continue;
      const issueId = asString(data.issueId);
      const identifier = asString(data.identifier);
      const productId =
        (issueId ? vwdToProduct.get(issueId) : undefined) ??
        (identifier ? vwdToProduct.get(identifier) : undefined);
      if (productId) prices.set(productId, lastPrice);
    }
  } catch {
    /* charting is best-effort; fall back to close/portfolio prices */
  }

  return prices;
}

async function fetchLastPrices(
  productsById: Map<string, ProductInfo>,
  userToken: number | undefined,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (!userToken || productsById.size === 0) return prices;

  const entries = [...productsById.entries()];
  for (let i = 0; i < entries.length; i += CHART_SERIES_BATCH) {
    const batch = entries.slice(i, i + CHART_SERIES_BATCH);
    const batchPrices = await fetchLastPricesBatch(batch, userToken);
    for (const [id, price] of batchPrices) prices.set(id, price);
  }

  return prices;
}

async function fetchIndexStocks(
  indexId: number,
  sessionId: string,
  intAccount: number,
): Promise<ProductInfo[]> {
  const url = withSessionId(
    `${DEGIRO_TRADER_ORIGIN}/productsearch/secure/v1/stocks`,
    sessionId,
    {
      indexId: String(indexId),
      stockCountryId: String(GERMANY_STOCK_COUNTRY_ID),
      offset: "0",
      limit: "200",
      requireTotal: "true",
      sortColumns: "name",
      sortTypes: "asc",
      intAccount: String(intAccount),
    },
  );

  const response = await pageFetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`DEGIRO index stocks failed (${response.status})`);
  }

  const json = (await response.json()) as StocksSearchResponse;
  return json.products ?? [];
}

/**
 * Top day-losers across DAX, MDAX, SDAX, and TecDAX (deduped by product).
 * Sorted ascending by day % (biggest loser first).
 */
export async function fetchGermanIndexLosers(
  sessionId: string,
  intAccount: number,
  userToken: number | undefined,
): Promise<DegiroIndexLoser[]> {
  if (!userToken) return [];

  const productsByIndex = await Promise.all(
    GERMAN_INDEXES.map(async (index) => ({
      index,
      products: await fetchIndexStocks(index.indexId, sessionId, intAccount),
    })),
  );

  const allProducts = new Map<string, ProductInfo>();
  const indexesByProduct = new Map<string, string[]>();

  for (const { index, products } of productsByIndex) {
    for (const product of products) {
      const id = asString(product.id);
      if (!id) continue;
      allProducts.set(id, { ...product, id });
      const indexes = indexesByProduct.get(id) ?? [];
      if (!indexes.includes(index.name)) indexes.push(index.name);
      indexesByProduct.set(id, indexes);
    }
  }

  const lastPrices = await fetchLastPrices(allProducts, userToken);
  const ranked: DegiroIndexLoser[] = [];

  for (const [productId, product] of allProducts) {
    const closePrice = asNumber(product.closePrice) ?? null;
    const lastPrice = lastPrices.get(productId) ?? null;
    const change =
      lastPrice != null && closePrice != null ? lastPrice - closePrice : null;
    const changePct =
      change != null && closePrice != null && closePrice !== 0
        ? change / closePrice
        : null;

    ranked.push({
      indexes: indexesByProduct.get(productId) ?? [],
      productId,
      name: product.name ?? product.symbol ?? `Product ${productId}`,
      symbol: product.symbol,
      currency: product.currency,
      lastPrice,
      closePrice,
      change,
      changePct,
    });
  }

  ranked.sort((a, b) => {
    const aPct = a.changePct ?? Number.POSITIVE_INFINITY;
    const bPct = b.changePct ?? Number.POSITIVE_INFINITY;
    return aPct - bPct;
  });

  return ranked
    .filter((row) => row.changePct != null && row.changePct < 0)
    .slice(0, INDEX_LOSERS_LIMIT);
}

function enrichOrders(args: {
  orders: Awaited<ReturnType<typeof fetchDegiroAccountUpdate>>["orders"];
  positions: DegiroPosition[];
  products: Map<string, ProductInfo>;
  lastPrices: Map<string, number>;
}): DegiroOrder[] {
  const positionPriceById = new Map<string, number>();
  for (const position of args.positions) {
    if (typeof position.price === "number") {
      positionPriceById.set(String(position.id), position.price);
    }
  }

  return args.orders.map((order) => {
    const productKey = String(order.productId);
    const product = args.products.get(productKey);
    const marketPrice =
      positionPriceById.get(productKey) ??
      args.lastPrices.get(productKey) ??
      product?.closePrice ??
      null;

    const orderPrice = order.orderPrice;
    const priceDelta =
      marketPrice != null && orderPrice != null
        ? marketPrice - orderPrice
        : null;
    const priceDeltaPct =
      priceDelta != null && orderPrice != null && orderPrice !== 0
        ? priceDelta / orderPrice
        : null;

    return {
      ...order,
      productName:
        order.productName ?? product?.name ?? product?.symbol ?? undefined,
      currency: order.currency ?? product?.currency,
      marketPrice,
      priceDelta,
      priceDeltaPct,
    };
  });
}

const SESSION_RETRY_MS = 1_000;
const SESSION_WAIT_MS = 45_000;

/**
 * Poll the trader page session until DEGIRO's client API is available.
 * The SPA often finishes document load before cookies/session are usable.
 */
async function waitForDegiroClient(
  signal?: AbortSignal,
): Promise<{
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
        const client = await fetchDegiroClient(sessionId);
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

    const account = await fetchDegiroAccountUpdate(
      client.intAccount,
      sessionId,
    );

    let products = new Map<string, ProductInfo>();
    let lastPrices = new Map<string, number>();
    let indexLosers: DegiroIndexLoser[] = [];
    let enrichError: string | null = null;

    try {
      products = await fetchProductInfos(
        account.orders.map((order) => order.productId),
        sessionId,
        client.intAccount,
      );
      lastPrices = await fetchLastPrices(products, client.id);
    } catch (error) {
      enrichError =
        error instanceof Error
          ? error.message
          : "Could not enrich order prices.";
    }

    try {
      indexLosers = await fetchGermanIndexLosers(
        sessionId,
        client.intAccount,
        client.id,
      );
    } catch (error) {
      const losersError =
        error instanceof Error
          ? error.message
          : "Could not load German index losers.";
      enrichError = enrichError ? `${enrichError} ${losersError}` : losersError;
    }

    const orders = enrichOrders({
      orders: account.orders,
      positions: account.positions,
      products,
      lastPrices,
    });

    return {
      connected: true,
      pageKind,
      url: pageUrl,
      client,
      positions: account.positions,
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

/** Human-readable status for panel/popup, tied to the current page. */
export function sessionStatusLabel(snapshot: DegiroSessionSnapshot): string {
  if (snapshot.connected) {
    return snapshot.client?.displayName
      ? `Signed in as ${snapshot.client.displayName}`
      : "Connected to DEGIRO trader";
  }

  if (snapshot.pageKind === "login") {
    return "Log in on this page to connect";
  }

  if (snapshot.pageKind === "trader") {
    if (
      !snapshot.error ||
      snapshot.error.includes("no account yet") ||
      snapshot.error.includes("sessionId")
    ) {
      return "Syncing with this page…";
    }
    return snapshot.error;
  }

  return snapshot.error ?? `Open ${DEGIRO_TRADER_ORIGIN} to connect.`;
}

export function formatMoney(
  value: number | null | undefined,
  currency = "EUR",
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPrice(
  value: number | null | undefined,
  maximumFractionDigits = 4,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDelta(
  delta: number | null | undefined,
  deltaPct: number | null | undefined,
): string {
  if (delta == null || Number.isNaN(delta)) return "—";
  const sign = delta > 0 ? "+" : "";
  const absolute = formatPrice(delta);
  if (deltaPct == null || Number.isNaN(deltaPct)) {
    return `${sign}${absolute}`;
  }
  const pct = new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(deltaPct);
  return `${sign}${absolute} (${pct})`;
}

export function formatChangePct(changePct: number | null | undefined): string {
  if (changePct == null || Number.isNaN(changePct)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(changePct);
}

export function deltaTone(
  side: DegiroOrderSide,
  delta: number | null | undefined,
): "positive" | "negative" | "neutral" {
  if (delta == null || delta === 0) return "neutral";
  // BUY fills when market ≤ order; SELL fills when market ≥ order.
  if (side === "BUY") return delta < 0 ? "positive" : "negative";
  return delta > 0 ? "positive" : "negative";
}
