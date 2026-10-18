import { useCallback, useEffect, useState } from "react";
import type { DegiroSessionSnapshot } from "@/shared/degiro";
import { isExtensionMessage } from "@/shared/messaging";
import type { ExtensionMessage, ExtensionResponse } from "@/shared/messaging";

const EMPTY_SNAPSHOT: DegiroSessionSnapshot = {
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
  error: null,
};

function offlineSnapshot(error: string): DegiroSessionSnapshot {
  return { ...EMPTY_SNAPSHOT, error };
}

type SendResult =
  | { ok: true; snapshot: DegiroSessionSnapshot }
  | { ok: false; error: string };

async function send(message: ExtensionMessage): Promise<SendResult> {
  const response = (await chrome.runtime.sendMessage(
    message,
  )) as ExtensionResponse | undefined;
  if (!response?.ok) {
    return {
      ok: false,
      error: response?.error ?? "No response from extension background.",
    };
  }
  return { ok: true, snapshot: response.snapshot };
}

export function useExtensionSnapshot() {
  const [snapshot, setSnapshot] =
    useState<DegiroSessionSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    let cancelled = false;

    const onMessage = (message: unknown) => {
      if (!isExtensionMessage(message)) return;
      if (message.type === "DEGIROID_SNAPSHOT_UPDATED") {
        setSnapshot(message.snapshot);
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);

    void (async () => {
      for (const type of [
        "DEGIROID_GET_SNAPSHOT",
        "DEGIROID_SYNC_NOW",
      ] as const) {
        const result = await send({ type });
        if (cancelled) return;
        if (!result.ok) {
          setSnapshot(offlineSnapshot(result.error));
          return;
        }
        setSnapshot(result.snapshot);
      }
    })();

    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, []);

  const syncNow = useCallback(() => {
    void send({ type: "DEGIROID_SYNC_NOW" }).then((result) => {
      if (!result.ok) {
        setSnapshot(offlineSnapshot(result.error));
        return;
      }
      setSnapshot(result.snapshot);
    });
  }, []);

  const openTrader = useCallback(() => {
    void send({ type: "DEGIROID_OPEN_TRADER" }).then((result) => {
      if (!result.ok) {
        setSnapshot(offlineSnapshot(result.error));
        return;
      }
      setSnapshot(result.snapshot);
    });
  }, []);

  return { snapshot, syncNow, openTrader };
}
