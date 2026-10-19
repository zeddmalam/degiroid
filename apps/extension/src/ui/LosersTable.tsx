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

export function LosersTable({ snapshot, variant }: LosersTableProps) {
  const rows = snapshot.indexLosers ?? [];
  const {
    byProductId,
    loading,
    error,
    ai,
    requested,
    canRequest,
    requestRecommendations,
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
  const showRecColumn = requested || loading;

  if (variant === "popup" && !snapshot.connected) {
    return (
      <table id={tableId}>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Last</th>
            <th>Day %</th>
          </tr>
        </thead>
        <tbody />
      </table>
    );
  }

  return (
    <div className={variant === "panel" ? "degiroid-losers-wrap" : "losers-wrap"}>
      <div className={toolbarClass}>
        <button
          type="button"
          className={buttonClass}
          disabled={!canRequest}
          onClick={requestRecommendations}
        >
          {loading ? "Analyzing…" : "Get recommendations"}
        </button>
        {error ? <p className={statusClass}>{error}</p> : null}
        {requested && !loading && !error ? (
          <p className={statusClass}>
            {ai ? "AI recommendations" : "Structured recommendations"} · not
            financial advice
          </p>
        ) : null}
      </div>
      <table id={tableId}>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Last</th>
            <th>Day %</th>
            {showRecColumn ? <th>Rec</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={showRecColumn ? 5 : 4}
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
                  {showRecColumn ? (
                    <td
                      className={recClass}
                      data-action={rec?.action ?? "pending"}
                    >
                      {line ?? (loading ? "…" : "—")}
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
