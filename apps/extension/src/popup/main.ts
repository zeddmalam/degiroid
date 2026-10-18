import {
  deltaTone,
  formatChangePct,
  formatDelta,
  formatMoney,
  formatPrice,
  sessionStatusLabel,
} from "@/shared/degiro";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import { isExtensionMessage } from "@/shared/messaging";
import type { ExtensionMessage, ExtensionResponse } from "@/shared/messaging";

const badge = document.querySelector("#badge");
const status = document.querySelector("#status");
const metrics = document.querySelector("#metrics");
const portfolioValue = document.querySelector("#portfolio-value");
const cashValue = document.querySelector("#cash-value");
const orderCount = document.querySelector("#order-count");
const losers = document.querySelector("#losers");
const orders = document.querySelector("#orders");
const syncBtn = document.querySelector("#sync-btn");
const openTraderBtn = document.querySelector("#open-trader-btn");

function renderLosers(snapshot: DegiroSessionSnapshot): void {
  if (!(losers instanceof HTMLElement)) return;

  const rows = snapshot.indexLosers ?? [];
  if (!snapshot.connected) {
    losers.innerHTML = "";
    return;
  }

  if (rows.length === 0) {
    losers.innerHTML = `<tr><td colspan="4" class="empty">No German index losers yet.</td></tr>`;
    return;
  }

  losers.innerHTML = rows
    .map((row, i) => {
      const label = row.symbol ? `${row.symbol} · ${row.name}` : row.name;
      const indexes = row.indexes.join(" · ");
      return `<tr data-tone="negative">
        <td class="loser-rank">${i + 1}</td>
        <td class="loser-name">
          <span>${label}</span>
          ${indexes ? `<small>${indexes}</small>` : ""}
        </td>
        <td class="loser-price">${formatPrice(row.lastPrice)}</td>
        <td class="loser-change">${formatChangePct(row.changePct)}</td>
      </tr>`;
    })
    .join("");
}

function render(snapshot: DegiroSessionSnapshot): void {
  if (
    !(badge instanceof HTMLElement) ||
    !(status instanceof HTMLElement) ||
    !(metrics instanceof HTMLElement)
  ) {
    return;
  }

  status.textContent = sessionStatusLabel(snapshot);

  if (snapshot.connected) {
    badge.dataset.state = "connected";
    badge.textContent = "Connected";
  } else if (snapshot.pageKind === "trader") {
    badge.dataset.state = "pending";
    badge.textContent = "Syncing";
  } else {
    badge.dataset.state = "error";
    badge.textContent = "Offline";
  }

  const currency = snapshot.client?.currency ?? "EUR";
  if (portfolioValue) {
    portfolioValue.textContent = formatMoney(snapshot.portfolioValue, currency);
  }
  if (cashValue) {
    cashValue.textContent = formatMoney(snapshot.cashValue, currency);
  }
  if (orderCount) {
    orderCount.textContent = String(snapshot.orders.length);
  }

  metrics.hidden = !snapshot.connected;
  renderLosers(snapshot);

  if (orders) {
    if (snapshot.orders.length === 0) {
      orders.innerHTML = snapshot.connected
        ? `<li class="empty">No outstanding orders.</li>`
        : "";
    } else {
      orders.innerHTML = snapshot.orders
        .map((order) => {
          const label =
            order.productName ??
            (order.productId != null
              ? `Product ${order.productId}`
              : "Order");
          const tone = deltaTone(order.side, order.priceDelta);
          return `<li data-tone="${tone}">
            <div class="order-main">
              <span class="order-side">${order.side}</span>
              <span class="order-name">${label}</span>
            </div>
            <div class="order-meta">
              <span>${formatPrice(order.marketPrice)} → ${formatPrice(order.orderPrice)}</span>
              <strong>${formatDelta(order.priceDelta, order.priceDeltaPct)}</strong>
            </div>
          </li>`;
        })
        .join("");
    }
  }
}

async function request(
  message: ExtensionMessage,
): Promise<DegiroSessionSnapshot | null> {
  const response = (await chrome.runtime.sendMessage(
    message,
  )) as ExtensionResponse | undefined;
  if (!response?.ok) {
    render({
      connected: false,
      pageKind: "unknown",
      url: "",
      client: null,
      positions: [],
      orders: [],
      indexLosers: [],
      cashValue: null,
      portfolioValue: null,
      lastSyncedAt: null,
      error: response?.error ?? "No response from extension background.",
    });
    return null;
  }
  render(response.snapshot);
  return response.snapshot;
}

syncBtn?.addEventListener("click", () => {
  void request({ type: "DEGIROID_SYNC_NOW" });
});

openTraderBtn?.addEventListener("click", () => {
  void request({ type: "DEGIROID_OPEN_TRADER" });
});

chrome.runtime.onMessage.addListener((message) => {
  if (!isExtensionMessage(message)) return;
  if (message.type === "DEGIROID_SNAPSHOT_UPDATED") {
    render(message.snapshot);
  }
});

void request({ type: "DEGIROID_GET_SNAPSHOT" });
void request({ type: "DEGIROID_SYNC_NOW" });
