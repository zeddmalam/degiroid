import {
  deltaTone,
  detectPageKind,
  formatDelta,
  formatMoney,
  formatPrice,
  sessionStatusLabel,
  syncDegiroSession,
} from "@/shared/degiro";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import { isExtensionMessage } from "@/shared/messaging";
import type { ExtensionMessage, ExtensionResponse } from "@/shared/messaging";

const ROOT_ID = "degiroid-root";

let lastSnapshot: DegiroSessionSnapshot | null = null;
let inflightSync: Promise<DegiroSessionSnapshot> | null = null;
let spaSyncTimer: number | null = null;

function ensurePanel(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <aside id="degiroid-panel" data-collapsed="false" aria-label="Degiroid DEGIRO companion">
      <header>
        <h1>Degiroid</h1>
        <button type="button" id="degiroid-toggle" aria-label="Collapse Degiroid panel">Hide</button>
      </header>
      <div id="degiroid-status">
        <span id="degiroid-status-dot" data-state="pending"></span>
        <span id="degiroid-status-text">Syncing with this page…</span>
      </div>
      <div id="degiroid-body"></div>
      <footer>Bound to https://trader.degiro.nl</footer>
    </aside>
  `;
  document.documentElement.appendChild(root);

  root.querySelector("#degiroid-toggle")?.addEventListener("click", () => {
    const panel = root?.querySelector("#degiroid-panel");
    if (!(panel instanceof HTMLElement)) return;
    const collapsed = panel.dataset.collapsed === "true";
    panel.dataset.collapsed = collapsed ? "false" : "true";
    const toggle = root?.querySelector("#degiroid-toggle");
    if (toggle) toggle.textContent = collapsed ? "Hide" : "Show";
    const body = root?.querySelector("#degiroid-body");
    const status = root?.querySelector("#degiroid-status");
    const footer = root?.querySelector("footer");
    if (body instanceof HTMLElement) body.hidden = !collapsed;
    if (status instanceof HTMLElement) status.hidden = !collapsed;
    if (footer instanceof HTMLElement) footer.hidden = !collapsed;
  });

  return root;
}

function renderSnapshot(snapshot: DegiroSessionSnapshot): void {
  const root = ensurePanel();
  const pageKind = snapshot.pageKind || detectPageKind(location.href);

  if (pageKind === "unknown") {
    root.remove();
    return;
  }

  const dot = root.querySelector("#degiroid-status-dot");
  const statusText = root.querySelector("#degiroid-status-text");
  const body = root.querySelector("#degiroid-body");
  if (!(dot instanceof HTMLElement) || !statusText || !body) return;

  if (snapshot.connected) {
    dot.dataset.state = "connected";
  } else if (pageKind === "login") {
    dot.dataset.state = "error";
  } else {
    dot.dataset.state = "pending";
  }
  statusText.textContent = sessionStatusLabel(snapshot);

  if (!snapshot.connected) {
    body.innerHTML = `<p id="degiroid-error">${escapeHtml(
      snapshot.error ?? "Syncing with the DEGIRO trader page…",
    )}</p>`;
    return;
  }

  const currency = snapshot.client?.currency ?? "EUR";
  const orders = snapshot.orders;
  const orderItems =
    orders.length > 0
      ? orders
          .map((order) => {
            const label =
              order.productName ??
              (order.productId != null
                ? `Product ${order.productId}`
                : "Order");
            const tone = deltaTone(order.side, order.priceDelta);
            return `<li data-tone="${tone}">
              <div class="degiroid-order-main">
                <span class="degiroid-order-side">${escapeHtml(order.side)}</span>
                <span class="degiroid-order-name">${escapeHtml(label)}</span>
              </div>
              <div class="degiroid-order-meta">
                <span>${escapeHtml(formatPrice(order.marketPrice))} → ${escapeHtml(formatPrice(order.orderPrice))}</span>
                <strong>${escapeHtml(formatDelta(order.priceDelta, order.priceDeltaPct))}</strong>
              </div>
            </li>`;
          })
          .join("")
      : `<p id="degiroid-empty">No outstanding orders.</p>`;

  const warning = snapshot.error
    ? `<p id="degiroid-error">${escapeHtml(snapshot.error)}</p>`
    : "";

  body.innerHTML = `
    <div id="degiroid-metrics">
      <article>
        <span>Portfolio</span>
        <strong>${escapeHtml(formatMoney(snapshot.portfolioValue, currency))}</strong>
      </article>
      <article>
        <span>Orders</span>
        <strong>${orders.length}</strong>
      </article>
    </div>
    ${warning}
    <p id="degiroid-section-label">Outstanding orders · Δ market − order</p>
    <ul id="degiroid-orders">${orderItems}</ul>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function runSync(): Promise<DegiroSessionSnapshot> {
  if (inflightSync) return inflightSync;

  inflightSync = (async () => {
    if (!lastSnapshot?.connected) {
      renderSnapshot({
        connected: false,
        pageKind: detectPageKind(location.href),
        url: location.href,
        client: null,
        positions: [],
        orders: [],
        cashValue: null,
        portfolioValue: null,
        lastSyncedAt: null,
        error: "Waiting for the DEGIRO trader session on this page…",
      });
    }

    const snapshot = await syncDegiroSession(location.href);
    lastSnapshot = snapshot;
    renderSnapshot(snapshot);

    await chrome.runtime.sendMessage({
      type: "DEGIROID_SNAPSHOT_UPDATED",
      snapshot,
    } satisfies ExtensionMessage);

    return snapshot;
  })().finally(() => {
    inflightSync = null;
  });

  return inflightSync;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) return false;

  if (message.type === "DEGIROID_SYNC_NOW" || message.type === "DEGIROID_GET_SNAPSHOT") {
    void runSync()
      .then((snapshot) => {
        const response: ExtensionResponse = { ok: true, snapshot };
        sendResponse(response);
      })
      .catch((error: unknown) => {
        const response: ExtensionResponse = {
          ok: false,
          error: error instanceof Error ? error.message : "Sync failed",
        };
        sendResponse(response);
      });
    return true;
  }

  return false;
});

ensurePanel();
void runSync();
void chrome.runtime.sendMessage({
  type: "DEGIROID_CONTENT_READY",
  url: location.href,
} satisfies ExtensionMessage);

function onSpaNavigation(): void {
  if (spaSyncTimer != null) window.clearTimeout(spaSyncTimer);
  spaSyncTimer = window.setTimeout(() => {
    spaSyncTimer = null;
    void runSync();
  }, 750);
}

const pushState = history.pushState.bind(history);
history.pushState = (...args) => {
  pushState(...args);
  onSpaNavigation();
};

const replaceState = history.replaceState.bind(history);
history.replaceState = (...args) => {
  replaceState(...args);
  onSpaNavigation();
};

window.addEventListener("popstate", onSpaNavigation);

setInterval(() => {
  void runSync();
}, 60_000);
