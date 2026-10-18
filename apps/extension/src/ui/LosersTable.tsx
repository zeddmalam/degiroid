import { formatChangePct, formatPrice } from "@/shared/degiro";
import type { DegiroIndexLoser, DegiroSessionSnapshot } from "@/shared/degiro";
import type { UiVariant } from "./types";

type LosersTableProps = {
  snapshot: DegiroSessionSnapshot;
  variant: UiVariant;
};

function loserLabel(row: DegiroIndexLoser): string {
  return row.symbol ? `${row.symbol} · ${row.name}` : row.name;
}

export function LosersTable({ snapshot, variant }: LosersTableProps) {
  const rows = snapshot.indexLosers ?? [];
  const tableId = variant === "panel" ? "degiroid-losers" : "losers-table";
  const rankClass =
    variant === "panel" ? "degiroid-loser-rank" : "loser-rank";
  const nameClass =
    variant === "panel" ? "degiroid-loser-name" : "loser-name";
  const priceClass =
    variant === "panel" ? "degiroid-loser-price" : "loser-price";
  const changeClass =
    variant === "panel" ? "degiroid-loser-change" : "loser-change";
  const emptyId = variant === "panel" ? "degiroid-empty" : undefined;

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
    <table id={tableId}>
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Last</th>
          <th>Day %</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={4}
              className={variant === "popup" ? "empty" : undefined}
              id={emptyId}
            >
              No German index losers yet.
            </td>
          </tr>
        ) : (
          rows.map((row, i) => {
            const indexes = row.indexes.join(" · ");
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
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
