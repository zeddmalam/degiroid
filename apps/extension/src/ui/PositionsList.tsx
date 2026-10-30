import { useState } from "react";
import {
  STOP_LOSS_OFFSET,
  formatMoney,
  formatPrice,
  stopLossPriceFromCurrent,
  unrealizedPnl,
} from "@/shared/degiro";
import type { DegiroPosition, DegiroSessionSnapshot } from "@/shared/degiro";
import type { ExtensionMessage, ExtensionResponse } from "@/shared/messaging";
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

function canPlaceStopLoss(position: DegiroPosition): boolean {
  return (
    position.price != null &&
    position.price > STOP_LOSS_OFFSET &&
    position.size != null &&
    position.size !== 0 &&
    stopLossPriceFromCurrent(position.price) > 0
  );
}

async function requestPlaceStopLoss(
  position: DegiroPosition,
): Promise<ExtensionResponse> {
  if (position.price == null || position.size == null) {
    return { ok: false, error: "Missing price or size for this position" };
  }
  const stopPrice = stopLossPriceFromCurrent(position.price);
  const message = {
    type: "DEGIROID_PLACE_STOP_LOSS",
    productId: position.id,
    size: Math.abs(position.size),
    stopPrice,
    buySell: position.size < 0 ? "BUY" : "SELL",
  } satisfies ExtensionMessage;

  const response = (await chrome.runtime.sendMessage(
    message,
  )) as ExtensionResponse | undefined;

  if (!response) {
    return { ok: false, error: "No response from extension" };
  }
  return response;
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
  const stopClass =
    variant === "panel" ? "degiroid-stop-button" : "stop-button";
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    <>
      {actionError ? (
        <p
          className={
            variant === "panel" ? "degiroid-action-error" : "action-error"
          }
        >
          {actionError}
        </p>
      ) : null}
      <ul id={listId}>
        {positions.map((position) => {
          const { absolute, pct, tone } = unrealizedPnl(position);
          const key = String(position.id);
          const enabled = canPlaceStopLoss(position) && pendingId == null;
          const stopPrice =
            position.price != null
              ? stopLossPriceFromCurrent(position.price)
              : null;
          const title =
            stopPrice != null
              ? `Place GTC stop loss at ${formatPrice(stopPrice)} (current − 0.50)`
              : "Place GTC stop loss";

          return (
            <li key={key} data-tone={tone}>
              <div className={mainClass}>
                <button
                  type="button"
                  className={stopClass}
                  disabled={!enabled}
                  title={title}
                  aria-label={`Stop loss for ${positionLabel(position)}`}
                  onClick={() => {
                    setActionError(null);
                    setPendingId(key);
                    void requestPlaceStopLoss(position)
                      .then((response) => {
                        if (!response.ok) {
                          setActionError(response.error);
                        }
                      })
                      .catch((error: unknown) => {
                        setActionError(
                          error instanceof Error
                            ? error.message
                            : "Failed to place stop-loss",
                        );
                      })
                      .finally(() => {
                        setPendingId(null);
                      });
                  }}
                >
                  {pendingId === key ? "…" : "SL"}
                </button>
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
    </>
  );
}
