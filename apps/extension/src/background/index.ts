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

async function findTraderTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ url: [DEGIRO_TRADER_MATCH] });
  return (
    tabs.find((tab) => tab.url && !tab.url.includes("/login")) ?? tabs[0] ?? null
  );
}

async function askActiveDegiroTab(
  message: ExtensionMessage,
  options?: { wipeSnapshotOnError?: boolean },
): Promise<ExtensionResponse> {
  const wipeOnError = options?.wipeSnapshotOnError ?? false;
  const traderTab = await findTraderTab();

  if (!traderTab?.id) {
    const error = `Open ${DEGIRO_TRADER_ORIGIN} in a tab to sync.`;
    if (wipeOnError) {
      const snapshot = emptySnapshot("", "unknown");
      snapshot.error = error;
      await writeSnapshot(snapshot);
    }
    return { ok: false, error };
  }

  try {
    const response = (await chrome.tabs.sendMessage(
      traderTab.id,
      message,
    )) as ExtensionResponse;

    if (!response?.ok) {
      const error = response?.error ?? "Content script did not respond.";
      if (wipeOnError) {
        const snapshot = emptySnapshot(traderTab.url ?? "", "trader");
        snapshot.error = error;
        await writeSnapshot(snapshot);
      }
      return { ok: false, error };
    }

    await writeSnapshot(response.snapshot);
    return response;
  } catch {
    const error =
      "Degiroid is not injected yet. Refresh the DEGIRO trader tab.";
    if (wipeOnError) {
      const snapshot = emptySnapshot(traderTab.url ?? "", "trader");
      snapshot.error = error;
      await writeSnapshot(snapshot);
    }
    return { ok: false, error };
  }
}

async function askActiveDegiroTabToSync(): Promise<DegiroSessionSnapshot> {
  const response = await askActiveDegiroTab(
    { type: "DEGIROID_SYNC_NOW" },
    { wipeSnapshotOnError: true },
  );
  if (!response.ok) {
    return readSnapshot();
  }
  return response.snapshot;
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
      case "DEGIROID_PLACE_STOP_LOSS":
        return askActiveDegiroTab(message);
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
