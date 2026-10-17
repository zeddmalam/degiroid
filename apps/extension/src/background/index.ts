import {
  DEGIRO_TRADER_MATCH,
  DEGIRO_TRADER_ORIGIN,
  emptySnapshot,
  isTraderHost,
} from "@/shared/degiro";
import {
  STORAGE_KEY,
  type ExtensionMessage,
  type ExtensionResponse,
  isExtensionMessage,
} from "@/shared/messaging";
import type { DegiroSessionSnapshot } from "@/shared/degiro";

const SYNC_ALARM = "degiroid.sync";

async function readSnapshot(): Promise<DegiroSessionSnapshot> {
  const stored = await chrome.storage.session.get(STORAGE_KEY);
  const snapshot = stored[STORAGE_KEY] as DegiroSessionSnapshot | undefined;
  return snapshot ?? emptySnapshot();
}

async function writeSnapshot(snapshot: DegiroSessionSnapshot): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY]: snapshot });
  await chrome.runtime.sendMessage({
    type: "DEGIROID_SNAPSHOT_UPDATED",
    snapshot,
  } satisfies ExtensionMessage).catch(() => {
    /* popup may be closed */
  });
}

async function askActiveDegiroTabToSync(): Promise<DegiroSessionSnapshot> {
  const tabs = await chrome.tabs.query({ url: [DEGIRO_TRADER_MATCH] });

  const traderTab =
    tabs.find((tab) => tab.url && !tab.url.includes("/login")) ?? tabs[0];

  if (!traderTab?.id) {
    const snapshot = emptySnapshot("", "unknown");
    snapshot.error = `Open ${DEGIRO_TRADER_ORIGIN} in a tab to sync.`;
    await writeSnapshot(snapshot);
    return snapshot;
  }

  try {
    const response = (await chrome.tabs.sendMessage(traderTab.id, {
      type: "DEGIROID_SYNC_NOW",
    } satisfies ExtensionMessage)) as ExtensionResponse;

    if (!response?.ok) {
      const snapshot = emptySnapshot(traderTab.url ?? "", "trader");
      snapshot.error = response?.error ?? "Content script did not respond.";
      await writeSnapshot(snapshot);
      return snapshot;
    }

    await writeSnapshot(response.snapshot);
    return response.snapshot;
  } catch {
    const snapshot = emptySnapshot(traderTab.url ?? "", "trader");
    snapshot.error =
      "Degiroid is not injected yet. Refresh the DEGIRO trader tab.";
    await writeSnapshot(snapshot);
    return snapshot;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
  await writeSnapshot(emptySnapshot());
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM) {
    void askActiveDegiroTabToSync();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  try {
    const { hostname } = new URL(tab.url);
    if (!isTraderHost(hostname)) return;
    void chrome.tabs
      .sendMessage(tabId, { type: "DEGIROID_SYNC_NOW" } satisfies ExtensionMessage)
      .catch(() => undefined);
  } catch {
    /* ignore invalid urls */
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) return false;

  const respond = async (): Promise<ExtensionResponse> => {
    switch (message.type) {
      case "DEGIROID_GET_SNAPSHOT":
        return { ok: true, snapshot: await readSnapshot() };
      case "DEGIROID_SYNC_NOW":
        return { ok: true, snapshot: await askActiveDegiroTabToSync() };
      case "DEGIROID_CONTENT_READY":
        // Content script already syncs with the page and pushes SNAPSHOT_UPDATED.
        // Do not kick off a racing second sync here.
        return { ok: true, snapshot: await readSnapshot() };
      case "DEGIROID_OPEN_TRADER":
        await chrome.tabs.create({ url: `${DEGIRO_TRADER_ORIGIN}/` });
        return { ok: true, snapshot: await readSnapshot() };
      case "DEGIROID_SNAPSHOT_UPDATED":
        await writeSnapshot(message.snapshot);
        return { ok: true, snapshot: message.snapshot };
      default:
        return { ok: false, error: "Unknown message" };
    }
  };

  void respond().then(sendResponse);
  return true;
});
