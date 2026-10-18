import { formatMoney } from "@/shared/degiro";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import type { UiVariant } from "./types";

type MetricsProps = {
  snapshot: DegiroSessionSnapshot;
  variant: UiVariant;
};

export function Metrics({ snapshot, variant }: MetricsProps) {
  const currency = snapshot.client?.currency ?? "EUR";
  const id = variant === "panel" ? "degiroid-metrics" : "metrics";

  return (
    <div id={id}>
      <article>
        <span>Portfolio</span>
        <strong>{formatMoney(snapshot.portfolioValue, currency)}</strong>
      </article>
      {variant === "popup" ? (
        <article>
          <span>Cash</span>
          <strong>{formatMoney(snapshot.cashValue, currency)}</strong>
        </article>
      ) : null}
      <article>
        <span>Orders</span>
        <strong>{snapshot.orders.length}</strong>
      </article>
    </div>
  );
}
