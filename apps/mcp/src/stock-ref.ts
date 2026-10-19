export type StockRef = {
  productId?: string;
  name?: string;
  ticker?: string;
  query?: string;
};

export type LookupProduct = {
  id: string;
  name: string;
  symbol?: string;
};

export function hasStockIdentifier(ref: StockRef): boolean {
  return Boolean(
    ref.productId?.trim() ||
      ref.name?.trim() ||
      ref.ticker?.trim() ||
      ref.query?.trim(),
  );
}

/** Prefer ticker for DEGIRO searchText; fall back to name, then free-text query. */
export function searchTextFromRef(ref: StockRef): string {
  const ticker = ref.ticker?.trim();
  const name = ref.name?.trim();
  const query = ref.query?.trim();
  if (ticker) return ticker;
  if (name) return name;
  if (query) return query;
  throw new Error("Provide name, ticker, or query");
}

export function pickLookupMatch(
  products: LookupProduct[],
  ref: Pick<StockRef, "name" | "ticker">,
): LookupProduct | undefined {
  if (products.length === 0) return undefined;

  const ticker = ref.ticker?.trim().toUpperCase();
  const name = ref.name?.trim().toLowerCase();

  if (ticker) {
    const exactSymbol = products.find(
      (p) => p.symbol?.toUpperCase() === ticker,
    );
    if (exactSymbol) {
      if (!name) return exactSymbol;
      if (exactSymbol.name.toLowerCase().includes(name)) return exactSymbol;
      const named = products.find(
        (p) =>
          p.symbol?.toUpperCase() === ticker &&
          p.name.toLowerCase().includes(name),
      );
      if (named) return named;
      return exactSymbol;
    }
  }

  if (name) {
    const byName = products.find((p) => p.name.toLowerCase().includes(name));
    if (byName) return byName;
  }

  return products[0];
}
