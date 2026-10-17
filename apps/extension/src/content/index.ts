import {
  detectPageKind,
  formatMoney,
  syncDegiroSession,
} from "@/shared/degiro";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import { isExtensionMessage } from "@/shared/messaging";
import type { ExtensionMessage, ExtensionResponse } from "@/shared/messaging";

const ROOT_ID = "degiroid-root";

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
        <span id="degiroid-status-text">Connecting to DEGIRO…</span>
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
    statusText.textContent = snapshot.client?.displayName
      ? `Signed in as ${snapshot.client.displayName}`
      : "Connected to DEGIRO trader";
  } else if (snapshot.error) {
    dot.dataset.state = "error";
    statusText.textContent = "Not connected";
  } else {
    dot.dataset.state = "pending";
    statusText.textContent = "Waiting for DEGIRO session…";
  }

  if (snapshot.error && !snapshot.connected) {
    body.innerHTML = `<p id="degiroid-error">${escapeHtml(snapshot.error)}</p>`;
    return;
  }

  const currency = snapshot.client?.currency ?? "EUR";
  const positions = snapshot.positions.slice(0, 8);
  const positionItems =
    positions.length > 0
      ? positions
          .map((position) => {
            const label =
              position.productName ??
              (position.id != null ? `Product ${position.id}` : "Position");
            return `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(
              formatMoney(position.value, currency),
            )}</strong></li>`;
          })
          .join("")
      : `<p id="degiroid-empty">No open product positions detected.</p>`;

  body.innerHTML = `
    <div id="degiroid-metrics">
      <article>
        <span>Portfolio</span>
        <strong>${escapeHtml(formatMoney(snapshot.portfolioValue, currency))}</strong>
      </article>
      <article>
        <span>Cash</span>
        <strong>${escapeHtml(formatMoney(snapshot.cashValue, currency))}</strong>
      </article>
    </div>
    <ul id="degiroid-positions">${positionItems}</ul>
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
  const snapshot = await syncDegiroSession(location.href);
  renderSnapshot(snapshot);

  await chrome.runtime.sendMessage({
    type: "DEGIROID_SNAPSHOT_UPDATED",
    snapshot,
  } satisfies ExtensionMessage);

  return snapshot;
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

// DEGIRO trader is an SPA — resync on history changes.
const pushState = history.pushState.bind(history);
history.pushState = (...args) => {
  pushState(...args);
  void runSync();
};
window.addEventListener("popstate", () => {
  void runSync();
});

setInterval(() => {
  void runSync();
}, 60_000);
