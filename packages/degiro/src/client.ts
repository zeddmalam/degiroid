import {
  ANALYZE_HISTORY_PERIOD,
  ANALYZE_HISTORY_RESOLUTION,
  structuredAnalyze,
} from "./analyze.js";
import type {
  DegiroClientInfo,
  DegiroFetch,
  DegiroIndexLoser,
  DegiroOrder,
  DegiroOrderSide,
  DegiroPosition,
  GermanIndexKey,
  PriceHistory,
  PricePoint,
  ProductInfo,
  StockLookupResult,
  StockQuote,
  StructuredAnalyzeResult,
} from "./types.js";
import {
  DEGIRO_CHARTING_ORIGIN,
  DEGIRO_TRADER_ORIGIN,
  withSessionId,
  withTradingJsessionId,
} from "./urls.js";
import { asNumber, asString } from "./utils.js";

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

const GERMANY_STOCK_COUNTRY_ID = 906;
const INDEX_LOSERS_LIMIT = 10;
const CHART_SERIES_BATCH = 25;

const ORDER_TYPE_LABELS: Record<number, string> = {
  0: "LIMIT",
  1: "STOP_LIMIT",
  2: "MARKET",
  3: "STOP_LOSS",
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
  orderType?: string;
  orderTypeId?: number;
  currency?: string;
};

export type DegiroApiOptions = {
  fetch: DegiroFetch;
  sessionId: string;
  intAccount: number;
  userToken?: number;
};

type DegiroLoginConfig = {
  clientId?: number | string;
  productSearchUrl?: string;
};

export function createDegiroApi(options: DegiroApiOptions) {
  const { fetch: degiroFetch, sessionId, intAccount } = options;
  let userToken = options.userToken;
  let configLoaded = false;

  async function fetchClient(): Promise<DegiroClientInfo | null> {
    const url = withSessionId(
      `${DEGIRO_TRADER_ORIGIN}/pa/secure/client`,
      sessionId,
    );
    const response = await degiroFetch(url, {
      headers: { Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) {
      throw new Error(`DEGIRO client request failed (${response.status})`);
    }
    const json = (await response.json()) as {
      data?: DegiroClientInfo;
    };
    return json.data ?? null;
  }

  async function fetchLoginConfig(): Promise<DegiroLoginConfig> {
    const url = withSessionId(
      `${DEGIRO_TRADER_ORIGIN}/login/secure/config`,
      sessionId,
    );
    const response = await degiroFetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return {};
    const json = (await response.json()) as { data?: DegiroLoginConfig };
    return json.data ?? {};
  }

  async function ensureSessionMeta(): Promise<void> {
    if (configLoaded && userToken) return;
    configLoaded = true;
    try {
      const config = await fetchLoginConfig();
      const configToken = asNumber(config.clientId) ?? undefined;
      if (!userToken && configToken != null) userToken = configToken;
    } catch {
      /* config is best-effort */
    }
    if (!userToken) {
      const client = await fetchClient();
      const clientToken = asNumber(client?.id) ?? undefined;
      if (clientToken != null) userToken = clientToken;
    }
  }

  async function fetchAccountUpdate(): Promise<{
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
      { portfolio: "0", totalPortfolio: "0", orders: "0" },
    );
    const response = await degiroFetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`DEGIRO account update failed (${response.status})`);
    }
    const json = (await response.json()) as {
      portfolio?: { value?: UpdateRow[] };
      orders?: { value?: UpdateRow[] };
    };
    return parseAccountUpdate(json);
  }

  async function fetchProductInfos(
    productIds: Array<number | string>,
  ): Promise<Map<string, ProductInfo>> {
    const unique = [...new Set(productIds.map(String))];
    if (unique.length === 0) return new Map();

    const url = withSessionId(
      `${DEGIRO_TRADER_ORIGIN}/product_search/secure/v5/products/info`,
      sessionId,
      { intAccount: String(intAccount) },
    );
    const response = await degiroFetch(url, {
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
    const json = (await response.json()) as {
      data?: Record<string, ProductInfo>;
    };
    const map = new Map<string, ProductInfo>();
    for (const [id, info] of Object.entries(json.data ?? {})) {
      map.set(id, { ...info, id: info.id ?? id });
    }
    return map;
  }

  async function lookupStocks(
    query: string,
    limit = 10,
  ): Promise<StockLookupResult[]> {
    const url = withSessionId(
      `${DEGIRO_TRADER_ORIGIN}/product_search/secure/v5/products/lookup`,
      sessionId,
      {
        searchText: query,
        productTypeId: "1",
        limit: String(limit),
        offset: "0",
        intAccount: String(intAccount),
      },
    );
    const response = await degiroFetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`DEGIRO product lookup failed (${response.status})`);
    }
    const json = (await response.json()) as { products?: ProductInfo[] };
    const results: StockLookupResult[] = [];
    for (const product of json.products ?? []) {
      const id = asString(product.id);
      if (!id) continue;
      results.push({
        id,
        name: product.name ?? product.symbol ?? `Product ${id}`,
        symbol: product.symbol,
        isin: product.isin,
        currency: product.currency,
        exchangeId: product.exchangeId,
        closePrice: asNumber(product.closePrice) ?? null,
      });
    }
    return results;
  }

  async function fetchLastPrices(
    productsById: Map<string, ProductInfo>,
  ): Promise<Map<string, number>> {
    await ensureSessionMeta();
    const prices = new Map<string, number>();
    if (!userToken || productsById.size === 0) return prices;
    const entries = [...productsById.entries()];
    for (let i = 0; i < entries.length; i += CHART_SERIES_BATCH) {
      const batch = entries.slice(i, i + CHART_SERIES_BATCH);
      const batchPrices = await fetchLastPricesBatch(batch, "P1D", "PT1M");
      for (const [id, price] of batchPrices.last) prices.set(id, price);
    }
    return prices;
  }

  function resolveProductIdFromChart(
    vwdToProduct: Map<string, string>,
    opts: {
      seriesId?: string | null;
      issueId?: string | null;
      identifier?: string | null;
    },
  ): string | undefined {
    const seriesId = opts.seriesId?.replace(/^price:/, "") ?? null;
    return (
      (opts.issueId ? vwdToProduct.get(opts.issueId) : undefined) ??
      (opts.identifier ? vwdToProduct.get(opts.identifier) : undefined) ??
      (seriesId ? vwdToProduct.get(seriesId) : undefined)
    );
  }

  async function fetchLastPricesBatch(
    entries: Array<[string, ProductInfo]>,
    period: string,
    resolution: string,
  ): Promise<{
    last: Map<string, number>;
    previousClose: Map<string, number>;
    series: Map<string, PricePoint[]>;
  }> {
    const last = new Map<string, number>();
    const previousClose = new Map<string, number>();
    const series = new Map<string, PricePoint[]>();
    if (entries.length === 0 || !userToken) return { last, previousClose, series };

    const url = new URL(`${DEGIRO_CHARTING_ORIGIN}/hchart/v1/deGiro/data.js`);
    url.searchParams.set("requestid", "1");
    url.searchParams.set("resolution", resolution);
    url.searchParams.set("period", period);
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
    if (vwdToProduct.size === 0) return { last, previousClose, series };

    try {
      const response = await degiroFetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return { last, previousClose, series };

      const json = (await response.json()) as {
        series?: Array<{
          id?: string;
          type?: string;
          data?: unknown;
        }>;
      };

      for (const item of json.series ?? []) {
        const data = item.data;
        if (!data || typeof data !== "object") continue;
        const seriesId = asString(item.id);

        if (!Array.isArray(data)) {
          const obj = data as {
            lastPrice?: number;
            previousClosePrice?: number;
            previousClose?: number;
            closePrice?: number;
            issueId?: number | string;
            identifier?: string;
          };
          const lastPrice = asNumber(obj.lastPrice);
          // Prefer explicit previous-close fields; chart `closePrice` is often today's.
          const prev =
            asNumber(obj.previousClosePrice) ?? asNumber(obj.previousClose);
          const productId = resolveProductIdFromChart(vwdToProduct, {
            seriesId,
            issueId: asString(obj.issueId),
            identifier: asString(obj.identifier),
          });
          if (!productId) continue;
          if (lastPrice != null) last.set(productId, lastPrice);
          if (prev != null) previousClose.set(productId, prev);
          continue;
        }

        // Time series: [[t, px], ...] or similar
        const points: PricePoint[] = [];
        for (const row of data) {
          if (!Array.isArray(row) || row.length < 2) continue;
          const time = asNumber(row[0]) ?? null;
          const price = asNumber(row[1]);
          if (price == null) continue;
          points.push({
            time: time != null && time < 1e12 ? time * 1000 : time,
            price,
          });
        }
        if (points.length === 0) continue;

        const productId =
          resolveProductIdFromChart(vwdToProduct, { seriesId }) ??
          [...entries].find(([id]) => !series.has(id))?.[0];
        if (!productId) continue;

        series.set(productId, points);
        const end = points[points.length - 1];
        if (end) last.set(productId, end.price);
      }
    } catch {
      /* charting best-effort */
    }

    return { last, previousClose, series };
  }

  async function getQuote(productId: string): Promise<StockQuote> {
    const products = await fetchProductInfos([productId]);
    const product = products.get(String(productId));
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }
    const lastPrices = await fetchLastPrices(products);
    const closePrice = asNumber(product.closePrice) ?? null;
    const lastPrice = lastPrices.get(String(productId)) ?? closePrice;
    const change =
      lastPrice != null && closePrice != null ? lastPrice - closePrice : null;
    const changePct =
      change != null && closePrice != null && closePrice !== 0
        ? change / closePrice
        : null;

    return {
      productId: String(productId),
      name: product.name ?? product.symbol ?? `Product ${productId}`,
      symbol: product.symbol,
      isin: product.isin,
      currency: product.currency,
      lastPrice,
      closePrice,
      change,
      changePct,
    };
  }

  async function getPriceHistory(
    productId: string,
    period = ANALYZE_HISTORY_PERIOD,
    resolution = ANALYZE_HISTORY_RESOLUTION,
  ): Promise<PriceHistory> {
    const products = await fetchProductInfos([productId]);
    const product = products.get(String(productId));
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }
    const { last, series } = await fetchLastPricesBatch(
      [[String(productId), product]],
      period,
      resolution,
    );
    let points = series.get(String(productId)) ?? [];
    if (points.length === 0) {
      const lastPrice =
        last.get(String(productId)) ?? asNumber(product.closePrice);
      if (lastPrice != null) {
        points = [{ time: Date.now(), price: lastPrice }];
      }
    }
    const prices = points.map((p) => p.price);
    const high = prices.length ? Math.max(...prices) : null;
    const low = prices.length ? Math.min(...prices) : null;
    const end = points[points.length - 1]?.price ?? null;

    return {
      productId: String(productId),
      name: product.name ?? product.symbol ?? `Product ${productId}`,
      symbol: product.symbol,
      currency: product.currency,
      period,
      resolution,
      points,
      high,
      low,
      last: end,
    };
  }

  async function fetchIndexStocks(indexId: number): Promise<ProductInfo[]> {
    // Live DEGIRO uses productsearch/v1 for index constituents (not product_search/v5).
    // API rejects limit > 100 (400). German indexes fit in one page (SDAX ~62).
    const url = withSessionId(
      `${DEGIRO_TRADER_ORIGIN}/productsearch/secure/v1/stocks`,
      sessionId,
      {
        indexId: String(indexId),
        stockCountryId: String(GERMANY_STOCK_COUNTRY_ID),
        offset: "0",
        limit: "100",
        requireTotal: "true",
        sortColumns: "name",
        sortTypes: "asc",
        intAccount: String(intAccount),
      },
    );
    const response = await degiroFetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`DEGIRO index stocks failed (${response.status})`);
    }
    let json: { products?: ProductInfo[] };
    try {
      json = (await response.json()) as { products?: ProductInfo[] };
    } catch {
      throw new Error("DEGIRO index stocks returned non-JSON response");
    }
    return json.products ?? [];
  }

  async function fetchGermanIndexLosers(): Promise<DegiroIndexLoser[]> {
    await ensureSessionMeta();
    if (!userToken) {
      throw new Error(
        "Missing DEGIRO user token; cannot load live prices for index losers.",
      );
    }

    const productsByIndex = await Promise.all(
      GERMAN_INDEXES.map(async (index) => ({
        index,
        products: await fetchIndexStocks(index.indexId),
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

    if (allProducts.size === 0) {
      throw new Error("DEGIRO returned no German index constituents.");
    }

    const lastPrices = new Map<string, number>();
    const previousCloses = new Map<string, number>();
    const entries = [...allProducts.entries()];
    for (let i = 0; i < entries.length; i += CHART_SERIES_BATCH) {
      const batch = entries.slice(i, i + CHART_SERIES_BATCH);
      const batchPrices = await fetchLastPricesBatch(batch, "P1D", "PT1M");
      for (const [id, price] of batchPrices.last) lastPrices.set(id, price);
      for (const [id, price] of batchPrices.previousClose) {
        previousCloses.set(id, price);
      }
    }

    if (lastPrices.size === 0) {
      throw new Error(
        "Could not load live last prices for German index stocks.",
      );
    }

    const ranked: DegiroIndexLoser[] = [];

    for (const [productId, product] of allProducts) {
      const closePrice =
        previousCloses.get(productId) ?? asNumber(product.closePrice) ?? null;
      const lastPrice = lastPrices.get(productId) ?? null;
      const change =
        lastPrice != null && closePrice != null
          ? lastPrice - closePrice
          : null;
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
    orders: Awaited<ReturnType<typeof fetchAccountUpdate>>["orders"];
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

  async function structuredAnalyzeProduct(
    productId: string,
  ): Promise<StructuredAnalyzeResult> {
    const [quote, history] = await Promise.all([
      getQuote(productId),
      getPriceHistory(productId),
    ]);
    return structuredAnalyze({ quote, history });
  }

  return {
    fetchClient,
    fetchAccountUpdate,
    fetchProductInfos,
    lookupStocks,
    fetchLastPrices,
    getQuote,
    getPriceHistory,
    fetchGermanIndexLosers,
    enrichOrders,
    structuredAnalyzeProduct,
  };
}

export type DegiroApi = ReturnType<typeof createDegiroApi>;

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

function parseAccountUpdate(json: {
  portfolio?: { value?: UpdateRow[] };
  orders?: { value?: UpdateRow[] };
}) {
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
