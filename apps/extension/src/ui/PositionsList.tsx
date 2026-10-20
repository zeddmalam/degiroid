import { formatMoney } from "@/shared/degiro";
import type { DegiroPosition, DegiroSessionSnapshot } from "@/shared/degiro";
import type { UiVariant } from "./types";

type PositionsListProps = {
  snapshot: DegiroSessionSnapshot;
  variant: UiVariant;
};

function positionLabel(position: DegiroPosition): string {
  return (
    position.productName ??
    (position.id != null ? `Product ${position.id}` : "Position")
  );
}

function positionPnl(position: DegiroPosition): {
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

function formatPnl(
  absolute: number | null,
  pct: number | null,
  currency: string,
): string {
  if (absolute == null) return "—";
  const money = formatMoney(absolute, currency);
  if (pct == null) return money;
  const pctLabel = new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(pct);
  return `${money} (${pctLabel})`;
}

export function PositionsList({ snapshot, variant }: PositionsListProps) {
  const currency = snapshot.client?.currency ?? "EUR";
  const positions = snapshot.positions
    .filter((position) => position.size == null || position.size !== 0)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  const listId = variant === "panel" ? "degiroid-positions" : "positions";
  const mainClass =
    variant === "panel" ? "degiroid-position-main" : "position-main";
  const labelClass =
    variant === "panel" ? "degiroid-position-label" : "position-label";
  const sizeClass =
    variant === "panel" ? "degiroid-position-size" : "position-size";
  const nameClass =
    variant === "panel" ? "degiroid-position-name" : "position-name";

  if (positions.length === 0) {
    if (variant === "panel") {
      return <p id="degiroid-empty">No open positions.</p>;
    }
    if (!snapshot.connected) {
      return <ul id={listId} />;
    }
    return (
      <ul id={listId}>
        <li className="empty">No open positions.</li>
      </ul>
    );
  }

  return (
    <ul id={listId}>
      {positions.map((position) => {
        const { absolute, pct, tone } = positionPnl(position);
        return (
          <li key={String(position.id)} data-tone={tone}>
            <div className={mainClass}>
              <span className={labelClass}>
                <span className={nameClass}>{positionLabel(position)}</span>
                <span className={sizeClass}>
                  {position.size != null ? `x${position.size}` : "—"}
                </span>
              </span>
              <strong>{formatPnl(absolute, pct, currency)}</strong>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
