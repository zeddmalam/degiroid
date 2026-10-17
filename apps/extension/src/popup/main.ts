import { formatMoney } from "@/shared/degiro";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import { isExtensionMessage } from "@/shared/messaging";
import type { ExtensionMessage, ExtensionResponse } from "@/shared/messaging";

const badge = document.querySelector("#badge");
const status = document.querySelector("#status");
const metrics = document.querySelector("#metrics");
const portfolioValue = document.querySelector("#portfolio-value");
const cashValue = document.querySelector("#cash-value");
const positionCount = document.querySelector("#position-count");
const positions = document.querySelector("#positions");
const syncBtn = document.querySelector("#sync-btn");
const openTraderBtn = document.querySelector("#open-trader-btn");

function render(snapshot: DegiroSessionSnapshot): void {
  if (
    !(badge instanceof HTMLElement) ||
    !(status instanceof HTMLElement) ||
    !(metrics instanceof HTMLElement)
  ) {
    return;
  }

  if (snapshot.connected) {
    badge.dataset.state = "connected";
    badge.textContent = "Connected";
    status.textContent = snapshot.client?.displayName
      ? `Signed in as ${snapshot.client.displayName}`
      : "Linked to your DEGIRO trader session";
  } else {
    badge.dataset.state = "error";
    badge.textContent = "Offline";
    status.textContent =
      snapshot.error ??
      "Open https://trader.degiro.nl and log in to connect.";
  }

  const currency = snapshot.client?.currency ?? "EUR";
  if (portfolioValue) {
    portfolioValue.textContent = formatMoney(snapshot.portfolioValue, currency);
  }
  if (cashValue) {
    cashValue.textContent = formatMoney(snapshot.cashValue, currency);
  }
  if (positionCount) {
    positionCount.textContent = String(snapshot.positions.length);
  }

  metrics.hidden = !snapshot.connected;

  if (positions) {
    positions.innerHTML = snapshot.positions
      .slice(0, 10)
      .map((position) => {
        const label =
          position.productName ??
          (position.id != null ? `Product ${position.id}` : "Position");
        return `<li><span>${label}</span><strong>${formatMoney(
          position.value,
          currency,
        )}</strong></li>`;
      })
      .join("");
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
