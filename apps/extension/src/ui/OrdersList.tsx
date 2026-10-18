import {
  deltaTone,
  formatDelta,
  formatPrice,
} from "@/shared/degiro";
import type { DegiroOrder, DegiroSessionSnapshot } from "@/shared/degiro";
import type { UiVariant } from "./types";

type OrdersListProps = {
  snapshot: DegiroSessionSnapshot;
  variant: UiVariant;
};

function orderLabel(order: DegiroOrder): string {
  return (
    order.productName ??
    (order.productId != null ? `Product ${order.productId}` : "Order")
  );
}

export function OrdersList({ snapshot, variant }: OrdersListProps) {
  const orders = snapshot.orders;
  const listId = variant === "panel" ? "degiroid-orders" : "orders";
  const mainClass =
    variant === "panel" ? "degiroid-order-main" : "order-main";
  const sideClass =
    variant === "panel" ? "degiroid-order-side" : "order-side";
  const nameClass =
    variant === "panel" ? "degiroid-order-name" : "order-name";
  const metaClass =
    variant === "panel" ? "degiroid-order-meta" : "order-meta";

  if (orders.length === 0) {
    if (variant === "panel") {
      return <p id="degiroid-empty">No outstanding orders.</p>;
    }
    if (!snapshot.connected) {
      return <ul id={listId} />;
    }
    return (
      <ul id={listId}>
        <li className="empty">No outstanding orders.</li>
      </ul>
    );
  }

  return (
    <ul id={listId}>
      {orders.map((order) => {
        const tone = deltaTone(order.side, order.priceDelta);
        return (
          <li key={order.id} data-tone={tone}>
            <div className={mainClass}>
              <span className={sideClass}>{order.side}</span>
              <span className={nameClass}>{orderLabel(order)}</span>
            </div>
            <div className={metaClass}>
              <span>
                {formatPrice(order.marketPrice)} →{" "}
                {formatPrice(order.orderPrice)}
              </span>
              <strong>
                {formatDelta(order.priceDelta, order.priceDeltaPct)}
              </strong>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
