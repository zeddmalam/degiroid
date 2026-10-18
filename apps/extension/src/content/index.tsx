import { createRoot, type Root } from "react-dom/client";
import {
  detectPageKind,
  syncDegiroSession,
} from "@/shared/degiro";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import { startJobWorker } from "@/shared/job-worker";
import { isExtensionMessage } from "@/shared/messaging";
import type { ExtensionMessage, ExtensionResponse } from "@/shared/messaging";
import { Panel } from "./Panel";
import "./panel.css";

const ROOT_ID = "degiroid-root";

let lastSnapshot: DegiroSessionSnapshot | null = null;
let inflightSync: Promise<DegiroSessionSnapshot> | null = null;
let spaSyncTimer: number | null = null;
let reactRoot: Root | null = null;

function ensureHost(): HTMLElement {
  let host = document.getElementById(ROOT_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = ROOT_ID;
  document.documentElement.appendChild(host);
  return host;
}

function unmountPanel(): void {
  reactRoot?.unmount();
  reactRoot = null;
  document.getElementById(ROOT_ID)?.remove();
}

function renderSnapshot(snapshot: DegiroSessionSnapshot): void {
  const pageKind = snapshot.pageKind || detectPageKind(location.href);

  if (pageKind === "unknown") {
    unmountPanel();
    return;
  }

  const host = ensureHost();
  if (!reactRoot) {
    reactRoot = createRoot(host);
  }
  reactRoot.render(<Panel snapshot={snapshot} />);
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
        indexLosers: [],
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

  if (
    message.type === "DEGIROID_SYNC_NOW" ||
    message.type === "DEGIROID_GET_SNAPSHOT"
  ) {
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

renderSnapshot({
  connected: false,
  pageKind: detectPageKind(location.href),
  url: location.href,
  client: null,
  positions: [],
  orders: [],
  indexLosers: [],
  cashValue: null,
  portfolioValue: null,
  lastSyncedAt: null,
  error: "Syncing with this page…",
});
void runSync();
startJobWorker();
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
