/** Canonical DEGIRO web trader URL. */
export const DEGIRO_TRADER_ORIGIN = "https://trader.degiro.nl";
export const DEGIRO_TRADER_HOST = "trader.degiro.nl";
export const DEGIRO_TRADER_MATCH = `${DEGIRO_TRADER_ORIGIN}/*`;

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

export type DegiroSessionSnapshot = {
  connected: boolean;
  pageKind: DegiroPageKind;
  url: string;
  client: DegiroClientInfo | null;
  positions: DegiroPosition[];
  cashValue: number | null;
  portfolioValue: number | null;
  lastSyncedAt: number | null;
  error: string | null;
};

export const emptySnapshot = (
  url = "",
  pageKind: DegiroPageKind = "unknown",
): DegiroSessionSnapshot => ({
  connected: false,
  pageKind,
  url,
  client: null,
  positions: [],
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

type PortfolioRow = {
  id?: number | string;
  positionType?: string;
  size?: number;
  price?: number;
  value?: number;
  breakEvenPrice?: number;
  name?: string;
  product?: string;
};

type UpdateApiResponse = {
  portfolio?: {
    value?: PortfolioRow[];
  };
};

/**
 * Calls DEGIRO's same-origin trader APIs using the user's existing browser
 * session cookies. Must run in a content script on trader.degiro.nl.
 */
export async function fetchDegiroClient(): Promise<DegiroClientInfo | null> {
  const response = await fetch(`${DEGIRO_TRADER_ORIGIN}/pa/secure/client`, {
    credentials: "include",
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

export async function fetchDegiroPortfolio(
  intAccount: number,
): Promise<{ positions: DegiroPosition[]; cashValue: number | null; portfolioValue: number | null }> {
  const url = new URL(
    `${DEGIRO_TRADER_ORIGIN}/trading/secure/v5/update/${intAccount}`,
  );
  url.searchParams.set("portfolio", "0");
  url.searchParams.set("totalPortfolio", "0");

  const response = await fetch(url.toString(), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`DEGIRO portfolio request failed (${response.status})`);
  }

  const json = (await response.json()) as UpdateApiResponse;
  const rows = json.portfolio?.value ?? [];

  const positions: DegiroPosition[] = [];
  let cashValue: number | null = null;
  let portfolioValue = 0;

  for (const row of rows) {
    const value = typeof row.value === "number" ? row.value : 0;
    if (row.positionType === "CASH") {
      cashValue = (cashValue ?? 0) + value;
      continue;
    }

    portfolioValue += value;
    positions.push({
      id: row.id ?? positions.length,
      positionType: row.positionType,
      size: row.size,
      price: row.price,
      value: row.value,
      breakEvenPrice: row.breakEvenPrice,
      productName: row.name ?? row.product,
    });
  }

  return {
    positions,
    cashValue,
    portfolioValue: positions.length > 0 || cashValue !== null ? portfolioValue : null,
  };
}

export async function syncDegiroSession(
  pageUrl: string,
): Promise<DegiroSessionSnapshot> {
  const pageKind = detectPageKind(pageUrl);
  const base = emptySnapshot(pageUrl, pageKind);

  if (pageKind === "login") {
    return { ...base, error: "Log in to DEGIRO to activate Degiroid." };
  }

  if (pageKind !== "trader") {
    return {
      ...base,
      error: `Open ${DEGIRO_TRADER_ORIGIN} to sync your session.`,
    };
  }

  try {
    const client = await fetchDegiroClient();
    if (!client?.intAccount) {
      return {
        ...base,
        connected: false,
        error: "No active DEGIRO session. Please log in.",
      };
    }

    const portfolio = await fetchDegiroPortfolio(client.intAccount);

    return {
      connected: true,
      pageKind,
      url: pageUrl,
      client,
      positions: portfolio.positions,
      cashValue: portfolio.cashValue,
      portfolioValue: portfolio.portfolioValue,
      lastSyncedAt: Date.now(),
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "Failed to sync DEGIRO.",
    };
  }
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
