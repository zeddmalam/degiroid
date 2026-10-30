import type {
  DegiroOrderSide,
  DegiroPosition,
  DegiroSessionSnapshot,
} from "./types.js";
import { DEGIRO_TRADER_ORIGIN } from "./urls.js";

/** Unrealized P/L vs break-even: (price − BEP) × size. */
export function unrealizedPnl(position: DegiroPosition): {
  absolute: number | null;
  pct: number | null;
  tone: "positive" | "negative" | "neutral";
} {
  const { price, breakEvenPrice, size } = position;
  if (
    price == null ||
    breakEvenPrice == null ||
    size == null ||
    breakEvenPrice === 0
  ) {
    return { absolute: null, pct: null, tone: "neutral" };
  }

  const absolute = (price - breakEvenPrice) * size;
  const pct = (price - breakEvenPrice) / breakEvenPrice;
  const tone =
    absolute > 0 ? "positive" : absolute < 0 ? "negative" : "neutral";
  return { absolute, pct, tone };
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
  if (side === "BUY") return delta < 0 ? "positive" : "negative";
  return delta > 0 ? "positive" : "negative";
}

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
