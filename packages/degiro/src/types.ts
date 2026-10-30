export type DegiroPageKind = "trader" | "login" | "unknown";

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
  /** Last/market price (portfolio update, optionally refreshed with live last). */
  price?: number;
  /** Market value of the position (size × price, + correction when present). */
  value?: number;
  breakEvenPrice?: number;
  /** Unrealized P/L in account base currency (DEGIRO `plBase`). */
  plBase?: number;
  portfolioValueCorrection?: number;
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
  priceDelta?: number | null;
  priceDeltaPct?: number | null;
  currency?: string;
  orderType?: string;
};

export type GermanIndexKey = "dax" | "mdax" | "sdax" | "tecdax";

export type DegiroIndexLoser = {
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
  indexLosers: DegiroIndexLoser[];
  cashValue: number | null;
  portfolioValue: number | null;
  lastSyncedAt: number | null;
  error: string | null;
};

export type ProductInfo = {
  id?: string;
  name?: string;
  symbol?: string;
  isin?: string;
  currency?: string;
  closePrice?: number;
  exchangeId?: number | string;
  vwdId?: string;
  vwdIdSecondary?: string;
  vwdIdentifierType?: string;
  productType?: string;
  productTypeId?: number;
};

export type StockLookupResult = {
  id: string;
  name: string;
  symbol?: string;
  isin?: string;
  currency?: string;
  exchangeId?: number | string;
  closePrice?: number | null;
};

export type StockQuote = {
  productId: string;
  name: string;
  symbol?: string;
  isin?: string;
  currency?: string;
  lastPrice: number | null;
  closePrice: number | null;
  change: number | null;
  changePct: number | null;
};

export type PricePoint = {
  /** Epoch ms when available */
  time: number | null;
  price: number;
};

export type PriceHistory = {
  productId: string;
  name: string;
  symbol?: string;
  currency?: string;
  period: string;
  resolution: string;
  points: PricePoint[];
  high: number | null;
  low: number | null;
  last: number | null;
};

export type StructuredAnalyzeResult = {
  productId: string;
  name: string;
  symbol?: string;
  currency?: string;
  currentPrice: number | null;
  closePrice: number | null;
  dayChangePct: number | null;
  windowChangePct: number | null;
  recentHigh: number | null;
  recentLow: number | null;
  buyRange: { low: number; high: number; currency: string } | null;
  sellRange: { low: number; high: number; currency: string } | null;
  significantDrop: boolean;
  dropReasons: string[];
  summary: string;
};

export type RecommendationAction = "buy" | "watch" | "skip";

export type StockRecommendation = {
  productId: string;
  name: string;
  symbol?: string;
  action: RecommendationAction;
  buyRange: { low: number; high: number; currency: string } | null;
  sellRange: { low: number; high: number; currency: string } | null;
  quantity: number;
  currentPrice: number | null;
  significantDrop: boolean;
  summary: string;
  /** Intraday / price-structure reasons (technical). */
  dropReasons: string[];
  /** News / business / valuation points grounded in research tools. */
  fundamentalReasons: string[];
  ai: boolean;
};

export type DegiroFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    credentials?: RequestCredentials;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;
