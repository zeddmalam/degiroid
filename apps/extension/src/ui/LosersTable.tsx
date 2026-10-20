import { formatChangePct, formatPrice } from "@/shared/degiro";
import type { DegiroIndexLoser, DegiroSessionSnapshot } from "@/shared/degiro";
import type { StockRecommendation } from "@/shared/api";
import type { UiVariant } from "./types";
import { useLoserRecommendations } from "./useLoserRecommendations";

type LosersTableProps = {
  snapshot: DegiroSessionSnapshot;
  variant: UiVariant;
};

function loserLabel(row: DegiroIndexLoser): string {
  return row.symbol ? `${row.symbol} · ${row.name}` : row.name;
}

function recLine(rec: StockRecommendation | undefined): string | null {
  if (!rec) return null;
  const buy =
    rec.buyRange != null
      ? `buy ${formatPrice(rec.buyRange.low)}–${formatPrice(rec.buyRange.high)} ${rec.buyRange.currency}`
      : null;
  const sell =
    rec.sellRange != null
      ? `sell ${formatPrice(rec.sellRange.low)}–${formatPrice(rec.sellRange.high)} ${rec.sellRange.currency}`
      : null;
  const qty = `qty ${rec.quantity}`;
  const parts = [rec.action.toUpperCase()];
  if (buy) parts.push(buy);
  if (sell) parts.push(sell);
  if (qty) parts.push(qty);
  if (rec.summary) parts.push(rec.summary);
  const fundamentals = (rec.fundamentalReasons ?? []).filter(Boolean);
  if (fundamentals.length > 0) {
    parts.push(`fundamentals: ${fundamentals.slice(0, 2).join("; ")}`);
  }
  return parts.join(" · ");
}

function SparklesIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  );
}

export function LosersTable({ snapshot, variant }: LosersTableProps) {
  const rows = snapshot.indexLosers ?? [];
  const {
    byProductId,
    loadingIds,
    error,
    ai,
    requested,
    canRequest,
    requestRecommendation,
  } = useLoserRecommendations(snapshot);
  const tableId = variant === "panel" ? "degiroid-losers" : "losers-table";
  const rankClass =
    variant === "panel" ? "degiroid-loser-rank" : "loser-rank";
  const nameClass =
    variant === "panel" ? "degiroid-loser-name" : "loser-name";
  const priceClass =
    variant === "panel" ? "degiroid-loser-price" : "loser-price";
  const changeClass =
    variant === "panel" ? "degiroid-loser-change" : "loser-change";
  const recClass =
    variant === "panel" ? "degiroid-loser-rec" : "loser-rec";
  const toolbarClass =
    variant === "panel" ? "degiroid-losers-toolbar" : "losers-toolbar";
  const statusClass =
    variant === "panel" ? "degiroid-rec-status" : "rec-status";
  const buttonClass =
    variant === "panel" ? "degiroid-rec-button" : "rec-button";
  const emptyId = variant === "panel" ? "degiroid-empty" : undefined;
  const showStatus = Boolean(error) || (requested && !error);

  if (variant === "popup" && !snapshot.connected) {
    return (
      <table id={tableId}>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Last</th>
            <th>Day %</th>
            <th>Rec</th>
          </tr>
        </thead>
        <tbody />
      </table>
    );
  }

  return (
    <div className={variant === "panel" ? "degiroid-losers-wrap" : "losers-wrap"}>
      {showStatus ? (
        <div className={toolbarClass}>
          {error ? <p className={statusClass}>{error}</p> : null}
          {requested && !error ? (
            <p className={statusClass}>
              {ai ? "AI recommendations" : "Structured recommendations"} · not
              financial advice
            </p>
          ) : null}
        </div>
      ) : null}
      <table id={tableId}>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Last</th>
            <th>Day %</th>
            <th>Rec</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className={variant === "popup" ? "empty" : undefined}
                id={emptyId}
              >
                No German index losers yet.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => {
              const indexes = row.indexes.join(" · ");
              const rec = byProductId.get(row.productId);
              const line = recLine(rec);
              const loading = loadingIds.has(row.productId);
              return (
                <tr key={row.productId} data-tone="negative">
                  <td className={rankClass}>{i + 1}</td>
                  <td className={nameClass}>
                    <span>{loserLabel(row)}</span>
                    {indexes ? <small>{indexes}</small> : null}
                  </td>
                  <td className={priceClass}>{formatPrice(row.lastPrice)}</td>
                  <td className={changeClass}>
                    {formatChangePct(row.changePct)}
                  </td>
                  <td
                    className={recClass}
                    data-action={rec?.action ?? (loading ? "pending" : undefined)}
                  >
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={!canRequest || loading}
                      onClick={() => requestRecommendation(row.productId)}
                      aria-label={`Get recommendation for ${loserLabel(row)}`}
                      title="Get recommendation"
                    >
                      {loading ? "…" : <SparklesIcon />}
                    </button>
                    {line ? <span className="rec-line">{line}</span> : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
